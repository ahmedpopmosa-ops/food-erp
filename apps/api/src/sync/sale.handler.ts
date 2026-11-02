import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  saleFinalizedV1,
  saleFinalizedV2,
  saleFinalizedV3,
  type SaleFinalizedV1,
  type SaleFinalizedV3,
  type SyncOperation,
} from '@ros/contracts';
import {
  businessDate,
  childId,
  computeOrderTotals,
  Money,
  selectPrice,
  type Channel,
  type PriceRow,
} from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';
import { PostingService, type PostingLine } from '../accounting/posting.service';
import { AuditService } from '../identity/audit/audit.service';
import type { DeviceContext } from '../common/auth-context';
import { parseOrReject, PermanentRejection, Retryable, type OperationHandler } from './sync.errors';
import { ApprovalsService } from './approvals.service';
import { ConsumptionService } from '../inventory/consumption.service';

const D = (v: string) => new Prisma.Decimal(v);
const rateString = (r: Prisma.Decimal) => r.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

/** Internal shape: v3 with an optional operator (v1 sales carry none). */
type Sale = Omit<SaleFinalizedV3, 'employeeId'> & { employeeId: string | null };

interface Discrepancy {
  kind: string;
  details: Prisma.InputJsonValue;
}

/** v1/v2 payloads (Phase 3/4a POS builds) expressed as v3, so one code path records every version. */
function upgrade(
  v: SaleFinalizedV1 & { employeeId?: string; cashSessionId?: string | null; approvals?: Sale['approvals'] },
): Sale {
  return {
    employeeId: v.employeeId ?? null,
    cashSessionId: v.cashSessionId ?? null,
    approvals: v.approvals ?? [],
    order: { ...v.order, tableId: null, guests: null, discount: null, discountReason: null },
    invoice: { ...v.invoice, discountTotal: '0.00', serviceChargeTotal: '0.00' },
    serviceCharge: null,
    lines: v.lines.map((l) => ({
      ...l,
      modifiers: [],
      discount: null,
      netBeforeDiscount: l.netAmount,
      discountAmount: '0.00',
    })),
    payments: v.payments,
    voids: [],
  };
}

/**
 * `sale.finalized` v1–v3. The sale already happened (ADR-0011): structural problems reject the operation;
 * business drift (outdated price, archived product, totals that do not re-compute, an unapproved large
 * discount, a table used by two devices at once) is recorded as a discrepancy and the sale is kept as sold.
 * Runs inside the per-operation transaction.
 */
@Injectable()
export class SaleFinalizedHandler implements OperationHandler {
  readonly type = 'sale.finalized';
  readonly versions = [1, 2, 3];

  constructor(
    private readonly posting: PostingService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly consumption: ConsumptionService,
  ) {}

  handle(tx: Tx, device: DeviceContext, op: SyncOperation) {
    const sale: Sale =
      op.schema_version === 1
        ? upgrade(parseOrReject(saleFinalizedV1, op.payload))
        : op.schema_version === 2
          ? upgrade(parseOrReject(saleFinalizedV2, op.payload))
          : parseOrReject(saleFinalizedV3, op.payload);
    return this.apply(tx, device, op, sale);
  }

