import { HttpStatus, Injectable } from '@nestjs/common';
import type { LoginInput, PasswordResetConfirmInput } from '@ros/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';
import { AuditService } from '../audit/audit.service';
import { AppError, forbidden } from '../../common/errors';
import { hashPassword, sha256, verifyPassword } from '../../common/crypto';
import type { AuthContext } from '../../common/auth-context';
import { config } from '../../config';

const invalidCredentials = () =>
  new AppError(HttpStatus.UNAUTHORIZED, 'auth.invalidCredentials', 'Invalid email or password');
const invalidToken = () =>
  new AppError(HttpStatus.BAD_REQUEST, 'auth.invalidToken', 'This link is invalid or has expired');

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Unknown e-mail, wrong password, missing password and locked account all return the same error after one
   * Argon2 verification, so the response does not reveal which accounts exist.
   */
  async login(input: LoginInput, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
    const ok = await verifyPassword(user && !locked && !user.disabledAt ? user.passwordHash : null, input.password);

    if (!user || !ok) {
      if (user && !locked) await this.registerFailure(user.id, user.failedLoginCount);
      throw invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const tenantId = await this.defaultTenant(user.id);
    const session = await this.sessions.create(user.id, tenantId, meta);
    if (tenantId) {
      await this.prisma.withTenant(tenantId, (tx) =>
        this.audit.record(
          tx,
          tenantId,
          { kind: 'system' },
          { action: 'auth.login', entityType: 'user', entityId: user.id },
        ),
      );
    }
    return session;
  }

  private async registerFailure(userId: string, previousFailures: number) {
    const failures = previousFailures + 1;
    const lock = failures >= config().LOGIN_LOCKOUT_THRESHOLD;
    await this.prisma.user.update({
      where: { id: userId },
      data: lock
        ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + config().LOGIN_LOCKOUT_MINUTES * 60_000) }
        : { failedLoginCount: failures },
    });
  }

  /** First active membership in a tenant that is not closed. */
  private defaultTenant(userId: string): Promise<string | null> {
    return this.prisma.withUser(userId, async (tx) => {
      const m = await tx.membership.findFirst({
        where: { userId, status: 'active', tenant: { status: { not: 'closed' } } },
        orderBy: { createdAt: 'asc' },
        select: { tenantId: true },
      });
      return m?.tenantId ?? null;
    });
  }

  async me(auth: AuthContext) {
    const memberships = await this.prisma.withUser(auth.userId, (tx) =>
      tx.membership.findMany({
        where: { userId: auth.userId, status: 'active', tenant: { status: { not: 'closed' } } },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    const active = memberships.find((m) => m.tenantId === auth.tenantId);
    return {
      user: { id: auth.userId, email: auth.email, fullName: auth.fullName, locale: auth.locale },
      tenant: active
        ? {
            id: active.tenant.id,
            displayName: active.tenant.displayName,
            status: active.tenant.status,
            baseCurrency: active.tenant.baseCurrency,
            timezone: active.tenant.timezone,
            defaultLocale: active.tenant.defaultLocale,
          }
        : null,
      roleId: auth.roleId,
      roleTemplate: auth.roleTemplate,
      permissions: auth.permissions,
      allBranches: auth.allBranches,
      branchIds: auth.branchIds,
      tenants: memberships.map((m) => ({
        id: m.tenant.id,
        displayName: m.tenant.displayName,
        status: m.tenant.status,
      })),
    };
  }

  async switchTenant(auth: AuthContext, tenantId: string) {
    const membership = await this.prisma.withUser(auth.userId, (tx) =>
      tx.membership.findFirst({
        where: { userId: auth.userId, tenantId, status: 'active', tenant: { status: { not: 'closed' } } },
      }),
    );
    if (!membership) throw forbidden('auth.notAMember', 'You are not a member of this restaurant');
    await this.sessions.setActiveTenant(auth.sessionId, tenantId);
    await this.prisma.withTenant(tenantId, (tx) =>
      this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'auth.tenantSwitched',
        entityType: 'user',
        entityId: auth.userId,
      }),
    );
  }

  /** Always succeeds from the caller's point of view; a token is only issued for a real, enabled account. */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.disabledAt) return;
    const token = await this.tokens.issue(user.id, 'reset');
    await this.tokens.sendReset(user.email, token);
  }

  /** Sets the password from a reset or invitation link, activates pending invitations and revokes all sessions. */
  async confirmPasswordReset(input: PasswordResetConfirmInput) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(input.token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || record.user.disabledAt)
      throw invalidToken();

    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      // Conditional update makes the token single-use even under concurrent submissions.
      const used = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw invalidToken();
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          emailVerifiedAt: record.user.emailVerifiedAt ?? new Date(),
        },
      });
    });
    await this.sessions.revokeAllForUser(record.userId);

    const invited = await this.prisma.withUser(record.userId, (tx) =>
      tx.membership.findMany({
        where: { userId: record.userId, status: 'invited' },
        select: { id: true, tenantId: true },
      }),
    );
    for (const m of invited) {
      await this.prisma.withTenant(m.tenantId, async (tx) => {
        await tx.membership.update({ where: { id: m.id }, data: { status: 'active', rowVersion: { increment: 1 } } });
        await this.audit.record(
          tx,
          m.tenantId,
          { kind: 'system' },
          { action: 'member.invitationAccepted', entityType: 'membership', entityId: m.id },
        );
      });
    }
  }
}
