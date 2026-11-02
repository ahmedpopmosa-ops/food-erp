import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomToken, sha256 } from '../../common/crypto';
import type { AuthContext } from '../../common/auth-context';
import { config } from '../../config';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const HOUR = 3600_000;

export interface ResolvedSession {
  auth: AuthContext;
  csrfTokenHash: string;
}

/**
 * Opaque server-side sessions (ADR-0009). The browser holds random tokens; the database stores only their
 * SHA-256, so a leaked sessions table cannot be replayed. Revocation is deleting the row. The membership,
 * role and permissions are re-read on every request, so disabling a member takes effect immediately.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, activeTenantId: string | null, meta: { ip?: string; userAgent?: string }) {
    const token = randomToken();
    const csrfToken = randomToken();
    const now = Date.now();
    const expiresAt = new Date(now + config().SESSION_ABSOLUTE_HOURS * HOUR);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        csrfTokenHash: sha256(csrfToken),
        activeTenantId,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
        idleExpiresAt: new Date(now + config().SESSION_IDLE_HOURS * HOUR),
        expiresAt,
      },
    });
    return { token, csrfToken, expiresAt };
  }

  async resolve(token: string): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now || session.idleExpiresAt.getTime() <= now || session.user.disabledAt) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), idleExpiresAt: new Date(now + config().SESSION_IDLE_HOURS * HOUR) },
      });
    }

    const tenantPart = session.activeTenantId
      ? await this.loadMembership(session.activeTenantId, session.userId)
      : null;

    return {
      csrfTokenHash: session.csrfTokenHash,
      auth: {
        sessionId: session.id,
        userId: session.userId,
        email: session.user.email,
        fullName: session.user.fullName,
        locale: session.user.locale,
        tenantId: tenantPart?.tenantId ?? null,
        tenantStatus: tenantPart?.tenantStatus ?? null,
        membershipId: tenantPart?.membershipId ?? null,
        roleId: tenantPart?.roleId ?? null,
        roleTemplate: tenantPart?.roleTemplate ?? null,
        permissions: tenantPart?.permissions ?? [],
        allBranches: tenantPart?.allBranches ?? false,
        branchIds: tenantPart?.branchIds ?? [],
      },
    };
  }

  private loadMembership(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
      if (!tenant || tenant.status === 'closed') return null;
      const membership = await tx.membership.findFirst({
        where: { tenantId, userId, status: 'active' },
        include: { role: { include: { rolePermissions: true } }, branches: true },
      });
      if (!membership) return null;
      return {
        tenantId,
        tenantStatus: tenant.status,
        membershipId: membership.id,
        roleId: membership.roleId,
        roleTemplate: membership.role.templateKey,
        permissions: membership.role.rolePermissions.map((rp) => rp.permissionKey),
        allBranches: membership.allBranches,
        branchIds: membership.branches.map((b) => b.branchId),
      };
    });
  }

  async setActiveTenant(sessionId: string, tenantId: string) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { activeTenantId: tenantId } });
  }

  async revoke(sessionId: string) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
