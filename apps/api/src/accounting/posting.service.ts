import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Money, uuidv5 } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { AppError } from '../common/errors';

/** Namespace for deterministic journal ids: the same source document always maps to the same entry id. */
const JOURNAL_NAMESPACE = '6f1a3c7e-2b4d-5e8f-9a0b-1c2d3e4f5a6b';

export interface PostingLine {
  accountId: string;
  debit?: string;
  credit?: string;
  branchId?: string | null;
  description?: string;
}

export interface PostingRequest {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  purpose: string;
  /** Accounting date YYYY-MM-DD (business date of the source document). */
  date: string;
  currency: string;
  memo?: string;
  postedBy?: string | null;
  lines: PostingLine[];
  /**
   * How the entry's period is chosen. `late` (system documents, default): a closed or soft-closed period sends
   * the entry to the first open period after it, keeping `original_date`. `strict` (manual entries): the
   * date's own period must be open — or soft-closed when `allowSoftClosed`. `yearClose`: the closing entry of a
   * fiscal year, dated its last day, into that (closed) period.
   */
  period?: { mode: 'late' } | { mode: 'strict'; allowSoftClosed: boolean } | { mode: 'yearClose' };
  /** The entry this one reverses (one reversal per entry, enforced by a unique index). */
  reversalOfId?: string;
}

export interface PostingResult {
  id: string;
  number: string;
  entryDate: string;
  /** True when the document's period was closed and the entry went to the first open period. */
  late: boolean;
}

/** Errors the caller may fix in configuration (then retry the same operation). */
export class PostingConfigError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
  }
}

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The only writer of journal entries (doc 07). Must run inside the caller's transaction so a document and
 * its entry commit together (ADR-0007). Balanced by service check here and by a deferred DB trigger.
 */
@Injectable()
export class PostingService {
  async post(tx: Tx, req: PostingRequest): Promise<PostingResult> {
    const lines = req.lines
      .map((l) => ({
        ...l,
        debit: Money.of(l.debit ?? '0', req.currency).round(),
        credit: Money.of(l.credit ?? '0', req.currency).round(),
      }))
      .filter((l) => !l.debit.isZero() || !l.credit.isZero());
    const debit = Money.sum(
      lines.map((l) => l.debit),
      req.currency,
    );
    const credit = Money.sum(
      lines.map((l) => l.credit),
      req.currency,
    );
    if (lines.length < 2 || !debit.equals(credit) || debit.isZero()) {
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'posting.unbalanced',
        'Posting rule produced an unbalanced entry',
        {
          debit: debit.toString(true),
          credit: credit.toString(true),
        },
      );
    }

    const { period, late } = await this.lockedPeriodFor(tx, req.tenantId, req.date, req.period ?? { mode: 'late' });
    const entryDate = late ? ymd(period.startDate) : req.date;
    const id = uuidv5(`${req.tenantId}:${req.sourceType}:${req.sourceId}:${req.purpose}`, JOURNAL_NAMESPACE);
    const number = await this.nextNumber(tx, req.tenantId, entryDate.slice(0, 4));

