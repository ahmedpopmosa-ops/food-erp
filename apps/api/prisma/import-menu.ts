// Imports the My Corner menu (prisma/menus/my-corner.ts) as its own restaurant, through the real services.
// DEVELOPMENT ONLY: it creates a dev owner account and dev till staff. Idempotent: existing branches,
// sections, items and staff are left as they are; missing ones are added.
import '../src/env';
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { hashPin } from '@ros/domain';
import { AppModule } from '../src/app.module';
import { OnboardingService } from '../src/platform/onboarding.service';
import { BranchesService } from '../src/setup/branches.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { DineInService } from '../src/catalog/dine-in.service';
import { hashPassword } from '../src/common/crypto';
import type { TenantContext } from '../src/common/auth-context';
import { DEV_PASSWORD, DEV_POS_PIN } from './dev-accounts';
import { illustration } from './menus/illustrations';
import { MY_CORNER } from './menus/my-corner';

const money = (n: number) => n.toFixed(2);

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to import dev data into production');
  const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_OWNER_URL });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const menu = MY_CORNER;
  const counts = { branches: 0, sections: 0, pictures: 0, sizeGroups: 0, items: 0, staff: 0 };
  try {
    // ── Restaurant, owner account and first branch ──
    let tenant = await owner.tenant.findUnique({ where: { slug: menu.tenant.slug } });
    if (!tenant) {
      const [first] = menu.branches;
      await app.get(OnboardingService).onboard(null, {
        legalName: menu.tenant.legalName,
        displayName: menu.tenant.displayName,
        slug: menu.tenant.slug,
        countryCode: 'EG',
        baseCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        defaultLocale: 'ar-EG',
        planCode: 'growth',
        owner: { email: menu.tenant.ownerEmail, fullName: 'My Corner Owner' },
        firstBranch: first!,
      });
      // Skip the invitation e-mail locally: set the password and activate the membership directly.
      const user = await owner.user.update({
        where: { email: menu.tenant.ownerEmail },
        data: { passwordHash: await hashPassword(DEV_PASSWORD) },
      });
      await owner.membership.updateMany({ where: { userId: user.id }, data: { status: 'active' } });
      tenant = await owner.tenant.findUniqueOrThrow({ where: { slug: menu.tenant.slug } });
      counts.branches++;
    }
    const tenantId = tenant.id;

    // The import acts as the restaurant's owner, so every change is audited under that account.
    const user = await owner.user.findUniqueOrThrow({ where: { email: menu.tenant.ownerEmail } });
    const membership = await owner.membership.findFirstOrThrow({
      where: { tenantId, userId: user.id },
      include: { role: true },
    });
    const auth: TenantContext = {
      sessionId: 'menu-import',
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: 'ar-EG',
      tenantId,
      tenantStatus: tenant.status,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleTemplate: membership.role.templateKey,
      permissions: [],
      allBranches: true,
      branchIds: [],
    };

    // ── Branches ──
    for (const b of menu.branches) {
      if (await owner.branch.findFirst({ where: { tenantId, code: b.code } })) continue;
      await app.get(BranchesService).create(auth, b);
      counts.branches++;
    }

    // ── Sections (categories) with their pictures ──
    const catalog = app.get(CatalogService);
    const categoryIds: string[] = [];
    for (const [sort, s] of menu.sections.entries()) {
      const image = illustration(s.image);
      const existing = await owner.category.findFirst({ where: { tenantId, nameAr: s.nameAr, archivedAt: null } });
      if (!existing) {
        categoryIds.push((await catalog.createCategory(auth, { nameAr: s.nameAr, nameEn: s.nameEn, sort, image })).id);
        counts.sections++;
      } else {
        categoryIds.push(existing.id);
        if (!existing.image) {
          await catalog.updateCategory(auth, existing.id, { image, rowVersion: existing.rowVersion });
          counts.pictures++;
        }
      }
    }

    // ── Size choice (medium at the base price, large at +delta): one group per price difference ──
    const dineIn = app.get(DineInService);
    const sizeGroup = new Map<number, string>();
    const deltas = new Set(menu.sections.flatMap((s) => s.items.flatMap((i) => (i.length === 4 ? [i[3] - i[2]] : []))));
    for (const delta of [...deltas].sort((a, b) => a - b)) {
      const nameEn = `Size (large +${delta})`;
      const existing = await owner.modifierGroup.findFirst({ where: { tenantId, nameEn, archivedAt: null } });
      const id =
        existing?.id ??
        (
          await dineIn.createModifierGroup(auth, {
            nameAr: 'الحجم',
            nameEn,
            minSelect: 1,
            maxSelect: 1,
            modifiers: [
              { nameAr: 'وسط', nameEn: 'Medium', priceDelta: '0' },
              { nameAr: 'كبير', nameEn: 'Large', priceDelta: money(delta) },
            ],
          })
        ).id;
      if (!existing) counts.sizeGroups++;
      sizeGroup.set(delta, id);
    }

    // ── Items ──
    const standard = await owner.taxCategory.findFirstOrThrow({ where: { tenantId, code: 'STANDARD' } });
    for (const [i, s] of menu.sections.entries()) {
      for (const item of s.items) {
        const [nameAr, nameEn, price] = item;
        const categoryId = categoryIds[i]!;
        if (await owner.product.findFirst({ where: { tenantId, categoryId, nameAr, archivedAt: null } })) continue;
        const product = await catalog.createProduct(auth, {
          nameAr,
          nameEn,
          categoryId,
          taxCategoryId: standard.id,
          price: money(price),
        });
        if (item.length === 4) await dineIn.setProductGroups(auth, product.id, [sizeGroup.get(item[3] - price)!]);
        counts.items++;
      }
    }

    // ── Till staff for the first branch (like the demo restaurant): cashier C1, manager M1 ──
    const firstBranch = await owner.branch.findFirstOrThrow({ where: { tenantId, code: menu.branches[0]!.code } });
    const pinHash = await hashPin(DEV_POS_PIN);
    for (const [employeeNo, nameEn, nameAr, template] of [
      ['C1', 'Cashier', 'كاشير', 'cashier'],
      ['M1', 'Shift Manager', 'مدير الوردية', 'manager'],
    ] as const) {
      if (await owner.employee.findFirst({ where: { tenantId, employeeNo } })) continue;
      const role = await owner.role.findFirstOrThrow({ where: { tenantId, templateKey: template } });
      await owner.employee.create({
        data: {
          tenantId,
          employeeNo,
          fullNameEn: nameEn,
          fullNameAr: nameAr,
          roleId: role.id,
          posPinHash: pinHash,
          branches: { create: [{ tenantId, branchId: firstBranch.id }] },
        },
      });
      counts.staff++;
    }

    const total = await owner.product.count({ where: { tenantId, archivedAt: null } });
    console.warn(`My Corner: added ${JSON.stringify(counts)}; ${total} active items in total.`);
    console.warn(`Owner ${menu.tenant.ownerEmail} (password in prisma/dev-accounts.ts); till staff C1 / M1.`);
  } finally {
    await app.close();
    await owner.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
