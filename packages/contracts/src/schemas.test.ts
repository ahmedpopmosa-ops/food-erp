import { describe, expect, it } from 'vitest';
import {
  branchCreateSchema,
  loginSchema,
  memberInviteSchema,
  roleCreateSchema,
  settingsUpdateSchema,
  tenantOnboardSchema,
} from './index';

describe('schemas', () => {
  it('normalises login email', () => {
    expect(loginSchema.parse({ email: '  Owner@Example.COM ', password: 'x' }).email).toBe('owner@example.com');
  });

  it('upper-cases and validates branch codes', () => {
    expect(branchCreateSchema.parse({ code: 'br1', nameAr: 'فرع', nameEn: 'Branch' }).code).toBe('BR1');
    expect(branchCreateSchema.safeParse({ code: 'B', nameAr: 'x', nameEn: 'x' }).success).toBe(false);
    expect(branchCreateSchema.safeParse({ code: 'BR-1', nameAr: 'x', nameEn: 'x' }).success).toBe(false);
  });

  it('rejects unknown timezones', () => {
    expect(branchCreateSchema.safeParse({ code: 'BR1', nameAr: 'x', nameEn: 'x', timezone: 'Mars/Base' }).success).toBe(
      false,
    );
    expect(
      branchCreateSchema.safeParse({ code: 'BR1', nameAr: 'x', nameEn: 'x', timezone: 'Africa/Cairo' }).success,
    ).toBe(true);
  });

  it('rejects unknown permissions and de-duplicates known ones', () => {
    expect(roleCreateSchema.safeParse({ name: 'Bad', permissions: ['root.all'] }).success).toBe(false);
    expect(roleCreateSchema.parse({ name: 'Ok', permissions: ['pos.sell', 'pos.sell'] }).permissions).toEqual([
      'pos.sell',
    ]);
  });

  it('requires branches when not all-branch access', () => {
    const base = { email: 'a@b.co', fullName: 'Al', roleId: '0192f0c4-7b1e-7c3a-8a4e-1f2d3c4b5a69' };
    expect(memberInviteSchema.safeParse({ ...base, allBranches: false, branchIds: [] }).success).toBe(false);
    expect(memberInviteSchema.safeParse({ ...base, allBranches: true }).success).toBe(true);
  });

  it('validates business day cutoff', () => {
    expect(settingsUpdateSchema.safeParse({ businessDayCutoff: '04:00', rowVersion: 1 }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ businessDayCutoff: '24:00', rowVersion: 1 }).success).toBe(false);
  });

  it('applies Egypt defaults on onboarding', () => {
    const parsed = tenantOnboardSchema.parse({
      legalName: 'Koshary House LLC',
      displayName: 'Koshary House',
      slug: 'koshary-house',
      planCode: 'starter',
      owner: { email: 'owner@koshary.test', fullName: 'Owner' },
      firstBranch: { code: 'NC1', nameAr: 'مدينة نصر', nameEn: 'Nasr City' },
    });
    expect(parsed).toMatchObject({
      countryCode: 'EG',
      baseCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      defaultLocale: 'ar-EG',
    });
  });
});
