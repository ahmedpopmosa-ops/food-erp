import { z } from 'zod';
import { optionalText, uuid } from './common';

const qty = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, 'Positive decimal quantity');
const price = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, 'Price per unit');
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Amount with at most 2 decimals');
const unit = z.string().trim().min(1).max(12);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date YYYY-MM-DD');
const positive = (v: string) => !/^0+(\.0+)?$/.test(v);

export const supplierCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,20}$/),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  taxNumber: optionalText(40),
  phone: optionalText(30),
  email: z.string().trim().email().max(200).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(0),
});
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;

export const purchaseOrderCreateSchema = z.object({
  supplierId: uuid,
  warehouseId: uuid,
  expectedDate: ymd.optional(),
  notes: optionalText(500),
  lines: z
    .array(z.object({ itemId: uuid, qty: qty.refine(positive, 'Quantity cannot be zero'), unit, unitPrice: price }))
    .min(1)
    .max(200),
});
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

/**
 * Goods receipt (GRN). Against an approved purchase order, or direct from a supplier when `orderId` is absent.
 * `unitPrice` is per `unit`, excluding VAT; against an order it defaults to the order price. Charges (freight,
 * customs, handling) are capitalised into the received stock, allocated by goods value.
 */
export const goodsReceiptCreateSchema = z
  .object({
    orderId: uuid.optional(),
    supplierId: uuid.optional(),
    warehouseId: uuid.optional(),
    supplierRef: optionalText(60),
    charges: z
      .array(z.object({ description: z.string().trim().min(1).max(120), amount: money.refine(positive) }))
      .max(10)
      .default([]),
    lines: z
      .array(
        z.object({
          itemId: uuid,
          qty: qty.refine(positive, 'Quantity cannot be zero'),
          unit,
          unitPrice: price.optional(),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((v, ctx) => {
    if (!v.orderId && (!v.supplierId || !v.warehouseId))
      ctx.addIssue({ code: 'custom', path: ['supplierId'], message: 'Direct receipts need a supplier and warehouse' });
    if (!v.orderId)
      v.lines.forEach((l, i) => {
        if (!l.unitPrice)
          ctx.addIssue({ code: 'custom', path: ['lines', i, 'unitPrice'], message: 'Direct receipts need a price' });
      });
  });
export type GoodsReceiptCreateInput = z.infer<typeof goodsReceiptCreateSchema>;

/**
 * Supplier invoice. Goods lines match receipt lines (the quantity invoiced, in any unit of the item); other
 * lines (freight, services) post to a chosen account. `total` is the printed invoice total and must match.
 */
export const supplierInvoiceCreateSchema = z
  .object({
    supplierId: uuid,
    supplierInvoiceNo: z.string().trim().min(1).max(60),
    invoiceDate: ymd,
    dueDate: ymd.optional(),
    total: money,
    lines: z
      .array(
        z.object({
          receiptLineId: uuid.optional(),
          qty: qty.refine(positive, 'Quantity cannot be zero').optional(),
          unit: unit.optional(),
          accountId: uuid.optional(),
          description: optionalText(200),
          amount: money,
          taxAmount: money.default('0'),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      const goods = !!l.receiptLineId;
      if (goods && (!l.qty || !l.unit))
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'qty'], message: 'Goods lines need a quantity and unit' });
      if (goods === !!l.accountId)
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i],
          message: 'A line matches a receipt line or posts to an account, not both',
        });
    });
    if (v.dueDate && v.dueDate < v.invoiceDate)
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due date is before the invoice date' });
  });
export type SupplierInvoiceCreateInput = z.infer<typeof supplierInvoiceCreateSchema>;

/** Payment to a supplier, fully allocated to that supplier's open invoices (no unallocated advances yet). */
export const supplierPaymentCreateSchema = z
  .object({
    supplierId: uuid,
    method: z.enum(['cash', 'bank']),
    amount: money.refine(positive, 'Amount cannot be zero'),
    reference: optionalText(80),
    allocations: z
      .array(z.object({ invoiceId: uuid, amount: money.refine(positive, 'Amount cannot be zero') }))
      .min(1)
      .max(100),
  })
  .refine((v) => new Set(v.allocations.map((a) => a.invoiceId)).size === v.allocations.length, {
    message: 'Each invoice may appear once',
    path: ['allocations'],
  });
export type SupplierPaymentCreateInput = z.infer<typeof supplierPaymentCreateSchema>;

/** Return to supplier of received, not yet invoiced goods (after invoicing a supplier credit note is needed). */
export const supplierReturnCreateSchema = z.object({
  receiptId: uuid,
  reason: z.string().trim().min(2).max(200),
  lines: z
    .array(z.object({ receiptLineId: uuid, qty: qty.refine(positive, 'Quantity cannot be zero'), unit }))
    .min(1)
    .max(200),
});
export type SupplierReturnCreateInput = z.infer<typeof supplierReturnCreateSchema>;
