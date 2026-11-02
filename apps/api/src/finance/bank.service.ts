import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { BankMatchInput, BankPostLineInput, BankStatementCreateInput, BankUnmatchInput } from '@ros/contracts';
import { childId } from '@ros/domain';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { PostingService } from '../accounting/posting.service';
import { baseCurrency } from '../inventory/stock-helpers';
import { badRequest, conflict, isUniqueViolation, notFound } from '../common/errors';
import type { TenantContext } from '../common/auth-context';
import { requireAllBranches, ymd } from './finance.helpers';

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const BANK_SUBTYPES = ['bank', 'clearing'];
/** Auto-match accepts a book line up to this many days before or after the bank date. */
const AUTO_MATCH_DAYS = 3;

interface BookLine {
  id: string;
  entry_id: string;
  number: string;
  entry_date: Date;
  memo: string | null;
  description: string | null;
  amount: Decimal;
}

/**
 * Bank reconciliation (P6-7). A statement is imported as the bank printed it; each of its lines is matched to
 * one posted journal line on the same account for the same signed amount (debit − credit), checked again by a
 * database trigger, and a journal line can be matched only once. Lines the books do not have yet (fees,
 * interest) are posted from the statement and matched in one step. Completing needs every bank line matched;
 * the statement is then frozen. Unmatched bank lines and unmatched book lines always stay visible.
 */