    await tx.journalEntry.create({
      data: {
        id,
        tenantId: req.tenantId,
        number,
        entryDate: toDate(entryDate),
        originalDate: late ? toDate(req.date) : null,
        periodId: period.id,
        sourceType: req.sourceType,
        sourceId: req.sourceId,
        purpose: req.purpose,
        status: 'draft',
        memo: req.memo,
        reversalOfId: req.reversalOfId ?? null,
      },
    });
    await tx.journalLine.createMany({
      data: lines.map((l, i) => ({
        id: uuidv5(`line:${i + 1}`, id),
        tenantId: req.tenantId,
        journalEntryId: id,
        lineNo: i + 1,
        accountId: l.accountId,
        debit: new Prisma.Decimal(l.debit.toString(true)),
        credit: new Prisma.Decimal(l.credit.toString(true)),
        currencyCode: req.currency,
        branchId: l.branchId ?? null,
        description: l.description,
      })),
    });
    await tx.journalEntry.update({
      where: { id },
      data: { status: 'posted', postedAt: new Date(), postedBy: req.postedBy ?? null },
    });
    return { id, number, entryDate, late };
  }

  /** Account for a mapping key; the most specific scope wins, then the tenant default. */
  async resolve(tx: Tx, tenantId: string, mappingKey: string, scope?: { type: string; id: string }): Promise<string> {
    const rows = await tx.accountingMapping.findMany({ where: { tenantId, mappingKey } });
    const specific = scope && rows.find((r) => r.scopeType === scope.type && r.scopeId === scope.id);
    const fallback = rows.find((r) => r.scopeType === 'tenant');
    const row = specific ?? fallback;
    if (!row) {
      throw new PostingConfigError('posting_mapping_missing', `No account is mapped for "${mappingKey}"`, {
        mappingKey,
        scope,
      });
    }
    return row.accountId;
  }

  /**
   * The period chosen for the entry, share-locked until commit: a concurrent close of that period waits for this
   * entry, and if a close committed first the choice is made again on the new status (the database trigger
   * takes the same lock, so no entry can ever commit into a closed period).
   */
  private async lockedPeriodFor(tx: Tx, tenantId: string, date: string, mode: NonNullable<PostingRequest['period']>) {
    for (let attempt = 0; ; attempt++) {
      const choice = await this.periodFor(tx, tenantId, date, mode);
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM accounting_periods WHERE id = ${choice.period.id}::uuid FOR SHARE`;
      if (locked?.status === choice.period.status || attempt === 2) return choice;
    }
  }

  private async periodFor(tx: Tx, tenantId: string, date: string, mode: NonNullable<PostingRequest['period']>) {
    const d = toDate(date);
    const find = () =>
      tx.accountingPeriod.findFirst({ where: { tenantId, startDate: { lte: d }, endDate: { gte: d } } });
    let containing = await find();
    if (!containing && (await this.ensureYearsThrough(tx, tenantId, Number(date.slice(0, 4)))))
      containing = await find();

    if (mode.mode === 'yearClose') {
      if (!containing) throw new PostingConfigError('accounting.noOpenPeriod', `No period for ${date}`, { date });
      return { period: containing, late: false };
    }
    if (mode.mode === 'strict') {
      if (!containing)
        throw new PostingConfigError('accounting.noOpenPeriod', `No accounting period for ${date}`, { date });
      if (containing.status === 'open') return { period: containing, late: false };
      if (containing.status === 'soft_closed' && mode.allowSoftClosed) return { period: containing, late: false };
      throw containing.status === 'closed'
        ? new PostingConfigError('accounting.periodClosed', `The accounting period of ${date} is closed`, { date })
        : new AppError(HttpStatus.FORBIDDEN, 'accounting.periodSoftClosed', `The period of ${date} is soft-closed`, {
            date,
          });
    }
    if (containing?.status === 'open') return { period: containing, late: false };
    // Closed (or missing) period: post into the first open period after the date (doc 07 §8 item 6).
    const nextOpen = () =>
      tx.accountingPeriod.findFirst({
        where: { tenantId, status: 'open', startDate: { gt: d } },
        orderBy: { startDate: 'asc' },
      });
    let next = await nextOpen();
    // December with the year's last period closed: the next fiscal year is created on demand.
    if (!next && (await this.ensureYearsThrough(tx, tenantId, Number(date.slice(0, 4)) + 1))) next = await nextOpen();
    if (!next)
      throw new PostingConfigError('accounting.noOpenPeriod', `No open accounting period for ${date}`, { date });
    return { period: next, late: true };
  }

  /**
   * Creates the calendar fiscal years (twelve monthly periods each) after the tenant's latest one, up to
   * `year` — but never beyond next calendar year, so a mistyped date cannot open decades of periods.
   * Concurrent callers are safe (ON CONFLICT). Returns whether any year was added.
   */
  async ensureYearsThrough(tx: Tx, tenantId: string, year: number, now = new Date()): Promise<boolean> {
    if (year > now.getUTCFullYear() + 1) return false;
    const latest = await tx.fiscalYear.findFirst({ where: { tenantId }, orderBy: { endDate: 'desc' } });
    if (!latest || latest.endDate.getUTCFullYear() >= year) return false;
    for (let y = latest.endDate.getUTCFullYear() + 1; y <= year; y++) await this.createCalendarYear(tx, tenantId, y);
    return true;
  }

  async createCalendarYear(tx: Tx, tenantId: string, year: number) {
    await tx.$executeRaw`
      INSERT INTO fiscal_years (id, tenant_id, name, start_date, end_date, updated_at)
      VALUES (gen_random_uuid(), ${tenantId}::uuid, ${`FY${year}`}, ${`${year}-01-01`}::date, ${`${year}-12-31`}::date, now())
      ON CONFLICT (tenant_id, name) DO NOTHING`;
    const fy = await tx.fiscalYear.findFirstOrThrow({ where: { tenantId, name: `FY${year}` } });
    for (let m = 0; m < 12; m++) {
      const start = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(year, m + 1, 0)).toISOString().slice(0, 10);
      await tx.$executeRaw`
        INSERT INTO accounting_periods (id, tenant_id, fiscal_year_id, period_no, start_date, end_date, updated_at)
        VALUES (gen_random_uuid(), ${tenantId}::uuid, ${fy.id}::uuid, ${m + 1}, ${start}::date, ${end}::date, now())
        ON CONFLICT (fiscal_year_id, period_no) DO NOTHING`;
    }
    return fy;
  }

  private async nextNumber(tx: Tx, tenantId: string, year: string) {
    const rows = await tx.$queryRaw<{ value: bigint }[]>`
      INSERT INTO document_sequences (tenant_id, doc_type, scope_key, next_value)
      VALUES (${tenantId}::uuid, 'journal_entry', ${year}, 2)
      ON CONFLICT (tenant_id, doc_type, scope_key) DO UPDATE SET next_value = document_sequences.next_value + 1
      RETURNING next_value - 1 AS value`;
    return `JE-${year}-${String(rows[0]!.value).padStart(6, '0')}`;
  }
}
