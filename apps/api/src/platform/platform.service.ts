import { HttpStatus, Injectable } from '@nestjs/common';
import { tenantStatus } from '@ros/domain';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSessionsService } from './platform-sessions.service';
import { AuditService } from '../identity/audit/audit.service';
import { AppError, badRequest, notFound } from '../common/errors';
import { verifyPassword } from '../common/crypto';
import type { PlatformContext } from '../common/auth-context';
import { config } from '../config';

type TenantStatus = 'onboarding' | 'active' | 'suspended' | 'closed';

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: PlatformSessionsService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const user = await this.prisma.withPlatform((tx) => tx.platformUser.findUnique({ where: { email } }));
    const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
    const ok = await verifyPassword(user && !locked && !user.disabledAt ? user.passwordHash : null, password);
    if (!user || !ok) {
      if (user && !locked) {
        const failures = user.failedLoginCount + 1;
        const lock = failures >= config().LOGIN_LOCKOUT_THRESHOLD;
        await this.prisma.withPlatform((tx) =>
          tx.platformUser.update({
            where: { id: user.id },
            data: lock
              ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + config().LOGIN_LOCKOUT_MINUTES * 60_000) }
              : { failedLoginCount: failures },
          }),
        );
      }
      throw new AppError(HttpStatus.UNAUTHORIZED, 'auth.invalidCredentials', 'Invalid email or password');
    }
    await this.prisma.withPlatform(async (tx) => {
      await tx.platformUser.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      await tx.platformAuditLog.create({
        data: {
          platformUserId: user.id,
          action: 'platform.login',
          targetType: 'platform_user',
          targetId: user.id,
          ip: meta.ip,
          requestId: meta.requestId,
        },
      });
    });
    return this.sessions.create(user.id, meta);
  }

  listPlans() {
    return this.prisma.withPlatform((tx) =>
      tx.plan.findMany({ where: { archivedAt: null }, include: { entitlements: true }, orderBy: { price: 'asc' } }),
    );
  }

  listTenants(q: { search?: string; page: number; pageSize: number }) {
    const where = q.search
      ? {
          OR: [
            { slug: { contains: q.search.toLowerCase() } },
            { displayName: { contains: q.search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    return this.prisma.withPlatform(async (tx) => {
      const [items, total] = await Promise.all([
        tx.tenant.findMany({
          where,
          include: {
            subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: { select: { code: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.tenant.count({ where }),
      ]);
      return {
        items: items.map(({ subscriptions, ...t }) => ({
          ...t,
          subscription: subscriptions[0]
            ? {
                status: subscriptions[0].status,
                plan: subscriptions[0].plan.code,
                currentPeriodEnd: subscriptions[0].currentPeriodEnd,
              }
            : null,
        })),
        page: q.page,
        pageSize: q.pageSize,
        total,
      };
    });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.withPlatform((tx) =>
      tx.tenant.findUnique({
        where: { id },
        include: {
          subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
          _count: { select: { branches: true, memberships: true } },
        },
      }),
    );
    if (!tenant) throw notFound('tenants');
    return tenant;
  }

  /** Suspension makes the tenant read-only for its users (AccessGuard); data is untouched. */
  changeStatus(platform: PlatformContext, id: string, to: TenantStatus, reason: string) {
    return this.prisma.withPlatform(
      async (tx) => {
        const tenant = await tx.tenant.findUnique({ where: { id } });
        if (!tenant) throw notFound('tenants');
        if (!tenantStatus.can(tenant.status as TenantStatus, to)) {
          throw badRequest('invalid_state_transition', `Tenant cannot go from ${tenant.status} to ${to}`);
        }
        const updated = await tx.tenant.update({ where: { id }, data: { status: to } });
        const changes = { status: { from: tenant.status, to }, reason };
        await this.audit.recordPlatform(tx, platform, {
          action: `tenant.${to}`,
          targetType: 'tenant',
          targetId: id,
          tenantId: id,
          changes,
        });
        await this.audit.record(tx, id, this.audit.platform(platform), {
          action: `tenant.${to}`,
          entityType: 'tenant',
          entityId: id,
          changes,
        });
        return updated;
      },
      { tenantId: id },
    );
  }
}
