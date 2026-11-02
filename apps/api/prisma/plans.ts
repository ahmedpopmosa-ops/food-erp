import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Placeholder plans (doc 09 Q10) — prices and limits are not final. `null` limit = unlimited.
 * Every plan lists every limit key: a missing key means "not entitled" (EntitlementsService).
 */
export const PLAN_SEED = [
  {
    code: 'starter',
    nameEn: 'Starter',
    nameAr: 'المبتدئ',
    price: '1500',
    trialDays: 14,
    limits: { 'limit.branches': 2, 'limit.users': 5, 'limit.devices': 2 },
  },
  {
    code: 'growth',
    nameEn: 'Growth',
    nameAr: 'النمو',
    price: '4500',
    trialDays: 14,
    limits: { 'limit.branches': 5, 'limit.users': 25, 'limit.devices': 10 },
  },
  {
    code: 'chain',
    nameEn: 'Chain',
    nameAr: 'السلاسل',
    price: '12000',
    trialDays: 0,
    limits: { 'limit.branches': null, 'limit.users': null, 'limit.devices': null },
  },
] as const;

/** Run with an owner connection (bypasses the platform-only write policy). */
export async function seedPlans(prisma: PrismaClient) {
  for (const p of PLAN_SEED) {
    const plan = await prisma.plan.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        billingInterval: 'month',
        price: new Prisma.Decimal(p.price),
        currencyCode: 'EGP',
        trialDays: p.trialDays,
      },
      update: { nameEn: p.nameEn, nameAr: p.nameAr },
    });
    for (const [featureKey, limitValue] of Object.entries(p.limits)) {
      await prisma.planEntitlement.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey } },
        create: { planId: plan.id, featureKey, limitValue },
        update: { limitValue },
      });
    }
  }
}
