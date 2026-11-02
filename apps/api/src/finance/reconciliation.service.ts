import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StatementRangeQuery } from '@ros/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { PurchasingService } from '../purchasing/purchasing.service';
import { postingMoment } from '../inventory/stock-helpers';
import { badRequest } from '../common/errors';
import type { TenantContext } from '../common/auth-context';
import { requireAllBranches } from './finance.helpers';

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

interface Check {
  key: string;
  subledger: string;
  ledger: string;
  difference: string;
  ok: boolean;
}

/**
 * Sub-ledgers against the general ledger (doc 07 §7, P6-6). Every check returns both sides and the difference;
 * nothing is corrected automatically (I12).
 * - sales: Σ invoices (subtotal − discounts + service charge) − Σ refunds (net) whose entries fall in the range,
 *   against every posted line in the range on the accounts mapped to sales revenue, sales discounts and service
 *   charge (so a manual entry to revenue shows up as a difference);
 * - payables / goods received not invoiced / inventory: as of now, from the purchasing and stock sub-ledgers;
 * - documents without entry: issued invoices and refunds that have no journal entry;
 * - trial balance: Σ debit = Σ credit over all posted lines.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly purchasing: PurchasingService,
  ) {}

  async report(auth: TenantContext, q: StatementRangeQuery) {
    requireAllBranches(auth);
    const tenantId = auth.tenantId;
    const ledgerChecks = await this.prisma.withTenant(tenantId, async (tx) => {
      const today = (await postingMoment(tx, tenantId, null)).businessDate;
      const to = q.to ?? today;
      const from = q.from ?? `${to.slice(0, 4)}-01-01`;
      if (from > to) throw badRequest('reports.invalidRange', 'The start date is after the end date');
      const mapped = await tx.accountingMapping.findMany({
        where: { tenantId, mappingKey: { in: ['sales_revenue', 'sales_discount', 'service_charge_revenue'] } },
        select: { accountId: true },
      });
      const accounts = [...new Set(mapped.map((m) => m.accountId))];
      const [ledger] = await tx.$queryRaw<{ v: Decimal | null }[]>`
        SELECT sum(l.credit - l.debit) AS v FROM journal_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted' AND e.source_type <> 'year_close'
        WHERE l.tenant_id = ${tenantId}::uuid AND l.account_id = ANY(${accounts}::uuid[])
          AND e.entry_date BETWEEN ${from}::date AND ${to}::date`;
      const [sales] = await tx.$queryRaw<{ v: Decimal | null }[]>`
        SELECT sum(i.subtotal - i.discount_total + i.service_charge_total) AS v FROM invoices i
        JOIN journal_entries e ON e.id = i.journal_entry_id
        WHERE i.tenant_id = ${tenantId}::uuid AND e.entry_date BETWEEN ${from}::date AND ${to}::date`;
      const [refunds] = await tx.$queryRaw<{ v: Decimal | null }[]>`
        SELECT sum(r.net_total) AS v FROM refunds r
        JOIN journal_entries e ON e.id = r.journal_entry_id
        WHERE r.tenant_id = ${tenantId}::uuid AND e.entry_date BETWEEN ${from}::date AND ${to}::date`;
      const missing =
        (await tx.invoice.count({ where: { tenantId, journalEntryId: null } })) +
        (await tx.refund.count({ where: { tenantId, journalEntryId: null } }));
      const [tb] = await tx.$queryRaw<{ debit: Decimal | null; credit: Decimal | null }[]>`
        SELECT sum(l.debit) AS debit, sum(l.credit) AS credit FROM journal_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
        WHERE l.tenant_id = ${tenantId}::uuid`;
      return {
        from,
        to,
        checks: [
          check('sales', (sales?.v ?? ZERO).minus(refunds?.v ?? ZERO), ledger?.v ?? ZERO),
          check('documentsWithoutEntry', new Prisma.Decimal(missing), ZERO),
          check('trialBalance', tb?.debit ?? ZERO, tb?.credit ?? ZERO),
        ],
      };
    });
    const p = await this.purchasing.reconciliation(auth);
    const inv = await this.inventory.reconciliation(auth);
    const checks: Check[] = [
      ledgerChecks.checks[0]!,
      check('payables', new Prisma.Decimal(p.openPayables), new Prisma.Decimal(p.glPayables)),
      check(
        'goodsReceivedNotInvoiced',
        new Prisma.Decimal(p.uninvoicedReceipts),
        new Prisma.Decimal(p.glGoodsReceivedNotInvoiced),
      ),
      check('inventory', new Prisma.Decimal(inv.stockValue), new Prisma.Decimal(inv.glInventoryValue)),
      // Item/warehouse pairs whose movements do not add up to their balance.
      check('stockLedgerMismatches', new Prisma.Decimal(inv.mismatches.length), ZERO),
      ...ledgerChecks.checks.slice(1),
    ];
    return { from: ledgerChecks.from, to: ledgerChecks.to, checks, ok: checks.every((c) => c.ok) };
  }
}

function check(key: string, subledger: Decimal, ledger: Decimal): Check {
  const difference = subledger.minus(ledger);
  return {
    key,
    subledger: subledger.toFixed(2),
    ledger: ledger.toFixed(2),
    difference: difference.toFixed(2),
    ok: difference.isZero(),
  };
}
