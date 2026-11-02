import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JournalReverseInput, ManualJournalCreateInput } from '@ros/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { PostingService, type PostingLine } from '../accounting/posting.service';
import { baseCurrency, postingMoment } from '../inventory/stock-helpers';
import { badRequest, conflict, isUniqueViolation, notFound } from '../common/errors';
import type { TenantContext } from '../common/auth-context';
import { requireAllBranches } from './finance.helpers';

const ZERO = new Prisma.Decimal(0);
const dec = (v?: string) => new Prisma.Decimal(v && v.trim() ? v : '0');

/**
 * Manual journal entries and reversals (doc 07 I3/I4). Manual entries post at once into the date's own period
 * (strict: closed → 422, soft-closed → needs `accounting.post_in_soft_closed`). They may not touch control
 * accounts, whose balances belong to a sub-ledger (payables, GRNI). A posted entry is corrected only by its
 * single reversal, which mirrors every line.
 */
@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  detail(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, (tx) => this.load(tx, auth.tenantId, id));
  }

  async createManual(auth: TenantContext, input: ManualJournalCreateInput) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({ where: { tenantId, id: { in: accountIds } } });
      for (const id of accountIds) {
        const a = accounts.find((x) => x.id === id);
        if (!a || !a.isPostable || a.archivedAt || a.isControl)
          throw badRequest('journal.invalidAccount', 'Choose active, postable accounts that are not control accounts', {
            accountId: id,
          });
      }
      const branchIds = [...new Set(input.lines.flatMap((l) => (l.branchId ? [l.branchId] : [])))];
      if (
        branchIds.length &&
        (await tx.branch.count({ where: { tenantId, id: { in: branchIds } } })) !== branchIds.length
      )
        throw badRequest('journal.invalidBranch', 'Branch not found');
      const debit = input.lines.reduce((s, l) => s.plus(dec(l.debit)), ZERO);
      const credit = input.lines.reduce((s, l) => s.plus(dec(l.credit)), ZERO);
      if (!debit.equals(credit) || debit.isZero())
        throw badRequest('journal.unbalanced', 'Debits and credits must be equal and not zero', {
          debit: debit.toFixed(2),
          credit: credit.toFixed(2),
        });
      const entry = await this.posting.post(tx, {
        tenantId,
        sourceType: 'manual',
        sourceId: randomUUID(),
        purpose: 'main',
        date: input.date,
        currency: await baseCurrency(tx, tenantId),
        memo: input.memo,
        postedBy: auth.userId,
        lines: input.lines.map((l): PostingLine => ({
          accountId: l.accountId,
          debit: dec(l.debit).isZero() ? undefined : dec(l.debit).toFixed(2),
          credit: dec(l.credit).isZero() ? undefined : dec(l.credit).toFixed(2),
          branchId: l.branchId ?? null,
          description: l.description,
        })),
        period: { mode: 'strict', allowSoftClosed: auth.permissions.includes('accounting.post_in_soft_closed') },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'journal.manualPosted',
        entityType: 'journal_entry',
        entityId: entry.id,
        changes: { number: entry.number, date: input.date, total: debit.toFixed(2) },
      });
      return this.load(tx, tenantId, entry.id);
    });
  }

  async reverse(auth: TenantContext, id: string, input: JournalReverseInput) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const original = await tx.journalEntry.findFirst({ where: { id, tenantId }, include: { lines: true } });
        if (!original) throw notFound('journal_entries');
        // Sales, purchases and stock entries belong to their documents: they are corrected through those flows.
        if (original.status !== 'posted' || original.sourceType !== 'manual')
          throw badRequest('journal.notReversible', 'Only posted manual entries can be reversed here');
        if (await tx.journalEntry.findFirst({ where: { reversalOfId: id } }))
          throw conflict('journal.alreadyReversed', 'This entry has already been reversed');
        const date = input.date ?? (await postingMoment(tx, tenantId, null)).businessDate;
        if (date < original.entryDate.toISOString().slice(0, 10))
          throw badRequest('journal.reversalBeforeOriginal', 'A reversal cannot be dated before the original entry');
        const entry = await this.posting.post(tx, {
          tenantId,
          sourceType: 'reversal',
          sourceId: original.id,
          purpose: 'main',
          date,
          currency: await baseCurrency(tx, tenantId),
          memo: input.memo ?? `Reversal of ${original.number}`,
          postedBy: auth.userId,
          reversalOfId: original.id,
          lines: original.lines
            .sort((a, b) => a.lineNo - b.lineNo)
            .map((l) => ({
              accountId: l.accountId,
              debit: l.credit.isZero() ? undefined : l.credit.toFixed(2),
              credit: l.debit.isZero() ? undefined : l.debit.toFixed(2),
              branchId: l.branchId,
              description: l.description ?? undefined,
            })),
          period: { mode: 'strict', allowSoftClosed: auth.permissions.includes('accounting.post_in_soft_closed') },
        });
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'journal.reversed',
          entityType: 'journal_entry',
          entityId: original.id,
          changes: { reversal: entry.number, date },
        });
        return this.load(tx, tenantId, entry.id);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('journal.alreadyReversed', 'This entry has already been reversed');
      throw err;
    }
  }

  private async load(tx: Tx, tenantId: string, id: string) {
    const entry = await tx.journalEntry.findFirst({
      where: { id, tenantId },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!entry) throw notFound('journal_entries');
    const accounts = await tx.account.findMany({
      where: { id: { in: entry.lines.map((l) => l.accountId) } },
      select: { id: true, code: true, nameEn: true, nameAr: true },
    });
    const reversedBy = await tx.journalEntry.findFirst({
      where: { reversalOfId: id },
      select: { id: true, number: true },
    });
    return {
      ...entry,
      lines: entry.lines.map((l) => ({ ...l, account: accounts.find((a) => a.id === l.accountId) })),
      reversedBy,
    };
  }
}