@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  list(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const statements = await tx.bankStatement.findMany({
        where: { tenantId: auth.tenantId },
        include: { lines: { select: { journalLineId: true } } },
        orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      });
      return statements.map(({ lines, ...s }) => ({
        ...s,
        lineCount: lines.length,
        matchedCount: lines.filter((l) => l.journalLineId).length,
      }));
    });
  }

  async create(auth: TenantContext, input: BankStatementCreateInput) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const account = await tx.account.findFirst({ where: { id: input.accountId, tenantId } });
        if (
          !account ||
          account.type !== 'asset' ||
          !BANK_SUBTYPES.includes(account.subtype ?? '') ||
          !account.isPostable
        )
          throw badRequest('bank.invalidAccount', 'Choose a bank or clearing account');
        const computed = input.lines.reduce((s, l) => s.plus(l.amount), D(input.openingBalance));
        if (!computed.equals(D(input.closingBalance)))
          throw badRequest(
            'bankStatements.totalsMismatch',
            'Opening balance plus the lines must equal the closing balance',
            {
              computed: computed.toFixed(2),
            },
          );
        const id = randomUUID();
        await tx.bankStatement.create({
          data: {
            id,
            tenantId,
            accountId: account.id,
            reference: input.reference,
            startDate: new Date(`${input.startDate}T00:00:00Z`),
            endDate: new Date(`${input.endDate}T00:00:00Z`),
            openingBalance: D(input.openingBalance),
            closingBalance: D(input.closingBalance),
            createdBy: auth.userId,
            lines: {
              create: input.lines.map((l, i) => ({
                id: childId(id, `line:${i + 1}`),
                tenantId,
                lineNo: i + 1,
                txnDate: new Date(`${l.date}T00:00:00Z`),
                description: l.description,
                reference: l.reference,
                amount: D(l.amount),
              })),
            },
          },
        });
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'bank_statement.imported',
          entityType: 'bank_statement',
          entityId: id,
          changes: { reference: input.reference, account: account.code, lines: input.lines.length },
        });
        return this.load(tx, tenantId, id);
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('bankStatements.duplicate', 'A statement with this reference exists for the account');
      throw err;
    }
  }

  detail(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, (tx) => this.load(tx, auth.tenantId, id));
  }

  match(auth: TenantContext, id: string, input: BankMatchInput) {
    return this.change(auth, id, async (tx, statement) => {
      const line = this.openLine(statement, input.lineId);
      const [book] = await this.bookLines(tx, auth.tenantId, statement.accountId, { ids: [input.journalLineId] });
      if (!book) throw notFound('journal_lines');
      if (!book.amount.equals(line.amount))
        throw badRequest('bank.amountMismatch', 'The journal line has a different amount', {
          bank: line.amount.toFixed(2),
          book: book.amount.toFixed(2),
        });
      if (await tx.bankStatementLine.findFirst({ where: { journalLineId: book.id } }))
        throw conflict('bank.bookLineMatched', 'This journal line is already matched to another bank line');
      await this.setMatch(tx, auth, line.id, book.id);
    });
  }

  unmatch(auth: TenantContext, id: string, input: BankUnmatchInput) {
    return this.change(auth, id, async (tx, statement) => {
      const line = statement.lines.find((l) => l.id === input.lineId);
      if (!line) throw notFound('bank_statement_lines');
      if (!line.journalLineId) throw badRequest('bank.lineNotMatched', 'This bank line is not matched');
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: { journalLineId: null, matchedAt: null, matchedBy: null },
      });
    });
  }

  /** Matches each unmatched bank line that has exactly one free book line with its amount within ±3 days. */
  autoMatch(auth: TenantContext, id: string) {
    let matched = 0;
    return this.change(auth, id, async (tx, statement) => {
      const free = await this.bookLines(tx, auth.tenantId, statement.accountId, { unmatchedOnly: true });
      const taken = new Set<string>();
      for (const line of statement.lines.filter((l) => !l.journalLineId)) {
        const near = free.filter(
          (b) =>
            !taken.has(b.id) &&
            b.amount.equals(line.amount) &&
            Math.abs(b.entry_date.getTime() - line.txnDate.getTime()) <= AUTO_MATCH_DAYS * 86_400_000,
        );
        if (near.length !== 1) continue; // none, or ambiguous: left for the user
        taken.add(near[0]!.id);
        await this.setMatch(tx, auth, line.id, near[0]!.id);
        matched++;
      }
    }).then((statement) => ({ ...statement, autoMatched: matched }));
  }

  /** Posts a bank-only line (fee, interest) against `accountId` on the line's date, and matches it. */
  postLine(auth: TenantContext, id: string, input: BankPostLineInput) {
    const tenantId = auth.tenantId;
    return this.change(auth, id, async (tx, statement) => {
      const line = this.openLine(statement, input.lineId);
      const account = await tx.account.findFirst({ where: { id: input.accountId, tenantId } });
      if (
        !account ||
        !account.isPostable ||
        account.archivedAt ||
        account.isControl ||
        account.id === statement.accountId
      )
        throw badRequest('journal.invalidAccount', 'Choose an active, postable account other than the bank account');
      const amount = line.amount.abs().toFixed(2);
      const inflow = line.amount.isPositive();
      const entry = await this.posting.post(tx, {
        tenantId,
        sourceType: 'bank_statement_line',
        sourceId: line.id,
        purpose: 'main',
        date: ymd(line.txnDate),
        currency: await baseCurrency(tx, tenantId),
        memo: input.memo ?? `${statement.reference} · ${line.description}`,
        postedBy: auth.userId,
        lines: [
          {
            accountId: statement.accountId,
            debit: inflow ? amount : undefined,
            credit: inflow ? undefined : amount,
            branchId: input.branchId ?? null,
            description: line.description,
          },
          {
            accountId: account.id,
            debit: inflow ? undefined : amount,
            credit: inflow ? amount : undefined,
            branchId: input.branchId ?? null,
            description: line.description,
          },
        ],
        period: { mode: 'strict', allowSoftClosed: auth.permissions.includes('accounting.post_in_soft_closed') },
      });
      const bankLine = await tx.journalLine.findFirstOrThrow({
        where: { journalEntryId: entry.id, accountId: statement.accountId },
      });
      await this.setMatch(tx, auth, line.id, bankLine.id);
    });
  }

  complete(auth: TenantContext, id: string) {
    return this.change(auth, id, async (tx, statement) => {
      const open = statement.lines.filter((l) => !l.journalLineId).length;
      if (open) throw badRequest('bankStatements.unmatched', 'Match or post every bank line first', { open });
      await tx.bankStatement.update({
        where: { id },
        data: { status: 'reconciled', reconciledAt: new Date(), reconciledBy: auth.userId },
      });
      await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
        action: 'bank_statement.reconciled',
        entityType: 'bank_statement',
        entityId: id,
        changes: { reference: statement.reference },
      });
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Locks the open statement, applies `fn`, returns the refreshed detail. */
  private change(
    auth: TenantContext,
    id: string,
    fn: (tx: Tx, statement: Prisma.BankStatementGetPayload<{ include: { lines: true } }>) => Promise<void>,
  ) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    return this.prisma
      .withTenant(tenantId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM bank_statements WHERE id = ${id}::uuid FOR UPDATE`;
        const statement = await tx.bankStatement.findFirst({
          where: { id, tenantId },
          include: { lines: { orderBy: { lineNo: 'asc' } } },
        });
        if (!statement) throw notFound('bank_statements');
        if (statement.status !== 'open') throw badRequest('invalid_state_transition', 'The statement is reconciled');
        await fn(tx, statement);
        return this.load(tx, tenantId, id);
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err))
          throw conflict('bank.bookLineMatched', 'This journal line is already matched to another bank line');
        throw err;
      });
  }

  private openLine<L extends { id: string; journalLineId: string | null; amount: Decimal }>(
    statement: { lines: L[] },
    lineId: string,
  ): L {
    const line = statement.lines.find((l) => l.id === lineId);
    if (!line) throw notFound('bank_statement_lines');
    if (line.journalLineId) throw conflict('bank.lineMatched', 'This bank line is already matched');
    return line;
  }

  private setMatch(tx: Tx, auth: TenantContext, lineId: string, journalLineId: string) {
    return tx.bankStatementLine.update({
      where: { id: lineId },
      data: { journalLineId, matchedAt: new Date(), matchedBy: auth.userId },
    });
  }

  /** Posted journal lines on the account as signed amounts (debit − credit), with their entry. */
  private bookLines(
    tx: Tx,
    tenantId: string,
    accountId: string,
    o: { ids?: string[]; unmatchedOnly?: boolean; until?: string },
  ) {
    return tx.$queryRaw<BookLine[]>`
      SELECT l.id, e.id AS entry_id, e.number, e.entry_date, e.memo, l.description, l.debit - l.credit AS amount
      FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      WHERE l.tenant_id = ${tenantId}::uuid AND l.account_id = ${accountId}::uuid
        AND (${o.ids ?? null}::uuid[] IS NULL OR l.id = ANY(${o.ids ?? null}::uuid[]))
        AND (NOT ${o.unmatchedOnly ?? false} OR NOT EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.journal_line_id = l.id))
        AND (${o.until ?? null}::date IS NULL OR e.entry_date <= ${o.until ?? null}::date)
      ORDER BY e.entry_date, e.number, l.line_no
      LIMIT 2000`;
  }

  /**
   * Statement with its lines (and their matched book line), the account's unmatched book lines up to a month
   * after the statement (candidates and outstanding items), and the summary
   * ledger balance at end date − unmatched book lines up to end date + unmatched bank lines = expected closing.
   * The difference to the printed closing balance is informational: book lines from before the first imported
   * statement are always "unmatched".
   */
  private async load(tx: Tx, tenantId: string, id: string) {
    const statement = await tx.bankStatement.findFirst({
      where: { id, tenantId },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!statement) throw notFound('bank_statements');
    const account = await tx.account.findUniqueOrThrow({
      where: { id: statement.accountId },
      select: { id: true, code: true, nameEn: true, nameAr: true },
    });
    const matchedIds = statement.lines.flatMap((l) => (l.journalLineId ? [l.journalLineId] : []));
    const matched = matchedIds.length
      ? await this.bookLines(tx, tenantId, statement.accountId, { ids: matchedIds })
      : [];
    const end = ymd(statement.endDate);
    const horizon = ymd(new Date(statement.endDate.getTime() + 31 * 86_400_000));
    const open = await this.bookLines(tx, tenantId, statement.accountId, { unmatchedOnly: true, until: horizon });
    const [ledger] = await tx.$queryRaw<{ v: Decimal | null }[]>`
      SELECT sum(l.debit - l.credit) AS v FROM journal_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      WHERE l.tenant_id = ${tenantId}::uuid AND l.account_id = ${statement.accountId}::uuid AND e.entry_date <= ${end}::date`;
    const ledgerBalance = ledger?.v ?? ZERO;
    const outstandingBook = open.filter((b) => ymd(b.entry_date) <= end).reduce((s, b) => s.plus(b.amount), ZERO);
    const unrecordedBank = statement.lines.filter((l) => !l.journalLineId).reduce((s, l) => s.plus(l.amount), ZERO);
    const expected = ledgerBalance.minus(outstandingBook).plus(unrecordedBank);
    const book = (b: BookLine) => ({
      id: b.id,
      entryId: b.entry_id,
      number: b.number,
      date: ymd(b.entry_date),
      memo: b.memo,
      description: b.description,
      amount: b.amount.toFixed(2),
    });
    return {
      ...statement,
      account,
      lines: statement.lines.map((l) => {
        const m = matched.find((b) => b.id === l.journalLineId);
        return { ...l, amount: l.amount.toFixed(2), match: m ? book(m) : null };
      }),
      bookLines: open.map(book),
      summary: {
        ledgerBalance: ledgerBalance.toFixed(2),
        outstandingBook: outstandingBook.toFixed(2),
        unrecordedBank: unrecordedBank.toFixed(2),
        expectedClosing: expected.toFixed(2),
        closingBalance: statement.closingBalance.toFixed(2),
        difference: statement.closingBalance.minus(expected).toFixed(2),
        unmatchedLines: statement.lines.filter((l) => !l.journalLineId).length,
      },
    };
  }
}
