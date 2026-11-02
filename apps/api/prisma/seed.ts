// Development seed: plans, one operator and one demo restaurant onboarded through the real service.
// DEVELOPMENT ONLY. The dev accounts below exist only in a local database; never run this in production.
import '../src/env';
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OnboardingService } from '../src/platform/onboarding.service';
import { hashPassword } from '../src/common/crypto';
import { hashPin } from '@ros/domain';
import { seedPlans } from './plans';
import { syncPermissions } from './sync-permissions';
import { DEV_PASSWORD, DEV_POS_PIN } from './dev-accounts';

// Dev accounts (local only): operator ops@restaurantos.local, owner owner@demo.local; POS staff C1 (cashier)
// and M1 (manager) of branch NC1. Credentials in ./dev-accounts.
export { DEV_PASSWORD, DEV_POS_PIN };

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');
  const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_OWNER_URL });
  try {
    await syncPermissions(owner);
    await seedPlans(owner);
    const passwordHash = await hashPassword(DEV_PASSWORD);
    await owner.platformUser.upsert({
      where: { email: 'ops@restaurantos.local' },
      create: { email: 'ops@restaurantos.local', fullName: 'Platform Operator', role: 'owner', passwordHash },
      update: {},
    });

    if (!(await owner.tenant.findUnique({ where: { slug: 'demo' } }))) {
      const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
      await app.get(OnboardingService).onboard(null, {
        legalName: 'Demo Restaurant LLC',
        displayName: 'مطعم تجريبي',
        slug: 'demo',
        countryCode: 'EG',
        baseCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        defaultLocale: 'ar-EG',
        planCode: 'growth',
        owner: { email: 'owner@demo.local', fullName: 'Demo Owner' },
        firstBranch: { code: 'NC1', nameAr: 'مدينة نصر', nameEn: 'Nasr City' },
      });
      await app.close();
      // Skip the invitation e-mail locally: set the password and activate the membership directly.
      const user = await owner.user.update({ where: { email: 'owner@demo.local' }, data: { passwordHash } });
      await owner.membership.updateMany({ where: { userId: user.id }, data: { status: 'active' } });
    }

    // POS staff for the demo branch (idempotent): a cashier and a manager who can approve at the till.
    const tenant = await owner.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
    const branch = await owner.branch.findFirstOrThrow({ where: { tenantId: tenant.id, code: 'NC1' } });
    const pinHash = await hashPin(DEV_POS_PIN);
    for (const [employeeNo, nameEn, nameAr, template] of [
      ['C1', 'Demo Cashier', 'كاشير تجريبي', 'cashier'],
      ['M1', 'Demo Manager', 'مدير تجريبي', 'manager'],
    ] as const) {
      if (await owner.employee.findFirst({ where: { tenantId: tenant.id, employeeNo } })) continue;
      const role = await owner.role.findFirstOrThrow({ where: { tenantId: tenant.id, templateKey: template } });
      await owner.employee.create({
        data: {
          tenantId: tenant.id,
          employeeNo,
          fullNameEn: nameEn,
          fullNameAr: nameAr,
          roleId: role.id,
          posPinHash: pinHash,
          branches: { create: [{ tenantId: tenant.id, branchId: branch.id }] },
        },
      });
    }
    console.warn('Seed complete. Dev accounts: ops@restaurantos.local (operator), owner@demo.local (tenant owner).');
    console.warn(
      'POS staff of branch NC1: C1 (cashier) and M1 (manager); PIN in DEV_POS_PIN (prisma/dev-accounts.ts).',
    );
  } finally {
    await owner.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
