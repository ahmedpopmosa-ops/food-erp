import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GeneralLedgerQuery, StatementRangeQuery } from '@ros/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { postingMoment } from '../inventory/stock-helpers';
import { badRequest, notFound } from '../common/errors';
import type { TenantContext } from '../common/auth-context';
import { requireAllBranches, ymd } from './finance.helpers';

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const sum = (v: Decimal[]) => v.reduce((s, x) => s.plus(x), ZERO);
const CASH_SUBTYPES = ['cash', 'bank', 'clearing'];

interface Row {
  account_id: string;
  code: string;
  name_en: string;
  name_ar: string;
  type: string;
  subtype: string | null;
  debit: Decimal;
  credit: Decimal;
}

/**
 * Financial statements derived from posted journal lines only (P6-5). Year-close entries are left out of the
 * profit and loss and cash flow of the year they close (otherwise every closed year would show zero), but they
 * are part of every balance, so retained earnings roll forward.
 */
@Injectable()
export class StatementsService {
  constructor(private readonly prisma: PrismaService) {}

  profitAndLoss(auth: TenantContext, q: StatementRangeQuery) {
    requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const { from, to } = await this.range(tx, auth.tenantId, q);
      const rows = (
        await this.balances(tx, auth.tenantId, { from, to, excludeYearClose: true, branchId: q.branchId })
      ).filter((r) => r.type === 'revenue' || r.type === 'expense');
      const line = (r: Row) => ({
        accountId: r.account_id,
        code: r.code,
        nameEn: r.name_en,
        nameAr: r.name_ar,
        amount: (r.type === 'revenue' ? r.credit.minus(r.debit) : r.debit.minus(r.credit)).toFixed(2),
      });
      const revenue = rows.filter((r) => r.type === 'revenue');
      const cogs = rows.filter((r) => r.type === 'expense' && r.subtype === 'cogs');
      const expenses = rows.filter((r) => r.type === 'expense' && r.subtype !== 'cogs');
      const total = (rs: Row[]) =>
        sum(rs.map((r) => (r.type === 'revenue' ? r.credit.minus(r.debit) : r.debit.minus(r.credit))));
      const gross = total(revenue).minus(total(cogs));
      return {
        from,
        to,
        branchId: q.branchId ?? null,
        revenue: { lines: revenue.map(line), total: total(revenue).toFixed(2) },
        costOfSales: { lines: cogs.map(line), total: total(cogs).toFixed(2) },
        grossProfit: gross.toFixed(2),
        expenses: { lines: expenses.map(line), total: total(expenses).toFixed(2) },
        netIncome: gross.minus(total(expenses)).toFixed(2),
      };
    });
  }

  balanceSheet(auth: TenantContext, asOfInput?: string) {
    requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const asOf = asOfInput ?? (await postingMoment(tx, auth.tenantId, null)).businessDate;
      const rows = await this.balances(tx, auth.tenantId, { to: asOf, excludeYearClose: false });
      const section = (type: string, debitNormal: boolean) => {
        const rs = rows.filter((r) => r.type === type);
        const amount = (r: Row) => (debitNormal ? r.debit.minus(r.credit) : r.credit.minus(r.debit));
        return {
          lines: rs
            .filter((r) => !amount(r).isZero())
            .map((r) => ({
              accountId: r.account_id,
              code: r.code,
              nameEn: r.name_en,
              nameAr: r.name_ar,
              amount: amount(r).toFixed(2),
            })),
          total: sum(rs.map(amount)),
        };
      };
      const assets = section('asset', true);
      const liabilities = section('liability', false);
      const equity = section('equity', false);
      // Profit of years not closed yet (closed years were moved to retained earnings by their closing entry).
      const earnings = sum(
        rows.filter((r) => r.type === 'revenue' || r.type === 'expense').map((r) => r.credit.minus(r.debit)),
      );
      const right = liabilities.total.plus(equity.total).plus(earnings);
      return {
        asOf,
        assets: { lines: assets.lines, total: assets.total.toFixed(2) },
        liabilities: { lines: liabilities.lines, total: liabilities.total.toFixed(2) },
        equity: { lines: equity.lines, total: equity.total.toFixed(2) },
        currentEarnings: earnings.toFixed(2),
        liabilitiesAndEquity: right.toFixed(2),
        balanced: assets.total.equals(right),
      };
    });
  }

  /**
   * Indirect method: cash change = net income + the change of every other balance-sheet account (an increase
   * of a non-cash asset uses cash, an increase of a liability or equity provides it). Cash and cash equivalents
   * are the accounts of subtype cash, bank or clearing. The identity holds because every entry balances.
   */
  cashFlow(auth: TenantContext, q: StatementRangeQuery) {
    requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const { from, to } = await this.range(tx, auth.tenantId, q);
      const before = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86_400_000);
      const cash = (rs: Row[]) =>
        sum(
          rs
            .filter((r) => r.type === 'asset' && CASH_SUBTYPES.includes(r.subtype ?? ''))
            .map((r) => r.debit.minus(r.credit)),
        );
      const opening = cash(await this.balances(tx, auth.tenantId, { to: ymd(before), excludeYearClose: false }));
      const closing = cash(await this.balances(tx, auth.tenantId, { to, excludeYearClose: false }));
      const rows = await this.balances(tx, auth.tenantId, { from, to, excludeYearClose: true });
      const netIncome = sum(
        rows.filter((r) => r.type === 'revenue' || r.type === 'expense').map((r) => r.credit.minus(r.debit)),
      );
      const movement = (r: Row) => ({
        accountId: r.account_id,
        code: r.code,
        nameEn: r.name_en,
        nameAr: r.name_ar,
        amount: r.credit.minus(r.debit).toFixed(2),
      });
      const nonCash = rows.filter(
        (r) =>
          ['asset', 'liability', 'equity'].includes(r.type) &&
          !(r.type === 'asset' && CASH_SUBTYPES.includes(r.subtype ?? '')),
      );
      const changed = nonCash.filter((r) => !r.credit.minus(r.debit).isZero());
      const financing = changed.filter((r) => r.type === 'equity');
      const investing = changed.filter((r) => r.type === 'asset' && r.subtype === 'fixed_asset');
      const operating = changed.filter((r) => !financing.includes(r) && !investing.includes(r));
      const total = (rs: Row[]) => sum(rs.map((r) => r.credit.minus(r.debit)));
      const net = netIncome.plus(total(operating)).plus(total(investing)).plus(total(financing));
      return {
        from,
        to,
        openingCash: opening.toFixed(2),
        operating: {
          netIncome: netIncome.toFixed(2),
          adjustments: operating.map(movement),
          total: netIncome.plus(total(operating)).toFixed(2),
        },
        investing: { lines: investing.map(movement), total: total(investing).toFixed(2) },
        financing: { lines: financing.map(movement), total: total(financing).toFixed(2) },
        netChange: net.toFixed(2),
        closingCash: closing.toFixed(2),
        reconciles: opening.plus(net).equals(closing),
      };
    });
  }

  /** One account's lines with a running balance (debit − credit, or credit − debit for credit-normal accounts). */
  generalLedger(auth: TenantContext, q: GeneralLedgerQuery) {
    requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const account = await tx.account.findFirst({ where: { id: q.accountId, tenantId: auth.tenantId } });
      if (!account) throw notFound('accounts');
      const { from, to } = await this.range(tx, auth.tenantId, q);
      const sign = account.normalBalance === 'debit' ? 1 : -1;
      const [open] = await tx.$queryRaw<{ balance: Decimal | null }[]>`
        SELECT sum(l.debit - l.credit) AS balance FROM journal_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
        WHERE l.tenant_id = ${auth.tenantId}::uuid AND l.account_id = ${account.id}::uuid AND e.entry_date < ${from}::date`;
      const lines = await tx.$queryRaw<
        {
          entry_id: string;
          number: string;
          entry_date: Date;
          source_type: string;
          memo: string | null;
          description: string | null;
          branch_id: string | null;
          debit: Decimal;
          credit: Decimal;
        }[]
      >`
        SELECT e.id AS entry_id, e.number, e.entry_date, e.source_type, e.memo, l.description, l.branch_id, l.debit, l.credit
        FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
        WHERE l.tenant_id = ${auth.tenantId}::uuid AND l.account_id = ${account.id}::uuid
          AND e.entry_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY e.entry_date, e.number, l.line_no
        LIMIT 5001`;
      const opening = (open?.balance ?? ZERO).mul(sign);
      let running = opening;
      const out = lines.slice(0, 5000).map((l) => {
        running = running.plus(l.debit.minus(l.credit).mul(sign));
        return {
          entryId: l.entry_id,
          number: l.number,
          date: ymd(l.entry_date),
          sourceType: l.source_type,
          memo: l.memo,
          description: l.description,
          branchId: l.branch_id,
          debit: l.debit.toFixed(2),
          credit: l.credit.toFixed(2),
          balance: running.toFixed(2),
        };
      });
      return {
        account: {
          id: account.id,
          code: account.code,
          nameEn: account.nameEn,
          nameAr: account.nameAr,
          normalBalance: account.normalBalance,
        },
        from,
        to,
        opening: opening.toFixed(2),
        lines: out,
        closing: running.toFixed(2),
        truncated: lines.length > 5000,
      };
    });
  }

  /** Default range: start of the fiscal year containing `to` (or today) up to `to`. */
  private async range(tx: Tx, tenantId: string, q: { from?: string; to?: string }) {
    const to = q.to ?? (await postingMoment(tx, tenantId, null)).businessDate;
    let from = q.from;
    if (!from) {
      const fy = await tx.fiscalYear.findFirst({
        where: {
          tenantId,
          startDate: { lte: new Date(`${to}T00:00:00Z`) },
          endDate: { gte: new Date(`${to}T00:00:00Z`) },
        },
      });
      from = fy ? ymd(fy.startDate) : `${to.slice(0, 4)}-01-01`;
    }
    if (from > to) throw badRequest('reports.invalidRange', 'The start date is after the end date');
    return { from, to };
  }

  private balances(
    tx: Tx,
    tenantId: string,
    o: { from?: string; to?: string; excludeYearClose: boolean; branchId?: string },
  ) {
    return tx.$queryRaw<Row[]>`
      SELECT a.id AS account_id, a.code, a.name_en, a.name_ar, a.type, a.subtype,
             coalesce(sum(l.debit), 0) AS debit, coalesce(sum(l.credit), 0) AS credit
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      JOIN accounts a ON a.id = l.account_id
      WHERE l.tenant_id = ${tenantId}::uuid
        AND (${o.from ?? null}::date IS NULL OR e.entry_date >= ${o.from ?? null}::date)
        AND (${o.to ?? null}::date IS NULL OR e.entry_date <= ${o.to ?? null}::date)
        AND (NOT ${o.excludeYearClose} OR e.source_type <> 'year_close')
        AND (${o.branchId ?? null}::uuid IS NULL OR l.branch_id = ${o.branchId ?? null}::uuid)
      GROUP BY a.id, a.code, a.name_en, a.name_ar, a.type, a.subtype
      ORDER BY a.code`;
  }
}
