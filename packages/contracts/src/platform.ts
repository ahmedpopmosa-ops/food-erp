import { z } from 'zod';
import { email } from './auth';
import { countryCode, currencyCode, ianaTimezone, locale } from './common';
import { branchCode } from './setup';

export const tenantSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, '3-40 lowercase letters, digits or dashes');

export const tenantOnboardSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(120),
  slug: tenantSlug,
  countryCode: countryCode.default('EG'),
  baseCurrency: currencyCode.default('EGP'),
  timezone: ianaTimezone.default('Africa/Cairo'),
  defaultLocale: locale.default('ar-EG'),
  planCode: z.string().trim().min(2).max(40),
  owner: z.object({ email, fullName: z.string().trim().min(2).max(120) }),
  firstBranch: z.object({
    code: branchCode,
    nameAr: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
  }),
});
export type TenantOnboardInput = z.infer<typeof tenantOnboardSchema>;

export const tenantStatusChangeSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const PLATFORM_ROLES = ['owner', 'support', 'billing', 'readonly'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