  async apply(tx: Tx, device: DeviceContext, op: SyncOperation, sale: Sale) {
    const { tenantId, branchId, deviceId } = device;
    const [branch, settings] = await Promise.all([
      tx.branch.findUniqueOrThrow({ where: { id: branchId } }),
      tx.tenantSettings.findUniqueOrThrow({ where: { tenantId } }),
    ]);
    const currency = sale.invoice.currency;
    if (currency !== branch.currencyCode)
      throw new PermanentRejection('currency_mismatch', { expected: branch.currencyCode, got: currency });
    if (await tx.invoice.findUnique({ where: { id: sale.invoice.id } }))
      throw new PermanentRejection('id_conflict', { invoiceId: sale.invoice.id });
    if (await tx.order.findUnique({ where: { id: sale.order.id } }))
      throw new PermanentRejection('id_conflict', { orderId: sale.order.id });
    if (sale.employeeId && !(await tx.employee.findUnique({ where: { id: sale.employeeId } }))) {
      throw new PermanentRejection('unknown_reference', { employeeId: sale.employeeId });
    }
    if (sale.cashSessionId) {
      const session = await tx.cashSession.findUnique({ where: { id: sale.cashSessionId } });
      if (!session) throw new Retryable('dependency_pending', 5_000, { cashSessionId: sale.cashSessionId });
      if (session.deviceId !== deviceId)
        throw new PermanentRejection('scope_mismatch', { cashSessionId: sale.cashSessionId });
      if (session.status !== 'open')
        throw new PermanentRejection('cash_session_closed', { cashSessionId: sale.cashSessionId });
    }
    if (sale.order.tableId && !(await tx.diningTable.findFirst({ where: { id: sale.order.tableId, branchId } }))) {
      throw new PermanentRejection('unknown_reference', { tableId: sale.order.tableId });
    }

    // ── References in this tenant (RLS hides everything else) ──
    const variantIds = [...new Set([...sale.lines.map((l) => l.variantId), ...sale.voids.map((v) => v.variantId)])];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true, prices: true },
    });
    const methods = await tx.paymentMethod.findMany({
      where: { id: { in: sale.payments.map((p) => p.paymentMethodId) } },
    });
    const modifierIds = [...new Set(sale.lines.flatMap((l) => l.modifiers.map((m) => m.modifierId)))];
    const modifiers = await tx.modifier.findMany({ where: { id: { in: modifierIds } } });
    const scCategory = settings.serviceChargeTaxCategoryId;
    const taxCategoryIds = [
      ...new Set([...sale.lines.map((l) => l.taxCategoryId), ...(scCategory ? [scCategory] : [])]),
    ];
    const categoryRates = await tx.taxCategoryRate.findMany({
      where: { taxCategoryId: { in: taxCategoryIds }, appliesTo: 'sale' },
      include: { taxRate: true },
      orderBy: { sequence: 'asc' },
    });
    const knownCategories = await tx.taxCategory.count({
      where: { id: { in: sale.lines.map((l) => l.taxCategoryId) } },
    });
    const missing = {
      variants: variantIds.filter((id) => !variants.some((v) => v.id === id)),
      paymentMethods: sale.payments.map((p) => p.paymentMethodId).filter((id) => !methods.some((m) => m.id === id)),
      modifiers: modifierIds.filter((id) => !modifiers.some((m) => m.id === id)),
      taxCategories:
        knownCategories === new Set(sale.lines.map((l) => l.taxCategoryId)).size
          ? []
          : sale.lines.map((l) => l.taxCategoryId),
    };
    if (Object.values(missing).some((list) => list.length)) throw new PermanentRejection('unknown_reference', missing);

    const m = (v: string) => Money.of(v, currency);
    const issuedAt = sale.invoice.issuedAt;
    const date = businessDate(issuedAt, branch.timezone, settings.businessDayCutoff);
    const discrepancies: Discrepancy[] = [];

    // ── Internal consistency of what the device recorded (else: reject) ──
    const sumLines = (k: 'netBeforeDiscount' | 'discountAmount' | 'netAmount' | 'taxAmount') =>
      Money.sum(
        sale.lines.map((l) => m(l[k])),
        currency,
      );
    const sc = sale.serviceCharge;
    const consistent =
      m(sale.invoice.subtotal).equals(sumLines('netBeforeDiscount')) &&
      m(sale.invoice.discountTotal).equals(sumLines('discountAmount')) &&
      m(sale.invoice.serviceChargeTotal).equals(sc ? m(sc.netAmount) : Money.zero(currency)) &&
      m(sale.invoice.taxTotal).equals(sumLines('taxAmount').add(sc ? m(sc.taxAmount) : Money.zero(currency))) &&
      m(sale.invoice.total).equals(
        m(sale.invoice.subtotal)
          .sub(m(sale.invoice.discountTotal))
          .add(m(sale.invoice.serviceChargeTotal))
          .add(m(sale.invoice.taxTotal)),
      ) &&
      sale.lines.every(
        (l) =>
          m(l.grossAmount).equals(m(l.netAmount).add(m(l.taxAmount))) &&
          m(l.netBeforeDiscount).sub(m(l.discountAmount)).equals(m(l.netAmount)),
      );
    if (!consistent)
      throw new PermanentRejection('totals_inconsistent', { reason: 'Invoice totals do not add up from their lines' });

    // ── Re-verify with the server's configuration (doc 07 I13): drift is flagged, not rejected ──
    const at = new Date(issuedAt);
    const ratesFor = (categoryId: string) =>
      categoryRates
        .filter(
          (cr) =>
            cr.taxCategoryId === categoryId &&
            cr.taxRate.validFrom <= at &&
            (!cr.taxRate.validTo || cr.taxRate.validTo > at),
        )
        .map((cr) => ({ taxRateId: cr.taxRateId, rate: rateString(cr.taxRate.rate) }));
    const serviceRate = rateString(settings.serviceChargeRate);
    const expected = computeOrderTotals({
      currency,
      pricesIncludeTax: sale.invoice.pricesIncludeTax,
      lines: sale.lines.map((l) => ({
        lineKey: String(l.lineNo),
        qty: l.qty,
        unitPrice: l.unitPrice,
        taxes: ratesFor(l.taxCategoryId),
        discount: l.discount,
      })),
      orderDiscount: sale.order.discount,
      serviceCharge:
        sale.order.channel === 'dine_in' && serviceRate !== '0'
          ? { rate: serviceRate, taxes: scCategory ? ratesFor(scCategory) : [] }
          : null,
    });
    const lineDiffs = sale.lines
      .map((l, i) => ({ l, e: expected.lines[i]! }))
      .filter(
        ({ l, e }) =>
          !m(l.netAmount).equals(m(e.netAmount)) ||
          !m(l.taxAmount).equals(m(e.taxAmount)) ||
          !m(l.discountAmount).equals(m(e.discountAmount)),
      )
      .map(({ l, e }) => ({
        lineNo: l.lineNo,
        recorded: { net: l.netAmount, tax: l.taxAmount, discount: l.discountAmount },
        expected: { net: e.netAmount, tax: e.taxAmount, discount: e.discountAmount },
      }));
    if (lineDiffs.length || !m(expected.total).equals(m(sale.invoice.total))) {
      discrepancies.push({
        kind: 'totals_mismatch',
        details: { lines: lineDiffs, expectedTotal: expected.total, recordedTotal: sale.invoice.total },
      });
    }

    // Prices (base + modifier deltas) and product state at the time of sale.
    for (const line of sale.lines) {
      const v = variants.find((x) => x.id === line.variantId)!;
      if (v.archivedAt || v.product.archivedAt)
        discrepancies.push({ kind: 'product_inactive', details: { lineNo: line.lineNo, variantId: v.id } });
      const prices: PriceRow[] = v.prices.map((p) => ({
        id: p.id,
        variantId: p.variantId,
        branchId: p.branchId,
        channel: p.channel as Channel | null,
        price: p.price.toFixed(2),
        validFrom: p.validFrom.toISOString(),
        validTo: p.validTo?.toISOString() ?? null,
      }));
      const base = selectPrice(prices, { variantId: v.id, branchId, channel: sale.order.channel, at: issuedAt });
      const deltas = line.modifiers.map((lm) => modifiers.find((x) => x.id === lm.modifierId)!.priceDelta.toFixed(4));
      const expectedUnit = base ? deltas.reduce((s, d) => s.add(Money.of(d, currency)), m(base.price)) : null;
      if (!expectedUnit || !expectedUnit.round().equals(m(line.unitPrice))) {
        discrepancies.push({
          kind: 'price_outdated',
          details: {
            lineNo: line.lineNo,
            recorded: line.unitPrice,
            expected: expectedUnit?.round().toString(true) ?? null,
          },
        });
      }
    }

    // Approvals: record each; a large discount needs one for `pos.discount_over_limit`.
    for (const a of sale.approvals) {
      const ok = await this.approvals.record(tx, device, op, a, a.action, { type: 'invoice', id: sale.invoice.id });
      if (!ok)
        discrepancies.push({
          kind: 'permission_outdated',
          details: { action: a.action, approverEmployeeId: a.approverEmployeeId },
        });
    }
    if (
      Number(expected.maxDiscountFraction) > Number(settings.maxDiscountPct) &&
      !sale.approvals.some((a) => a.action === 'pos.discount_over_limit')
    ) {
      discrepancies.push({
        kind: 'discount_unapproved',
        details: { maxDiscountFraction: expected.maxDiscountFraction, limit: settings.maxDiscountPct.toString() },
      });
    }

    // Two devices serving the same table at overlapping times (doc 06 §7): both sales are kept.
    if (sale.order.tableId) {
      const overlapping = await tx.order.findFirst({
        where: {
          tableId: sale.order.tableId,
          deviceId: { not: deviceId },
          openedAt: { lt: new Date(sale.order.closedAt) },
          OR: [{ closedAt: null }, { closedAt: { gt: new Date(sale.order.openedAt) } }],
        },
      });
      if (overlapping)
        discrepancies.push({
          kind: 'table_conflict',
          details: { tableId: sale.order.tableId, otherOrderId: overlapping.id, otherDeviceId: overlapping.deviceId },
        });
    }

    const paid = Money.sum(
      sale.payments.map((p) => m(p.amount)),
      currency,
    );
    const total = m(sale.invoice.total);
    if (!paid.equals(total))
      discrepancies.push({
        kind: 'payment_mismatch',
        details: { total: total.toString(true), paid: paid.toString(true) },
      });

    // ── Record exactly as sold ──
    const opId = op.operation_id;
    await tx.order.create({
      data: {
        id: sale.order.id,
        tenantId,
        branchId,
        deviceId,
        localNumber: sale.order.localNumber,
        channel: sale.order.channel,
        status: 'closed',
        openedAt: new Date(sale.order.openedAt),
        closedAt: new Date(sale.order.closedAt),
        businessDate: new Date(`${date}T00:00:00Z`),
        catalogVersion: op.refs.catalog_version ?? null,
        operationId: opId,
        tableId: sale.order.tableId,
        guests: sale.order.guests,
        employeeId: sale.employeeId,
        discount: sale.order.discount ? { ...sale.order.discount, reason: sale.order.discountReason } : Prisma.DbNull,
        items: {
          create: [
            ...sale.lines.map((l) => ({
              id: childId(sale.order.id, `item:${l.lineNo}`),
              tenantId,
              lineNo: l.lineNo,
              variantId: l.variantId,
              productNameAr: l.productNameAr,
              productNameEn: l.productNameEn,
              qty: D(l.qty),
              unitPrice: D(l.unitPrice),
              taxCategoryId: l.taxCategoryId,
              modifiers: l.modifiers,
            })),
            ...sale.voids.map((v, i) => ({
              id: v.orderItemId,
              tenantId,
              lineNo: 1000 + i,
              variantId: v.variantId,
              productNameAr: v.productNameEn,
              productNameEn: v.productNameEn,
              qty: D(v.qty),
              unitPrice: D(v.unitPrice),
              taxCategoryId: variants.find((x) => x.id === v.variantId)!.product.taxCategoryId,
              status: 'voided',
              voidReason: v.reason,
              voidApprovalId: v.approvalId,
            })),
          ],
        },
      },
    });

    const taxSummary = new Map<string, { rate: string; base: Money; amount: Money }>();
    const addTaxes = (base: string, list: { taxRateId: string; rate: string; amount: string }[]) => {
      for (const t of list) {
        const s = taxSummary.get(t.taxRateId) ?? {
          rate: t.rate,
          base: Money.zero(currency),
          amount: Money.zero(currency),
        };
        s.base = s.base.add(m(base));
        s.amount = s.amount.add(m(t.amount));
        taxSummary.set(t.taxRateId, s);
      }
    };
    for (const l of sale.lines) addTaxes(l.netAmount, l.taxes);
    if (sc) addTaxes(sc.netAmount, sc.taxes);
    const unknownRates = [...taxSummary.keys()].filter((id) => !categoryRates.some((cr) => cr.taxRateId === id));
    if (unknownRates.length) throw new PermanentRejection('unknown_reference', { taxRates: unknownRates });

    // Recipe in effect when the sale happened; stored per line so consumption is reproducible (doc 07 §6).
    const recipes = await this.consumption.versionsAt(
      tx,
      [...new Set([...sale.lines.map((l) => l.variantId), ...sale.voids.map((v) => v.variantId)])],
      new Date(issuedAt),
    );

    await tx.invoice.create({
      data: {
        id: sale.invoice.id,
        tenantId,
        orderId: sale.order.id,
        branchId,
        deviceId,
        number: sale.invoice.number,
        currencyCode: currency,
        pricesIncludeTax: sale.invoice.pricesIncludeTax,
        subtotal: D(sale.invoice.subtotal),
        discountTotal: D(sale.invoice.discountTotal),
        serviceChargeTotal: D(sale.invoice.serviceChargeTotal),
        taxTotal: D(sale.invoice.taxTotal),
        total: D(sale.invoice.total),
        paidTotal: D(paid.toString(true)),
        paymentStatus: paid.compare(total) >= 0 ? 'paid' : paid.isZero() ? 'unpaid' : 'partially_paid',
        issuedAt: new Date(issuedAt),
        businessDate: new Date(`${date}T00:00:00Z`),
        catalogVersion: op.refs.catalog_version ?? null,
        operationId: opId,
        employeeId: sale.employeeId,
        cashSessionId: sale.cashSessionId,
        lines: {
          create: sale.lines.map((l) => ({
            id: l.id,
            tenantId,
            lineNo: l.lineNo,
            orderItemId: childId(sale.order.id, `item:${l.lineNo}`),
            variantId: l.variantId,
            descriptionAr: [l.productNameAr, ...l.modifiers.map((x) => x.nameAr)].join(' + '),
            descriptionEn: [l.productNameEn, ...l.modifiers.map((x) => x.nameEn)].join(' + '),
            qty: D(l.qty),
            unitPrice: D(l.unitPrice),
            netAmount: D(l.netAmount),
            taxAmount: D(l.taxAmount),
            grossAmount: D(l.grossAmount),
            taxCategoryId: l.taxCategoryId,
            taxes: l.taxes,
            modifiers: l.modifiers,
            discount: l.discount ?? Prisma.DbNull,
            discountAmount: D(l.discountAmount),
            recipeVersionId: recipes.get(l.variantId)?.id ?? null,
          })),
        },
        taxes: {
          create: [...taxSummary.entries()].map(([taxRateId, s]) => ({
            id: childId(sale.invoice.id, `tax:${taxRateId}`),
            tenantId,
            taxRateId,
            rate: D(s.rate),
            taxableBase: D(s.base.toString(true)),
            taxAmount: D(s.amount.toString(true)),
          })),
        },
        payments: {
          create: sale.payments.map((p) => ({
            id: p.id,
            tenantId,
            paymentMethodId: p.paymentMethodId,
            amount: D(p.amount),
            tendered: p.tendered ? D(p.tendered) : null,
            changeGiven: p.changeGiven ? D(p.changeGiven) : null,
            reference: p.reference,
            occurredAt: new Date(sale.order.closedAt),
            operationId: opId,
            cashSessionId: sale.cashSessionId,
          })),
        },
      },
    });

    // ── Post (doc 07 §3.1): payments + discount = revenue + service charge + output tax ──
    const lines: PostingLine[] = [];
    for (const p of sale.payments) {
      lines.push({
        accountId: methods.find((x) => x.id === p.paymentMethodId)!.accountId,
        debit: p.amount,
        branchId,
        description: 'Payment',
      });
    }
    const suspense = total.sub(paid);
    if (!suspense.isZero()) {
      const account = await this.posting.resolve(tx, tenantId, 'sales_suspense');
      lines.push(
        suspense.isNegative()
          ? { accountId: account, credit: suspense.mul('-1').toString(true), branchId }
          : { accountId: account, debit: suspense.toString(true), branchId },
      );
    }
    const discount = sumLines('discountAmount');
    if (!discount.isZero())
      lines.push({
        accountId: await this.posting.resolve(tx, tenantId, 'sales_discount'),
        debit: discount.toString(true),
        branchId,
        description: 'Discounts',
      });
    const revenueByAccount = new Map<string, Money>();
    for (const l of sale.lines) {
      const categoryId = variants.find((v) => v.id === l.variantId)!.product.categoryId;
      const account = await this.posting.resolve(tx, tenantId, 'sales_revenue', { type: 'category', id: categoryId });
      revenueByAccount.set(
        account,
        (revenueByAccount.get(account) ?? Money.zero(currency)).add(m(l.netBeforeDiscount)),
      );
    }
    for (const [accountId, amount] of revenueByAccount)
      lines.push({ accountId, credit: amount.toString(true), branchId, description: 'Sales' });
    if (sc && !m(sc.netAmount).isZero()) {
      lines.push({
        accountId: await this.posting.resolve(tx, tenantId, 'service_charge_revenue'),
        credit: sc.netAmount,
        branchId,
        description: 'Service charge',
      });
    }
    for (const [taxRateId, s] of taxSummary) {
      const rate = categoryRates.find((cr) => cr.taxRateId === taxRateId)!.taxRate;
      const accountId =
        rate.outputAccountId ??
        (await this.posting.resolve(tx, tenantId, 'output_tax', { type: 'tax_rate', id: taxRateId }));
      lines.push({ accountId, credit: s.amount.toString(true), branchId, description: rate.code });
    }
    const entry = await this.posting.post(tx, {
      tenantId,
      sourceType: 'invoice',
      sourceId: sale.invoice.id,
      purpose: 'sale',
      date,
      currency,
      memo: `Sale ${sale.invoice.number}`,
      lines,
    });
    await tx.invoice.update({ where: { id: sale.invoice.id }, data: { journalEntryId: entry.id } });
    await tx.payment.updateMany({ where: { invoiceId: sale.invoice.id }, data: { journalEntryId: entry.id } });
    if (entry.late)
      discrepancies.push({ kind: 'late_posting', details: { businessDate: date, postedOn: entry.entryDate } });

    // ── Stock: recipe consumption at weighted average → COGS; voided items already cooked → wastage ──
    const stock = {
      tenantId,
      branchId,
      versions: recipes,
      businessDate: date,
      occurredAt: new Date(issuedAt),
      currency,
    };
    const consumed = await this.consumption.consume(tx, {
      ...stock,
      kind: 'sale_consumption',
      sourceType: 'invoice',
      sourceId: sale.invoice.id,
      lines: sale.lines.map((l) => ({ lineId: l.id, variantId: l.variantId, qty: l.qty })),
      memo: `COGS ${sale.invoice.number}`,
    });
    const wasted = await this.consumption.consume(tx, {
      ...stock,
      kind: 'wastage',
      sourceType: 'order',
      sourceId: sale.order.id,
      lines: sale.voids
        .filter((v) => v.wasSentToKitchen)
        .map((v) => ({ lineId: v.orderItemId, variantId: v.variantId, qty: v.qty })),
      memo: `Voided after kitchen ${sale.order.localNumber}`,
    });
    // ADR-0011: running out of stock never blocks a sale; it is flagged for the back office.
    const negative = [...consumed.negative, ...wasted.negative];
    if (negative.length) discrepancies.push({ kind: 'negative_stock', details: { items: negative } });

    if (discrepancies.length) {
      await tx.saleDiscrepancy.createMany({
        data: discrepancies.map((d) => ({ tenantId, invoiceId: sale.invoice.id, kind: d.kind, details: d.details })),
      });
    }
    await this.audit.record(
      tx,
      tenantId,
      { kind: 'system' },
      {
        action: 'sale.recorded',
        entityType: 'invoice',
        entityId: sale.invoice.id,
        branchId,
        changes: {
          number: sale.invoice.number,
          total: sale.invoice.total,
          deviceId,
          operationId: opId,
          voids: sale.voids.length,
          discrepancies: discrepancies.map((d) => d.kind),
        },
      },
    );

    return {
      order_id: sale.order.id,
      invoice_id: sale.invoice.id,
      invoice_number: sale.invoice.number,
      journal_entry_id: entry.id,
      journal_number: entry.number,
      cogs_journal_entry_id: consumed.journalEntryId,
      discrepancies: discrepancies.map((d) => d.kind),
    };
  }
}
