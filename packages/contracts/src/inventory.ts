import { z } from 'zod';
import { uuid } from './common';

const qty = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, 'Positive decimal quantity');
const signedQty = z.string().regex(/^-?\d{1,9}(\.\d{1,6})?$/, 'Decimal quantity');
const unitCost = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, 'Cost per unit');
const unit = z.string().trim().min(1).max(12);
const fraction = z.string().regex(/^0(\.\d{1,6})?$/, 'Fraction below 1, e.g. 0.05');
const names = { nameAr: z.string().trim().min(1).max(120), nameEn: z.string().trim().min(1).max(120) };

export const ITEM_KINDS = ['ingredient', 'semi_finished', 'resale', 'packaging', 'consumable'] as const;

export const inventoryItemCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,20}$/),
  ...names,
  kind: z.enum(ITEM_KINDS).default('ingredient'),
  baseUnit: z.enum(['g', 'ml', 'pc']),
  /** Cost per base unit used when an item is issued before anything was ever received. */
  standardCost: unitCost.default('0'),
  /** Item-specific units → base-unit factor, e.g. { "box": "24" } or { "pc": "180" } for onions. */
  conversions: z.record(z.string().regex(/^[a-z]{1,12}$/), z.string().regex(/^\d{1,9}(\.\d{1,6})?$/)).default({}),
  minQty: qty.nullable().default(null),
});
export type InventoryItemCreateInput = z.infer<typeof inventoryItemCreateSchema>;

/** Creates a new active recipe version for a product variant (the previous one is retired, never edited). */
export const recipeVersionCreateSchema = z.object({
  variantId: uuid,
  yieldQty: qty.default('1'),
  lines: z
    .array(z.object({ itemId: uuid, qty, unit, wastePct: fraction.default('0') }))
    .min(1)
    .max(100),
});
export type RecipeVersionCreateInput = z.infer<typeof recipeVersionCreateSchema>;

export const STOCK_ADJUSTMENT_KINDS = ['opening_balance', 'adjustment', 'wastage', 'spoilage'] as const;

export const stockAdjustmentCreateSchema = z
  .object({
    warehouseId: uuid,
    kind: z.enum(STOCK_ADJUSTMENT_KINDS),
    reason: z.string().trim().min(2).max(200),
    lines: z
      .array(z.object({ itemId: uuid, qty: signedQty, unit, unitCost: unitCost.optional() }))
      .min(1)
      .max(500),
  })
  .superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      const negative = l.qty.startsWith('-');
      if (negative && v.kind !== 'adjustment')
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'qty'], message: 'Only adjustments may be negative' });
      if (v.kind === 'opening_balance' && !l.unitCost)
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'unitCost'], message: 'Opening balances need a unit cost' });
      if (/^-?0+(\.0+)?$/.test(l.qty))
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'qty'], message: 'Quantity cannot be zero' });
    });
  });
export type StockAdjustmentCreateInput = z.infer<typeof stockAdjustmentCreateSchema>;

export const stockCountCreateSchema = z.object({ warehouseId: uuid });
export const stockCountLinesSchema = z.object({
  lines: z
    .array(z.object({ itemId: uuid, countedQty: z.string().regex(/^\d{1,9}(\.\d{1,6})?$/), unit }))
    .min(1)
    .max(2000),
});
export type StockCountLinesInput = z.infer<typeof stockCountLinesSchema>;

export const stockTransferCreateSchema = z
  .object({
    fromWarehouseId: uuid,
    toWarehouseId: uuid,
    lines: z
      .array(z.object({ itemId: uuid, qty, unit }))
      .min(1)
      .max(500),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: 'Choose two different warehouses',
    path: ['toWarehouseId'],
  });
export type StockTransferCreateInput = z.infer<typeof stockTransferCreateSchema>;

export const stockTransferReceiveSchema = z.object({
  lines: z
    .array(z.object({ itemId: uuid, qtyReceived: z.string().regex(/^\d{1,9}(\.\d{1,6})?$/), unit }))
    .min(1)
    .max(500),
});
export type StockTransferReceiveInput = z.infer<typeof stockTransferReceiveSchema>;
