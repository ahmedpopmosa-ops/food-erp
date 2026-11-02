import { z } from 'zod';
import { rowVersion, uuid } from './common';

/** Money/quantity travel as decimal strings (ADR-0006). */
export const moneyString = z.string().regex(/^\d{1,13}(\.\d{1,4})?$/, 'Decimal amount, e.g. 45.50');
export const qtyString = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, 'Decimal quantity');
export const rateString = z.string().regex(/^0(\.\d{1,6})?$|^1(\.0{1,6})?$/, 'Rate between 0 and 1, e.g. 0.14');

export const CHANNELS = ['dine_in', 'takeaway', 'delivery', 'phone'] as const;
export const channel = z.enum(CHANNELS);

const names = { nameAr: z.string().trim().min(1).max(120), nameEn: z.string().trim().min(1).max(120) };

/** A picture as a data URL (SVG, PNG, JPEG or WebP), small enough to sync to every till. */
export const categoryImage = z
  .string()
  .max(350_000, 'Image too large (max ~256 KB)')
  .regex(/^data:image\/(svg\+xml|png|jpeg|webp)(;base64)?,/, 'SVG, PNG, JPEG or WebP image');

export const categoryCreateSchema = z.object({
  ...names,
  sort: z.number().int().min(0).max(10_000).default(0),
  image: categoryImage.nullish(),
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z.object({
  nameAr: names.nameAr.optional(),
  nameEn: names.nameEn.optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
  image: categoryImage.nullable().optional(),
  rowVersion,
});
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

/**
 * Creates a product with its default variant and an all-branch price valid from now. Further variants,
 * branch/channel prices and scheduled changes use their own endpoints.
 */
export const productCreateSchema = z.object({
  ...names,
  categoryId: uuid,
  taxCategoryId: uuid,
  sku: z.string().trim().max(40).optional(),
  price: moneyString,
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z.object({
  nameAr: names.nameAr.optional(),
  nameEn: names.nameEn.optional(),
  categoryId: uuid.optional(),
  taxCategoryId: uuid.optional(),
  archived: z.boolean().optional(),
  rowVersion,
});
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Price change for a variant: closes the current row and opens a new one at `validFrom` (default now). */
export const priceChangeSchema = z.object({
  price: moneyString,
  branchId: uuid.nullable().default(null),
  channel: channel.nullable().default(null),
  validFrom: z.string().datetime().optional(),
});
export type PriceChangeInput = z.infer<typeof priceChangeSchema>;

export const modifierGroupCreateSchema = z
  .object({
    ...names,
    minSelect: z.number().int().min(0).max(20).default(0),
    maxSelect: z.number().int().min(1).max(20).default(1),
    modifiers: z
      .array(
        z.object({
          ...names,
          priceDelta: z
            .string()
            .regex(/^-?\d{1,9}(\.\d{1,4})?$/, 'Price change, e.g. 5.00 or -2.50')
            .default('0'),
        }),
      )
      .min(1)
      .max(50),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'minSelect cannot exceed maxSelect', path: ['minSelect'] });
export type ModifierGroupCreateInput = z.infer<typeof modifierGroupCreateSchema>;

export const productModifierGroupsSchema = z.object({ groupIds: z.array(uuid).max(20) });

export const tableCreateSchema = z.object({
  label: z.string().trim().min(1).max(12),
  seats: z.number().int().min(1).max(50).default(4),
  areaNameAr: z.string().trim().min(1).max(60).default('الصالة'),
  areaNameEn: z.string().trim().min(1).max(60).default('Main hall'),
});
export type TableCreateInput = z.infer<typeof tableCreateSchema>;

/**
 * Edits a table. Moving it to another area names the area (found or created, like on create). Tables are
 * deactivated, never deleted: past orders and invoices point at them.
 */
export const tableUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(12).optional(),
    seats: z.number().int().min(1).max(50).optional(),
    areaNameAr: z.string().trim().min(1).max(60).optional(),
    areaNameEn: z.string().trim().min(1).max(60).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => (v.areaNameAr === undefined) === (v.areaNameEn === undefined), {
    message: 'Give the area name in both languages',
    path: ['areaNameEn'],
  });
export type TableUpdateInput = z.infer<typeof tableUpdateSchema>;

export const discountSpec = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('percent'),
    value: z.string().regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/, 'Fraction 0-1, e.g. 0.10'),
  }),
  z.object({ kind: z.literal('amount'), value: moneyString }),
]);

export const paymentMethodKinds = [
  'cash',
  'card',
  'wallet',
  'bank_transfer',
  'on_account',
  'voucher',
  'other',
] as const;
