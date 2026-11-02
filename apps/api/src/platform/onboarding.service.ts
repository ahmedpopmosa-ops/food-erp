import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ROLE_TEMPLATES, type TenantOnboardInput } from '@ros/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { TokensService } from '../identity/auth/tokens.service';
import { AccountingSetupService } from '../accounting/accounting-setup.service';
import { CatalogSetupService } from '../catalog/catalog-setup.service';
import { badRequest, conflict } from '../common/errors';
import type { PlatformContext } from '../common/auth-context';

const DAY = 24 * 3600_000;

/**
 * Creates a ready-to-use tenant in one transaction: tenant, settings, trial subscription, system roles from
 * the templates, first branch with its main warehouse, the tenant transit warehouse, the owner's membership,
 * the default chart of accounts with the current fiscal year, the country tax template and payment methods.
 * The owner receives an invitation link after commit.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly accounting: AccountingSetupService,
    private readonly catalog: CatalogSetupService,
  ) {}

  /** Adds accounting and catalog foundations to a tenant created before they existed. Idempotent. */
  ensureFoundations(tenantId: string) {
    return this.prisma.withPlatform(
      async (tx) => {
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const accounts = await this.accounting.seed(tx, tenantId, { timezone: tenant.timezone });
        const catalog = await this.catalog.seed(tx, tenantId, tenant.countryCode);
        return { accounts, catalog };
      },
      { tenantId },
    );
  }

  async onboard(platform: PlatformContext | null, input: TenantOnboardInput) {
    const tenantId = randomUUID();
    const result = await this.prisma.withPlatform(
      async (tx) => {
        const plan = await tx.plan.findFirst({ where: { code: input.planCode, archivedAt: null } });
        if (!plan) throw badRequest('plans.unknown', 'Unknown or archived plan');
        if (await tx.tenant.findUnique({ where: { slug: input.slug } })) {
          throw conflict('tenants.duplicateSlug', 'This slug is already taken');
        }

        const now = new Date();
        await tx.tenant.create({
          data: {
            id: tenantId,
            legalName: input.legalName,
            displayName: input.displayName,
            slug: input.slug,
            countryCode: input.countryCode,
            defaultLocale: input.defaultLocale,
            baseCurrency: input.baseCurrency,
            timezone: input.timezone,
            status: 'active',
          },
        });
        await tx.tenantSettings.create({ data: { tenantId } });
        const trialEnd = new Date(now.getTime() + Math.max(plan.trialDays, 1) * DAY);
        await tx.subscription.create({
          data: {
            tenantId,
            planId: plan.id,
            status: plan.trialDays > 0 ? 'trialing' : 'active',
            trialEndsAt: plan.trialDays > 0 ? trialEnd : null,
            currentPeriodStart: now,
            currentPeriodEnd: trialEnd,
          },
        });

        let ownerRoleId = '';
        for (const template of ROLE_TEMPLATES) {
          const role = await tx.role.create({
            data: {
              tenantId,
              name: input.defaultLocale.startsWith('ar') ? template.nameAr : template.nameEn,
              templateKey: template.key,
              isSystem: true,
            },
          });
          await tx.rolePermission.createMany({
            data: template.permissions.map((permissionKey) => ({ tenantId, roleId: role.id, permissionKey })),
          });
          if (template.key === 'owner') ownerRoleId = role.id;
        }

        const branch = await tx.branch.create({
          data: {
            tenantId,
            code: input.firstBranch.code,
            nameAr: input.firstBranch.nameAr,
            nameEn: input.firstBranch.nameEn,
            timezone: input.timezone,
            currencyCode: input.baseCurrency,
          },
        });
        await tx.warehouse.createMany({
          data: [
            {
              tenantId,
              branchId: branch.id,
              code: `${branch.code}-MAIN`,
              name: `${branch.nameEn} main store`,
              kind: 'main',
            },
            { tenantId, branchId: null, code: 'TRANSIT', name: 'Goods in transit', kind: 'transit' },
          ],
        });
        await this.accounting.seed(tx, tenantId, { timezone: input.timezone, now });
        await this.catalog.seed(tx, tenantId, input.countryCode);

        const owner =
          (await tx.user.findUnique({ where: { email: input.owner.email } })) ??
          (await tx.user.create({
            data: { email: input.owner.email, fullName: input.owner.fullName, locale: input.defaultLocale },
          }));
        const membership = await tx.membership.create({
          data: {
            tenantId,
            userId: owner.id,
            roleId: ownerRoleId,
            status: owner.passwordHash ? 'active' : 'invited',
            allBranches: true,
          },
        });
        const inviteToken = owner.passwordHash ? null : await this.tokens.issue(owner.id, 'invite', tx);

        const actor = platform ? this.audit.platform(platform) : ({ kind: 'system' } as const);
        await this.audit.record(tx, tenantId, actor, {
          action: 'tenant.onboarded',
          entityType: 'tenant',
          entityId: tenantId,
          changes: { slug: input.slug, plan: plan.code, ownerMembershipId: membership.id },
        });
        await this.audit.recordPlatform(tx, platform, {
          action: 'tenant.onboarded',
          targetType: 'tenant',
          targetId: tenantId,
          tenantId,
          changes: { slug: input.slug, plan: plan.code },
        });
        return {
          ownerUserId: owner.id,
          ownerEmail: owner.email,
          branchId: branch.id,
          membershipId: membership.id,
          inviteToken,
        };
      },
      { tenantId },
    );

    if (result.inviteToken) await this.tokens.sendInvite(result.ownerEmail, result.inviteToken, input.displayName);
    else await this.tokens.sendMemberAdded(result.ownerEmail, input.displayName);
    return {
      tenantId,
      ownerUserId: result.ownerUserId,
      branchId: result.branchId,
      membershipId: result.membershipId,
      invitationSent: result.inviteToken !== null,
    };
  }
}
