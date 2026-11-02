import { z } from 'zod';
import { ianaTimezone, nullableText, optionalText, rowVersion } from './common';

export const branchCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,6}$/, '2-6 letters or digits; printed on receipt numbers');

export const branchCreateSchema = z.object({
  code: branchCode,
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  timezone: ianaTimezone.optional(),
  address: optionalText(300),
  phone: optionalText(30),
  taxRegistrationNo: optionalText(40),
});
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;

/** The branch code is immutable: it is embedded in receipt and document numbers. */
export const branchUpdateSchema = z.object({
  nameAr: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().min(1).max(120).optional(),
  timezone: ianaTimezone.optional(),
  address: nullableText(300),
  phone: nullableText(30),
  taxRegistrationNo: nullableText(40),
  status: z.enum(['active', 'closed']).optional(),
  rowVersion,
});
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

/**
 * Tenant-wide operational settings. `valuationMethod` is intentionally not updatable here: changing it once
 * stock movements exist requires a revaluation procedure (ADR-0008), built with the inventory module.
 */
export const settingsUpdateSchema = z.object({
  priceIncludesTax: z.boolean().optional(),
  taxRounding: z.enum(['line', 'document']).optional(),
  allowNegativeStock: z.boolean().optional(),
  businessDayCutoff: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM')
    .optional(),
  leaseDays: z.number().int().min(1).max(30).optional(),
  refundReturnsStockDefault: z.boolean().optional(),
  /** Dine-in service charge as a fraction (0.12 = 12 %); 0 disables it. */
  serviceChargeRate: z
    .string()
    .regex(/^0(\.\d{1,6})?$/)
    .optional(),
  /** Tax category whose sale rates apply to the service charge; null = untaxed. */
  serviceChargeTaxCategoryId: z.string().uuid().nullable().optional(),
  /** Largest discount (fraction of a line) a cashier may give without a manager approval. */
  maxDiscountPct: z
    .string()
    .regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/)
    .optional(),
  rowVersion,
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
