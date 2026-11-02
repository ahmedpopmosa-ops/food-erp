import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PeriodReopenInput } from '@ros/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { PostingService, type PostingLine } from '../accounting/posting.service';
import { baseCurrency } from '../inventory/stock-helpers';
import { badRequest, conflict, notFound } from '../common/errors';
import type { TenantContext } from '../common/auth-context';
import { requireAllBranches, ymd } from './finance.helpers';

/**
 * Accounting periods and fiscal years (doc 07 §2, §3.7). Periods move open → soft_closed → closed in date order
 * and reopen from the latest closed one backwards (permission + reason, audited). Closing a fiscal year needs
 * every period of it closed and the previous year closed; its closing entry moves each P&L balance, per branch,
 * to retained earnings. After that the year and its periods are frozen (database triggers).
 */
@Injectable()
export class PeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  fiscalYears(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.fiscalYear.findMany({
        where: { tenantId: auth.tenantId },
        include: { periods: { orderBy: { periodNo: 'asc' } } },
        orderBy: { startDate: 'desc' },
      }),
    );
  }

  /** Opens the calendar year after the latest one (at most next calendar year). */
  nextYear(auth: TenantContext) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const latest = await tx.fiscalYear.findFirst({ where: { tenantId }, orderBy: { endDate: 'desc' } });
      if (!latest) throw notFound('fiscal_years');
      const year = latest.endDate.getUTCFullYear() + 1;
      if (year > new Date().getUTCFullYear() + 1)
        throw conflict('fiscalYears.alreadyAhead', 'Next year is already open; later years open automatically');
      const fy = await this.posting.createCalendarYear(tx, tenantId, year);
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'fiscal_year.opened',
        entityType: 'fiscal_year',
        entityId: fy.id,
        changes: { name: fy.name },
      });
      return tx.fiscalYear.findUniqueOrThrow({
        where: { id: fy.id },
        include: { periods: { orderBy: { periodNo: 'asc' } } },
      });
    });
  }

  softClose(auth: TenantContext, id: string) {
    return this.transition(auth, id, ['open'], 'soft_closed', async () => {});
  }

  /** Closes a soft-closed period; every earlier period of the tenant must already be closed. */
  close(auth: TenantContext, id: string) {
    return this.transition(auth, id, ['soft_closed'], 'closed', async (tx, period) => {
      const earlier = await tx.accountingPeriod.count({
        where: { tenantId: auth.tenantId, startDate: { lt: period.startDate }, status: { not: 'closed' } },
      });
      if (earlier) throw badRequest('periods.earlierOpen', 'Close the earlier periods first', { open: earlier });
    });
  }

  /** Reopens from the latest closed period backwards, never inside a closed fiscal year. */
  reopen(auth: TenantContext, id: string, input: PeriodReopenInput) {
    return this.transition(
      auth,
      id,
      ['soft_closed', 'closed'],
      'open',
      async (tx, period) => {
        const later = await tx.accountingPeriod.count({
          where: { tenantId: auth.tenantId, startDate: { gt: period.startDate }, status: 'closed' },
        });
        if (later) throw badRequest('periods.laterClosed', 'Reopen the later closed periods first', { closed: later });
      },
      input.reason,
    );
  }

  private transition(
    auth: TenantContext,
    id: string,
    from: string[],
    to: 'open' | 'soft_closed' | 'closed',
    check: (tx: Tx, period: { startDate: Date }) => Promise<void>,
    reason?: string,
  ) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Locked: two closes (or a close and a reopen) of neighbouring periods serialise on the tenant's years.
      await tx.$queryRaw`SELECT id FROM fiscal_years WHERE tenant_id = ${tenantId}::uuid ORDER BY start_date FOR UPDATE`;
      const period = await tx.accountingPeriod.findFirst({ where: { id, tenantId }, include: { fiscalYear: true } });
      if (!period) throw notFound('accounting_periods');
      if (period.fiscalYear.status === 'closed')
        throw badRequest('periods.yearClosed', 'The fiscal year of this period is closed');
      if (!from.includes(period.status)) throw badRequest('invalid_state_transition', `Period is ${period.status}`);
      await check(tx, period);
      const updated = await tx.accountingPeriod.update({
        where: { id },
        data:
          to === 'closed'
            ? { status: to, closedAt: new Date(), closedBy: auth.userId }
            : to === 'open'
              ? { status: to, closedAt: null, closedBy: null }
              : { status: to },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: `accounting_period.${to === 'open' ? 'reopened' : to}`,
        entityType: 'accounting_period',
        entityId: id,
        changes: { from: period.status, to, period: `${period.fiscalYear.name}/${period.periodNo}`, reason },
      });
      return updated;
    });
  }

  /** Pre-close checklist (doc 07 §3.7): what is still unsettled in or before the period. Nothing here blocks. */
  checklist(auth: TenantContext, id: string) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const period = await tx.accountingPeriod.findFirst({ where: { id, tenantId }, include: { fiscalYear: true } });
      if (!period) throw notFound('accounting_periods');
      const end = period.endDate;
      const [discrepancies] = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM sale_discrepancies d JOIN invoices i ON i.id = d.invoice_id
        WHERE d.tenant_id = ${tenantId}::uuid AND d.status = 'open' AND i.business_date <= ${ymd(end)}::date`;
      const [uninvoiced] = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM goods_receipt_lines l JOIN goods_receipts r ON r.id = l.receipt_id
        WHERE l.tenant_id = ${tenantId}::uuid AND l.value_cleared < l.goods_value AND r.received_at < ${ymd(end)}::date + 1`;
      const items = [
        { key: 'openDiscrepancies', count: Number(discrepancies!.n) },
        {
          key: 'syncNotApplied',
          count: await tx.syncOperation.count({
            where: {
              tenantId,
              status: { in: ['retryable', 'blocked', 'quarantined'] },
              occurredAt: { lt: dayAfter(end) },
            },
          }),
        },
        {
          key: 'countsInProgress',
          count: await tx.stockCount.count({
            where: { tenantId, status: 'in_progress', createdAt: { lt: dayAfter(end) } },
          }),
        },
        {
          key: 'transfersInTransit',
          count: await tx.stockTransfer.count({ where: { tenantId, status: 'dispatched' } }),
        },
        { key: 'uninvoicedReceiptLines', count: Number(uninvoiced!.n) },
        {
          key: 'draftPurchaseOrders',
          count: await tx.purchaseOrder.count({
            where: { tenantId, status: 'draft', createdAt: { lt: dayAfter(end) } },
          }),
        },
      ];
      return {
        period,
        items: items.map((i) => ({ ...i, ok: i.count === 0 })),
        ready: items.every((i) => i.count === 0),
      };
    });
  }

  /**
   * Year-end close (doc 07 §3.7): one `year_close` entry dated the year's last day reverses every revenue and
   * expense balance of the year per branch into retained earnings. The next year is opened if it is not yet.
   */
  closeYear(auth: TenantContext, id: string) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM fiscal_years WHERE tenant_id = ${tenantId}::uuid ORDER BY start_date FOR UPDATE`;
      const fy = await tx.fiscalYear.findFirst({ where: { id, tenantId }, include: { periods: true } });
      if (!fy) throw notFound('fiscal_years');
      if (fy.status !== 'open') throw badRequest('invalid_state_transition', `Fiscal year is ${fy.status}`);
      if (await tx.fiscalYear.count({ where: { tenantId, endDate: { lt: fy.startDate }, status: 'open' } }))
        throw badRequest('fiscalYears.previousOpen', 'Close the previous fiscal year first');
      const open = fy.periods.filter((p) => p.status !== 'closed').length;
      if (open) throw badRequest('fiscalYears.periodsOpen', 'Close every period of the year first', { open });

      const balances = await tx.$queryRaw<{ account_id: string; branch_id: string | null; balance: Prisma.Decimal }[]>`
        SELECT l.account_id, l.branch_id, sum(l.debit - l.credit) AS balance
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted' AND e.source_type <> 'year_close'
        JOIN accounts a ON a.id = l.account_id AND a.type IN ('revenue', 'expense')
        WHERE l.tenant_id = ${tenantId}::uuid AND e.entry_date BETWEEN ${ymd(fy.startDate)}::date AND ${ymd(fy.endDate)}::date
        GROUP BY l.account_id, l.branch_id
        HAVING sum(l.debit - l.credit) <> 0`;
      const retained = await this.posting.resolve(tx, tenantId, 'retained_earnings');
      const lines: PostingLine[] = [];
      const toRetained = new Map<string | null, Prisma.Decimal>();
      for (const b of balances) {
        lines.push(
          b.balance.isPositive()
            ? { accountId: b.account_id, credit: b.balance.toFixed(2), branchId: b.branch_id }
            : { accountId: b.account_id, debit: b.balance.neg().toFixed(2), branchId: b.branch_id },
        );
        toRetained.set(b.branch_id, (toRetained.get(b.branch_id) ?? new Prisma.Decimal(0)).plus(b.balance));
      }
      for (const [branchId, net] of toRetained) {
        if (net.isZero()) continue;
        // A net debit of P&L (a loss) lowers retained earnings; a profit raises them.
        lines.push(
          net.isPositive()
            ? { accountId: retained, debit: net.toFixed(2), branchId, description: 'Net loss for the year' }
            : { accountId: retained, credit: net.neg().toFixed(2), branchId, description: 'Net profit for the year' },
        );
      }
      const entry = lines.length
        ? await this.posting.post(tx, {
            tenantId,
            sourceType: 'year_close',
            sourceId: fy.id,
            purpose: 'main',
            date: ymd(fy.endDate),
            currency: await baseCurrency(tx, tenantId),
            memo: `Year close ${fy.name}`,
            postedBy: auth.userId,
            lines,
            period: { mode: 'yearClose' },
          })
        : null;
      await this.posting.ensureYearsThrough(tx, tenantId, fy.endDate.getUTCFullYear() + 1);
      await tx.fiscalYear.update({
        where: { id },
        data: { status: 'closed', closingEntryId: entry?.id ?? null, closedAt: new Date(), closedBy: auth.userId },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'fiscal_year.closed',
        entityType: 'fiscal_year',
        entityId: id,
        changes: { name: fy.name, closingEntry: entry?.number ?? null },
      });
      return tx.fiscalYear.findUniqueOrThrow({ where: { id }, include: { periods: { orderBy: { periodNo: 'asc' } } } });
    });
  }
}

const dayAfter = (d: Date) => new Date(d.getTime() + 86_400_000);
