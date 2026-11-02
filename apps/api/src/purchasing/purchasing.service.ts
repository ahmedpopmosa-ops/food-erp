import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  GoodsReceiptCreateInput,
  PurchaseOrderCreateInput,
  SupplierCreateInput,
  SupplierInvoiceCreateInput,
  SupplierPaymentCreateInput,
  SupplierReturnCreateInput,
} from '@ros/contracts';
import { childId } from '@ros/domain';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { PostingService, type PostingLine } from '../accounting/posting.service';
import { LedgerService, type MovementInput } from '../inventory/ledger.service';
import {
  accessibleWarehouse,
  baseCurrency,
  nextDocumentNumber,
  postingMoment,
  toBase,
} from '../inventory/stock-helpers';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../common/errors';
import { branchScope, type TenantContext } from '../common/auth-context';

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const sum = (values: Decimal[]) => values.reduce((s, v) => s.plus(v), ZERO);
const money = (v: Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const ymdDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/**
 * Purchasing and supplier payables (doc 07 §3.6). Accounting, all inside the document's transaction:
 * - goods receipt: Dr inventory (goods + capitalised charges) / Cr goods received not invoiced (goods),
 *   Cr accrued purchase charges (charges);
 * - supplier invoice: Dr GRNI (the received value of the matched quantity), Dr/Cr price variance (invoice
 *   price − received price), Dr expense lines, Dr input VAT / Cr accounts payable (printed total);
 * - payment: Dr accounts payable / Cr cash in safe or bank;
 * - return of uninvoiced goods: Dr GRNI (received value) / Cr inventory (weighted average), difference to
 *   price variance.
 * GRNI is cleared per receipt line so that it always equals Σ (goods value − value cleared) to the cent.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly posting: PostingService,
  ) {}

  // ── Suppliers ──────────────────────────────────────────────────────────────

  suppliers(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.supplier.findMany({ where: { tenantId: auth.tenantId }, orderBy: { code: 'asc' } }),
    );
  }

  async createSupplier(auth: TenantContext, input: SupplierCreateInput) {
    try {
      return await this.prisma.withTenant(auth.tenantId, async (tx) => {
        const supplier = await tx.supplier.create({ data: { tenantId: auth.tenantId, ...input } });
        await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
          action: 'supplier.created',
          entityType: 'supplier',
          entityId: supplier.id,
          changes: { code: input.code, nameEn: input.nameEn },
        });
        return supplier;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('suppliers.duplicateCode', 'A supplier with this code already exists');
      throw err;
    }
  }

  /** Open invoices, payments and the balance owed; plus goods received but not yet invoiced. */
  statement(auth: TenantContext, supplierId: string) {
    this.requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const supplier = await this.supplier(tx, auth.tenantId, supplierId, true);
      const invoices = await tx.supplierInvoice.findMany({ where: { supplierId }, orderBy: { invoiceDate: 'asc' } });
      const payments = await tx.supplierPayment.findMany({
        where: { supplierId },
        include: { allocations: true },
        orderBy: { paidAt: 'asc' },
      });
      const receiptLines = await tx.goodsReceiptLine.findMany({ where: { receipt: { supplierId } } });
      return {
        supplier,
        invoices: invoices.map((i) => ({ ...i, openAmount: i.total.minus(i.amountPaid).toFixed(2) })),
        payments,
        balance: sum(invoices.map((i) => i.total.minus(i.amountPaid))).toFixed(2),
        uninvoicedValue: sum(receiptLines.map((l) => l.goodsValue.minus(l.valueCleared))).toFixed(2),
      };
    });
  }

  // ── Purchase orders ────────────────────────────────────────────────────────

  orders(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, async (tx) =>
      tx.purchaseOrder.findMany({
        where: { tenantId: auth.tenantId, ...(await this.warehouseFilter(tx, auth)) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  order(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, (tx) => this.findOrder(tx, auth, id));
  }

  createOrder(auth: TenantContext, input: PurchaseOrderCreateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const warehouse = await this.stockWarehouse(tx, auth, input.warehouseId);
      await this.supplier(tx, tenantId, input.supplierId);
      const items = await this.itemsById(
        tx,
        tenantId,
        input.lines.map((l) => l.itemId),
      );
      const id = randomUUID();
      const lines = input.lines.map((l) => ({
        id: childId(id, `item:${l.itemId}`),
        tenantId,
        itemId: l.itemId,
        qty: D(l.qty),
        unit: l.unit,
        qtyBase: D(toBase(l.qty, l.unit, items.get(l.itemId)!)),
        unitPrice: D(l.unitPrice),
      }));
      const order = await tx.purchaseOrder.create({
        data: {
          id,
          tenantId,
          number: await nextDocumentNumber(tx, tenantId, 'purchase_order', 'PO'),
          supplierId: input.supplierId,
          warehouseId: warehouse.id,
          expectedDate: input.expectedDate ? ymdDate(input.expectedDate) : null,
          notes: input.notes,
          total: sum(lines.map((l) => money(l.qty.mul(l.unitPrice)))),
          createdBy: auth.userId,
          lines: { create: lines },
        },
        include: { lines: true },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'purchase_order.created',
        entityType: 'purchase_order',
        entityId: id,
        branchId: warehouse.branchId,
        changes: { number: order.number, total: order.total.toFixed(2) },
      });
      return order;
    });
  }

  approveOrder(auth: TenantContext, id: string) {
    return this.setOrderStatus(auth, id, ['draft'], 'approved');
  }

  /** Only an order with nothing received can be cancelled; a partly received one is simply left open. */
  cancelOrder(auth: TenantContext, id: string) {
    return this.setOrderStatus(auth, id, ['draft', 'approved'], 'cancelled');
  }

  private setOrderStatus(auth: TenantContext, id: string, from: string[], to: 'approved' | 'cancelled') {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const order = await this.findOrder(tx, auth, id);
      if (!from.includes(order.status)) throw badRequest('invalid_state_transition', `Order is ${order.status}`);
      await tx.purchaseOrder.update({
        where: { id },
        data: to === 'approved' ? { status: to, approvedBy: auth.userId, approvedAt: new Date() } : { status: to },
      });
      await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
        action: `purchase_order.${to}`,
        entityType: 'purchase_order',
        entityId: id,
      });
      return this.findOrder(tx, auth, id);
    });
  }

  // ── Goods receipts ─────────────────────────────────────────────────────────

  receipts(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, async (tx) =>
      tx.goodsReceipt.findMany({
        where: { tenantId: auth.tenantId, ...(await this.warehouseFilter(tx, auth)) },
        orderBy: { receivedAt: 'desc' },
        take: 200,
      }),
    );
  }

  receipt(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const r = await tx.goodsReceipt.findFirst({ where: { id, tenantId: auth.tenantId }, include: { lines: true } });
      if (!r) throw notFound('goods_receipts');
      await this.visibleWarehouse(tx, auth, r.warehouseId, 'goods_receipts');
      return r;
    });
  }

  createReceipt(auth: TenantContext, input: GoodsReceiptCreateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      let order = null;
      if (input.orderId) {
        // Locked: two receipts against one order cannot both pass the ordered-quantity check.
        await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${input.orderId}::uuid FOR UPDATE`;
        order = await this.findOrder(tx, auth, input.orderId);
        if (!['approved', 'partially_received'].includes(order.status))
          throw badRequest('invalid_state_transition', `Order is ${order.status}`);
        if (
          (input.supplierId && input.supplierId !== order.supplierId) ||
          (input.warehouseId && input.warehouseId !== order.warehouseId)
        )
          throw badRequest('receipts.orderMismatch', 'Supplier and warehouse come from the purchase order');
      }
      const warehouse = await this.stockWarehouse(tx, auth, order?.warehouseId ?? input.warehouseId!);
      const supplier = await this.supplier(tx, tenantId, order?.supplierId ?? input.supplierId!);
      if (new Set(input.lines.map((l) => l.itemId)).size !== input.lines.length)
        throw badRequest('receipts.duplicateItem', 'Each item may appear once per receipt');
      const items = await this.itemsById(
        tx,
        tenantId,
        input.lines.map((l) => l.itemId),
      );
      const id = randomUUID();
      const lines = input.lines.map((l) => {
        const qtyBase = D(toBase(l.qty, l.unit, items.get(l.itemId)!));
        const orderLine = order?.lines.find((x) => x.itemId === l.itemId);
        if (order && !orderLine) throw badRequest('receipts.notOnOrder', 'Item is not on the purchase order');
        if (orderLine && orderLine.qtyReceivedBase.plus(qtyBase).gt(orderLine.qtyBase))
          throw badRequest('receipts.overReceived', 'Cannot receive more than was ordered');
        let unitPrice: Decimal;
        let goodsValue: Decimal;
        if (l.unitPrice) {
          unitPrice = D(l.unitPrice);
          goodsValue = money(D(l.qty).mul(unitPrice));
        } else {
          // Order price per base unit, whatever unit the goods are received in.
          const perBase = orderLine!.unitPrice.mul(orderLine!.qty).div(orderLine!.qtyBase);
          goodsValue = money(perBase.mul(qtyBase));
          unitPrice = goodsValue.div(l.qty).toDecimalPlaces(6);
        }
        return {
          id: childId(id, `item:${l.itemId}`),
          l,
          qtyBase,
          orderLine,
          unitPrice,
          goodsValue,
          chargesValue: ZERO,
        };
      });
      const goodsTotal = sum(lines.map((x) => x.goodsValue));
      const chargesTotal = sum(input.charges.map((c) => D(c.amount)));
      if (chargesTotal.gt(0)) {
        if (goodsTotal.isZero()) throw badRequest('receipts.chargesWithoutValue', 'Charges need goods with a value');
        // By goods value; the rounding remainder goes to the largest line.
        const largest = lines.reduce((a, b) => (b.goodsValue.gt(a.goodsValue) ? b : a));
        for (const x of lines)
          if (x !== largest) x.chargesValue = money(chargesTotal.mul(x.goodsValue).div(goodsTotal));
        largest.chargesValue = chargesTotal.minus(sum(lines.filter((x) => x !== largest).map((x) => x.chargesValue)));
      }

      const plan = await this.ledger.plan(
        tx,
        tenantId,
        lines.map((x): MovementInput => ({
          warehouseId: warehouse.id,
          itemId: x.l.itemId,
          type: 'purchase_receipt',
          qtyBase: x.qtyBase.toString(),
          totalCost: x.goodsValue.plus(x.chargesValue).toFixed(2),
          sourceType: 'goods_receipt',
          sourceId: id,
          sourceLineId: x.id,
        })),
        await postingMoment(tx, tenantId, warehouse.branchId),
      );
      const grni = await this.posting.resolve(tx, tenantId, 'goods_received_not_invoiced');
      const accrual = chargesTotal.gt(0) ? await this.posting.resolve(tx, tenantId, 'purchase_charges_accrual') : null;
      const number = await nextDocumentNumber(tx, tenantId, 'goods_receipt', 'GRN');
      const journalEntryId = await this.ledger.postPlan(tx, plan, {
        sourceType: 'goods_receipt',
        sourceId: id,
        purpose: 'receipt',
        currency: await baseCurrency(tx, tenantId),
        memo: `${number} ${supplier.code}`,
        branchId: warehouse.branchId,
        counterAccount: async () => grni,
        extra: accrual
          ? [
              { accountId: grni, amount: chargesTotal.toFixed(2) },
              { accountId: accrual, amount: chargesTotal.neg().toFixed(2) },
            ]
          : [],
      });
      await tx.goodsReceipt.create({
        data: {
          id,
          tenantId,
          number,
          supplierId: supplier.id,
          orderId: order?.id ?? null,
          warehouseId: warehouse.id,
          supplierRef: input.supplierRef,
          goodsTotal,
          chargesTotal,
          charges: input.charges,
          journalEntryId,
          createdBy: auth.userId,
          lines: {
            create: lines.map((x) => ({
              id: x.id,
              tenantId,
              orderLineId: x.orderLine?.id ?? null,
              itemId: x.l.itemId,
              qty: D(x.l.qty),
              unit: x.l.unit,
              qtyBase: x.qtyBase,
              unitPrice: x.unitPrice,
              goodsValue: x.goodsValue,
              chargesValue: x.chargesValue,
            })),
          },
        },
      });
      await this.ledger.commit(tx, plan, journalEntryId);
      if (order) {
        for (const x of lines)
          await tx.purchaseOrderLine.update({
            where: { id: x.orderLine!.id },
            data: { qtyReceivedBase: { increment: x.qtyBase } },
          });
        const after = await tx.purchaseOrderLine.findMany({ where: { orderId: order.id } });
        await tx.purchaseOrder.update({
          where: { id: order.id },
          data: { status: after.every((l) => l.qtyReceivedBase.gte(l.qtyBase)) ? 'received' : 'partially_received' },
        });
      }
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'goods_receipt.posted',
        entityType: 'goods_receipt',
        entityId: id,
        branchId: warehouse.branchId,
        changes: { number, orderId: order?.id ?? null, goods: goodsTotal.toFixed(2), charges: chargesTotal.toFixed(2) },
      });
      return {
        ...(await tx.goodsReceipt.findUniqueOrThrow({ where: { id }, include: { lines: true } })),
        negativeStockSettled: plan.movements.some((m) => m.movementType === 'revaluation'),
      };
    });
  }

  // ── Supplier invoices ──────────────────────────────────────────────────────

  invoices(auth: TenantContext) {
    this.requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.supplierInvoice.findMany({ where: { tenantId: auth.tenantId }, orderBy: { invoiceDate: 'desc' }, take: 200 }),
    );
  }

  invoice(auth: TenantContext, id: string) {
    this.requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const inv = await tx.supplierInvoice.findFirst({
        where: { id, tenantId: auth.tenantId },
        include: { lines: true },
      });
      if (!inv) throw notFound('supplier_invoices');
      const ids = inv.lines.flatMap((l) => (l.receiptLineId ? [l.receiptLineId] : []));
      const received = await tx.goodsReceiptLine.findMany({
        where: { id: { in: ids } },
        select: { id: true, itemId: true },
      });
      return {
        ...inv,
        lines: inv.lines.map((l) => ({ ...l, itemId: received.find((r) => r.id === l.receiptLineId)?.itemId ?? null })),
      };
    });
  }

  async createInvoice(auth: TenantContext, input: SupplierInvoiceCreateInput) {
    this.requireAllBranches(auth);
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const supplier = await this.supplier(tx, tenantId, input.supplierId);
        if (
          await tx.supplierInvoice.findFirst({
            where: { supplierId: supplier.id, supplierInvoiceNo: input.supplierInvoiceNo },
          })
        )
          throw conflict('invoices.duplicate', 'This supplier invoice number is already recorded');
        const receiptLineIds = input.lines.flatMap((l) => (l.receiptLineId ? [l.receiptLineId] : []));
        const receiptLines = await this.lockReceiptLines(tx, tenantId, receiptLineIds);
        const items = await this.itemsById(
          tx,
          tenantId,
          receiptLines.map((l) => l.itemId),
        );
        const id = randomUUID();
        const lines = [];
        for (const [i, l] of input.lines.entries()) {
          const amount = D(l.amount);
          const taxAmount = D(l.taxAmount);
          const lineId = childId(id, `line:${i + 1}`);
          if (l.receiptLineId) {
            const rl = receiptLines.find((x) => x.id === l.receiptLineId)!;
            if (rl.receipt.supplierId !== supplier.id)
              throw badRequest('invoices.wrongSupplier', 'The receipt belongs to another supplier');
            const qtyBase = D(toBase(l.qty!, l.unit!, items.get(rl.itemId)!));
            const cleared = this.clear(rl, qtyBase, 'invoices.overInvoiced', 'Cannot invoice more than was received');
            rl.qtyInvoicedBase = rl.qtyInvoicedBase.plus(qtyBase);
            lines.push({
              id: lineId,
              tenantId,
              receiptLineId: rl.id,
              description: l.description,
              qtyBase,
              amount,
              taxAmount,
              grniCleared: cleared,
              priceVariance: amount.minus(cleared),
            });
          } else {
            const account = await tx.account.findFirst({ where: { id: l.accountId!, tenantId } });
            if (!account || !account.isPostable || account.isControl)
              throw badRequest('invoices.invalidAccount', 'Choose a postable, non-control account');
            lines.push({ id: lineId, tenantId, accountId: account.id, description: l.description, amount, taxAmount });
          }
        }
        const subtotal = sum(lines.map((l) => l.amount));
        const taxTotal = sum(lines.map((l) => l.taxAmount));
        const total = subtotal.plus(taxTotal);
        if (!total.equals(D(input.total)))
          throw badRequest('invoices.totalMismatch', 'Lines do not add up to the invoice total', {
            computed: total.toFixed(2),
          });
        const invoiceDate = ymdDate(input.invoiceDate);
        const dueDate = input.dueDate
          ? ymdDate(input.dueDate)
          : new Date(invoiceDate.getTime() + supplier.paymentTermsDays * 86_400_000);

        const amounts = new Map<string, Decimal>();
        const add = (accountId: string, v: Decimal) => amounts.set(accountId, (amounts.get(accountId) ?? ZERO).plus(v));
        const goods = lines.filter((l) => 'grniCleared' in l) as { grniCleared: Decimal; priceVariance: Decimal }[];
        if (goods.length) {
          add(
            await this.posting.resolve(tx, tenantId, 'goods_received_not_invoiced'),
            sum(goods.map((l) => l.grniCleared)),
          );
          add(
            await this.posting.resolve(tx, tenantId, 'inventory_price_variance'),
            sum(goods.map((l) => l.priceVariance)),
          );
        }
        for (const l of lines) if ('accountId' in l && l.accountId) add(l.accountId, l.amount);
        add(await this.posting.resolve(tx, tenantId, 'input_tax'), taxTotal);
        add(await this.posting.resolve(tx, tenantId, 'accounts_payable'), total.neg());
        const number = await nextDocumentNumber(tx, tenantId, 'supplier_invoice', 'PINV');
        const entry = await this.posting.post(tx, {
          tenantId,
          sourceType: 'supplier_invoice',
          sourceId: id,
          purpose: 'invoice',
          date: input.invoiceDate,
          currency: await baseCurrency(tx, tenantId),
          memo: `${number} ${supplier.code} ${input.supplierInvoiceNo}`,
          postedBy: auth.userId,
          lines: this.postingLines(amounts),
        });
        await tx.supplierInvoice.create({
          data: {
            id,
            tenantId,
            number,
            supplierId: supplier.id,
            supplierInvoiceNo: input.supplierInvoiceNo,
            invoiceDate,
            dueDate,
            subtotal,
            taxTotal,
            total,
            journalEntryId: entry.id,
            createdBy: auth.userId,
            lines: { create: lines },
          },
        });
        await this.saveReceiptLines(tx, receiptLines);
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'supplier_invoice.posted',
          entityType: 'supplier_invoice',
          entityId: id,
          changes: { number, supplierInvoiceNo: input.supplierInvoiceNo, total: total.toFixed(2) },
        });
        return tx.supplierInvoice.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('invoices.duplicate', 'This supplier invoice number is already recorded');
      throw err;
    }
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  payments(auth: TenantContext) {
    this.requireAllBranches(auth);
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.supplierPayment.findMany({
        where: { tenantId: auth.tenantId },
        include: { allocations: true },
        orderBy: { paidAt: 'desc' },
        take: 200,
      }),
    );
  }

  createPayment(auth: TenantContext, input: SupplierPaymentCreateInput) {
    this.requireAllBranches(auth);
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const supplier = await this.supplier(tx, tenantId, input.supplierId);
      const amount = D(input.amount);
      if (!sum(input.allocations.map((a) => D(a.amount))).equals(amount))
        throw badRequest('payments.allocationMismatch', 'Allocations must add up to the payment amount');
      for (const a of input.allocations) {
        // One conditional update: concurrent payments can never take an invoice past its total.
        const updated = await tx.$executeRaw`
          UPDATE supplier_invoices SET amount_paid = amount_paid + ${a.amount}::numeric,
            status = CASE WHEN amount_paid + ${a.amount}::numeric = total THEN 'paid' ELSE 'open' END
          WHERE id = ${a.invoiceId}::uuid AND supplier_id = ${supplier.id}::uuid AND amount_paid + ${a.amount}::numeric <= total`;
        if (updated === 0) {
          const inv = await tx.supplierInvoice.findFirst({ where: { id: a.invoiceId, supplierId: supplier.id } });
          if (!inv) throw notFound('supplier_invoices');
          throw badRequest('payments.overpaid', 'Allocation exceeds the open amount of the invoice', {
            invoiceId: inv.id,
            open: inv.total.minus(inv.amountPaid).toFixed(2),
          });
        }
      }
      const id = randomUUID();
      const number = await nextDocumentNumber(tx, tenantId, 'supplier_payment', 'SPAY');
      const entry = await this.posting.post(tx, {
        tenantId,
        sourceType: 'supplier_payment',
        sourceId: id,
        purpose: 'payment',
        date: (await postingMoment(tx, tenantId, null)).businessDate,
        currency: await baseCurrency(tx, tenantId),
        memo: `${number} ${supplier.code}${input.reference ? ` ${input.reference}` : ''}`,
        postedBy: auth.userId,
        lines: [
          { accountId: await this.posting.resolve(tx, tenantId, 'accounts_payable'), debit: amount.toFixed(2) },
          {
            accountId: await this.posting.resolve(tx, tenantId, input.method === 'bank' ? 'bank' : 'cash_transfer'),
            credit: amount.toFixed(2),
          },
        ],
      });
      await tx.supplierPayment.create({
        data: {
          id,
          tenantId,
          number,
          supplierId: supplier.id,
          method: input.method,
          amount,
          reference: input.reference,
          journalEntryId: entry.id,
          createdBy: auth.userId,
          allocations: {
            create: input.allocations.map((a) => ({
              id: childId(id, `invoice:${a.invoiceId}`),
              tenantId,
              invoiceId: a.invoiceId,
              amount: D(a.amount),
            })),
          },
        },
      });
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'supplier_payment.posted',
        entityType: 'supplier_payment',
        entityId: id,
        changes: { number, method: input.method, amount: amount.toFixed(2), invoices: input.allocations.length },
      });
      return tx.supplierPayment.findUniqueOrThrow({ where: { id }, include: { allocations: true } });
    });
  }

  // ── Returns to supplier ────────────────────────────────────────────────────

  returns(auth: TenantContext) {
    return this.prisma.withTenant(auth.tenantId, async (tx) =>
      tx.supplierReturn.findMany({
        where: { tenantId: auth.tenantId, ...(await this.warehouseFilter(tx, auth)) },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  createReturn(auth: TenantContext, input: SupplierReturnCreateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const receipt = await tx.goodsReceipt.findFirst({ where: { id: input.receiptId, tenantId } });
      if (!receipt) throw notFound('goods_receipts');
      const warehouse = await this.visibleWarehouse(tx, auth, receipt.warehouseId, 'goods_receipts');
      if (new Set(input.lines.map((l) => l.receiptLineId)).size !== input.lines.length)
        throw badRequest('returns.duplicateLine', 'Each receipt line may appear once');
      const receiptLines = await this.lockReceiptLines(
        tx,
        tenantId,
        input.lines.map((l) => l.receiptLineId),
      );
      if (receiptLines.some((l) => l.receiptId !== receipt.id))
        throw badRequest('returns.unknownLine', 'Line is not part of this receipt');
      const items = await this.itemsById(
        tx,
        tenantId,
        receiptLines.map((l) => l.itemId),
      );
      const id = randomUUID();
      const lines = input.lines.map((l) => {
        const rl = receiptLines.find((x) => x.id === l.receiptLineId)!;
        const qtyBase = D(toBase(l.qty, l.unit, items.get(rl.itemId)!));
        const grniValue = this.clear(
          rl,
          qtyBase,
          'returns.exceedsUninvoiced',
          'Only received, not yet invoiced quantity can be returned',
        );
        rl.qtyReturnedBase = rl.qtyReturnedBase.plus(qtyBase);
        return { id: childId(id, `line:${rl.id}`), l, rl, qtyBase, grniValue };
      });
      const plan = await this.ledger.plan(
        tx,
        tenantId,
        lines.map((x): MovementInput => ({
          warehouseId: warehouse.id,
          itemId: x.rl.itemId,
          type: 'supplier_return',
          qtyBase: x.qtyBase.toString(),
          sourceType: 'supplier_return',
          sourceId: id,
          sourceLineId: x.id,
          reasonCode: input.reason,
        })),
        await postingMoment(tx, tenantId, warehouse.branchId),
      );
      if (plan.negative.length)
        throw badRequest('returns.insufficientStock', 'Not enough stock in the warehouse to return', plan.negative);
      const stockValue = (lineId: string) =>
        D(
          plan.movements.find((m) => m.movementType === 'supplier_return' && m.input.sourceLineId === lineId)!
            .totalCost,
        ).abs();
      const grniTotal = sum(lines.map((x) => x.grniValue));
      const stockTotal = sum(lines.map((x) => stockValue(x.id)));
      const grni = await this.posting.resolve(tx, tenantId, 'goods_received_not_invoiced');
      const variance = grniTotal.minus(stockTotal);
      const number = await nextDocumentNumber(tx, tenantId, 'supplier_return', 'RTN');
      const journalEntryId = await this.ledger.postPlan(tx, plan, {
        sourceType: 'supplier_return',
        sourceId: id,
        purpose: 'return',
        currency: await baseCurrency(tx, tenantId),
        memo: `${number} ${input.reason}`,
        branchId: warehouse.branchId,
        counterAccount: async () => grni,
        extra: variance.isZero()
          ? []
          : [
              { accountId: grni, amount: variance.toFixed(2) },
              {
                accountId: await this.posting.resolve(tx, tenantId, 'inventory_price_variance'),
                amount: variance.neg().toFixed(2),
              },
            ],
      });
      await tx.supplierReturn.create({
        data: {
          id,
          tenantId,
          number,
          supplierId: receipt.supplierId,
          receiptId: receipt.id,
          warehouseId: warehouse.id,
          reason: input.reason,
          journalEntryId,
          createdBy: auth.userId,
          lines: {
            create: lines.map((x) => ({
              id: x.id,
              tenantId,
              receiptLineId: x.rl.id,
              itemId: x.rl.itemId,
              qty: D(x.l.qty),
              unit: x.l.unit,
              qtyBase: x.qtyBase,
              grniValue: x.grniValue,
              stockValue: stockValue(x.id),
            })),
          },
        },
      });
      await this.ledger.commit(tx, plan, journalEntryId);
      await this.saveReceiptLines(tx, receiptLines);
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'supplier_return.posted',
        entityType: 'supplier_return',
        entityId: id,
        branchId: warehouse.branchId,
        changes: { number, receiptId: receipt.id, lines: lines.length },
      });
      return tx.supplierReturn.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    });
  }

  // ── Reconciliation ─────────────────────────────────────────────────────────

  /** Sub-ledgers against the GL: open invoices = accounts payable, uninvoiced receipts = GRNI. */
  reconciliation(auth: TenantContext) {
    this.requireAllBranches(auth);
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const invoices = await tx.supplierInvoice.findMany({ where: { tenantId } });
      const lines = await tx.goodsReceiptLine.findMany({ where: { tenantId } });
      const apOpen = sum(invoices.map((i) => i.total.minus(i.amountPaid)));
      const grniOpen = sum(lines.map((l) => l.goodsValue.minus(l.valueCleared)));
      const glPayable = (await this.glBalance(tx, tenantId, 'accounts_payable')).neg();
      const glGrni = (await this.glBalance(tx, tenantId, 'goods_received_not_invoiced')).neg();
      const accrued = (await this.glBalance(tx, tenantId, 'purchase_charges_accrual')).neg();
      return {
        openPayables: apOpen.toFixed(2),
        glPayables: glPayable.toFixed(2),
        payablesMatch: apOpen.equals(glPayable),
        uninvoicedReceipts: grniOpen.toFixed(2),
        glGoodsReceivedNotInvoiced: glGrni.toFixed(2),
        goodsReceivedMatch: grniOpen.equals(glGrni),
        accruedPurchaseCharges: accrued.toFixed(2),
      };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private requireAllBranches(auth: TenantContext) {
    if (!auth.allBranches)
      throw forbidden('purchasing.allBranchesRequired', 'Supplier invoices and payments need access to all branches');
  }

  private async supplier(tx: Tx, tenantId: string, id: string, includeArchived = false) {
    const s = await tx.supplier.findFirst({ where: { id, tenantId } });
    if (!s || (!includeArchived && s.archivedAt)) throw notFound('suppliers');
    return s;
  }

  /** A warehouse that can hold purchased stock (not transit). */
  private async stockWarehouse(tx: Tx, auth: TenantContext, id: string) {
    const w = await accessibleWarehouse(tx, auth, id);
    if (w.kind === 'transit') throw notFound('warehouses');
    return w;
  }

  /** The document's warehouse must be in the caller's scope; otherwise the document does not exist for them. */
  private async visibleWarehouse(tx: Tx, auth: TenantContext, id: string, resource: string) {
    try {
      return await accessibleWarehouse(tx, auth, id);
    } catch {
      throw notFound(resource);
    }
  }

  private async findOrder(tx: Tx, auth: TenantContext, id: string) {
    const order = await tx.purchaseOrder.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('purchase_orders');
    await this.visibleWarehouse(tx, auth, order.warehouseId, 'purchase_orders');
    return order;
  }

  private async warehouseFilter(tx: Tx, auth: TenantContext) {
    const scope = branchScope(auth);
    if (!scope) return {};
    const ids = await tx.warehouse.findMany({ where: { tenantId: auth.tenantId, branchId: { in: scope } } });
    return { warehouseId: { in: ids.map((w) => w.id) } };
  }

  private async itemsById(tx: Tx, tenantId: string, ids: string[]) {
    const items = await tx.inventoryItem.findMany({ where: { tenantId, id: { in: ids } } });
    if (items.length !== new Set(ids).size) throw badRequest('inventory.unknownItem', 'Item not found');
    return new Map(items.map((i) => [i.id, i]));
  }

  /** Receipt lines locked in id order, so invoices and returns over the same lines serialise. */
  private async lockReceiptLines(tx: Tx, tenantId: string, ids: string[]) {
    const unique = [...new Set(ids)].sort();
    if (unique.length === 0) return [];
    await tx.$queryRaw`SELECT id FROM goods_receipt_lines WHERE id = ANY(${unique}::uuid[]) ORDER BY id FOR UPDATE`;
    const lines = await tx.goodsReceiptLine.findMany({
      where: { tenantId, id: { in: unique } },
      include: { receipt: { select: { supplierId: true } } },
    });
    if (lines.length !== unique.length) throw notFound('goods_receipt_lines');
    return lines;
  }

  /**
   * GRNI value released by `qtyBase` of a receipt line: proportional to the received value, and the exact
   * remainder when it uses up the line, so a fully settled line always clears its goods value to the cent.
   */
  private clear(
    rl: {
      qtyBase: Decimal;
      qtyInvoicedBase: Decimal;
      qtyReturnedBase: Decimal;
      goodsValue: Decimal;
      valueCleared: Decimal;
    },
    qtyBase: Decimal,
    code: string,
    message: string,
  ) {
    const open = rl.qtyBase.minus(rl.qtyInvoicedBase).minus(rl.qtyReturnedBase);
    if (qtyBase.gt(open)) throw badRequest(code, message, { openQty: open.toString() });
    const value = qtyBase.equals(open)
      ? rl.goodsValue.minus(rl.valueCleared)
      : money(rl.goodsValue.mul(qtyBase).div(rl.qtyBase));
    rl.valueCleared = rl.valueCleared.plus(value);
    return value;
  }

  private async saveReceiptLines(
    tx: Tx,
    lines: { id: string; qtyInvoicedBase: Decimal; qtyReturnedBase: Decimal; valueCleared: Decimal }[],
  ) {
    for (const l of lines)
      await tx.goodsReceiptLine.update({
        where: { id: l.id },
        data: { qtyInvoicedBase: l.qtyInvoicedBase, qtyReturnedBase: l.qtyReturnedBase, valueCleared: l.valueCleared },
      });
  }

  private postingLines(amounts: Map<string, Decimal>): PostingLine[] {
    return [...amounts]
      .filter(([, v]) => !v.isZero())
      .map(([accountId, v]) =>
        v.isNegative() ? { accountId, credit: v.neg().toFixed(2) } : { accountId, debit: v.toFixed(2) },
      );
  }

  /** Debit − credit of the account a mapping key resolves to, over posted entries. */
  private async glBalance(tx: Tx, tenantId: string, mappingKey: string) {
    const accountId = await this.posting.resolve(tx, tenantId, mappingKey);
    const [row] = await tx.$queryRaw<{ balance: Prisma.Decimal | null }[]>`
      SELECT sum(l.debit - l.credit) AS balance FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      WHERE l.tenant_id = ${tenantId}::uuid AND l.account_id = ${accountId}::uuid`;
    return row?.balance ?? ZERO;
  }
}
