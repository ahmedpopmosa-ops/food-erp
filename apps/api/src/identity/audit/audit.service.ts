import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Tx } from '../../prisma/prisma.service';
import type { AuthContext, PlatformContext } from '../../common/auth-context';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  changes?: Prisma.InputJsonValue;
}

type Actor = { kind: 'user'; auth: AuthContext } | { kind: 'platform'; platform: PlatformContext } | { kind: 'system' };

/** Keys never written to audit diffs (doc 05 §8). */
const REDACTED_KEYS = new Set(['password', 'passwordHash', 'token', 'tokenHash', 'csrfTokenHash', 'pin', 'pinHash']);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        REDACTED_KEYS.has(k) ? '[redacted]' : redact(v),
      ]),
    );
  }
  return value;
}

const toJson = (v: unknown) =>
  v === undefined ? null : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue | null);

/** Field-level before/after diff of the keys present in `after`. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Prisma.InputJsonObject {
  const changes: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> = {};
  for (const [key, to] of Object.entries(after)) {
    if (to === undefined) continue;
    const from = before[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from: toJson(from), to: toJson(to) };
  }
  return changes;
}

/**
 * Tenant audit trail. Always called with the transaction that performs the change, so the change and its
 * audit row commit or roll back together. The app role cannot UPDATE or DELETE audit rows.
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, tenantId: string, actor: Actor, entry: AuditEntry) {
    const actorFields =
      actor.kind === 'user'
        ? { actorType: 'user', actorId: actor.auth.userId, ip: actor.auth.ip, requestId: actor.auth.requestId }
        : actor.kind === 'platform'
          ? {
              actorType: 'platform',
              actorId: actor.platform.platformUserId,
              ip: actor.platform.ip,
              requestId: actor.platform.requestId,
            }
          : { actorType: 'system', actorId: null };
    await tx.auditLog.create({
      data: {
        tenantId,
        ...actorFields,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        branchId: entry.branchId ?? null,
        changes: entry.changes === undefined ? undefined : (redact(entry.changes) as Prisma.InputJsonValue),
      },
    });
  }

  user(auth: AuthContext): Actor {
    return { kind: 'user', auth };
  }

  platform(platform: PlatformContext): Actor {
    return { kind: 'platform', platform };
  }

  /** Operator-console audit trail (platform_audit_logs), written inside a withPlatform transaction. */
  async recordPlatform(
    tx: Tx,
    platform: PlatformContext | null,
    entry: {
      action: string;
      targetType: string;
      targetId?: string;
      tenantId?: string;
      changes?: Prisma.InputJsonValue;
    },
  ) {
    await tx.platformAuditLog.create({
      data: {
        platformUserId: platform?.platformUserId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        tenantId: entry.tenantId ?? null,
        ip: platform?.ip,
        requestId: platform?.requestId,
        changes: entry.changes === undefined ? undefined : (redact(entry.changes) as Prisma.InputJsonValue),
      },
    });
  }
}
