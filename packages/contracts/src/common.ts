import { z } from 'zod';

export const uuid = z.string().uuid();

/** Trims, and turns "" into undefined so optional text fields can be cleared by omission. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

export const ianaTimezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Unknown IANA timezone' },
);

export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code, e.g. EGP');
export const countryCode = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 code, e.g. EG');
export const locale = z.enum(['ar-EG', 'en-US']);

export const rowVersion = z.number().int().positive();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Error body returned by every API error. `code` is stable and translated by the clients. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
