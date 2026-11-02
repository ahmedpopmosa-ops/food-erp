import { randomInt, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PAIRING_ALPHABET,
  type DeviceCreateInput,
  type DevicePairInput,
  type DeviceRefreshInput,
  type DeviceTokens,
} from '@ros/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { EntitlementsService } from '../setup/entitlements.service';
import { LeaseService } from './lease.service';
import { AppError, conflict, isUniqueViolation, notFound, unauthorized } from '../common/errors';
import { randomToken, sha256 } from '../common/crypto';
import { canAccessBranch, branchScope, type DeviceContext, type TenantContext } from '../common/auth-context';

const PAIRING_TTL_MS = 15 * 60_000;
const ACCESS_TTL_MS = 15 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 3600_000;

const pairingCode = () =>
  Array.from({ length: 8 }, () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]).join('');
const invalidPairing = () =>
  new AppError(HttpStatus.BAD_REQUEST, 'devices.invalidPairingCode', 'This pairing code is invalid or has expired');

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly lease: LeaseService,
  ) {}

  list(auth: TenantContext) {
    const scope = branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.device.findMany({
        where: { tenantId: auth.tenantId, ...(scope ? { branchId: { in: scope } } : {}) },
        select: {
          id: true,
          branchId: true,
          code: true,
          name: true,
          kind: true,
          status: true,
          appVersion: true,
          lastSeenAt: true,
          pairingExpiresAt: true,
          createdAt: true,
        },
        orderBy: { code: 'asc' },
      }),
    );
  }

  /** Registers a device and returns its one-time pairing code (shown once, stored hashed). */
  async create(auth: TenantContext, input: DeviceCreateInput) {
    if (!canAccessBranch(auth, input.branchId)) throw notFound('branches');
    const tenantId = auth.tenantId;
    const code = pairingCode();
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        if (!(await tx.branch.findFirst({ where: { id: input.branchId, tenantId, status: 'active' } })))
          throw notFound('branches');
        await this.entitlements.assertWithinLimit(tx, tenantId, 'limit.devices', () =>
          tx.device.count({ where: { tenantId, status: { in: ['pending_pairing', 'active'] } } }),
        );
        const device = await tx.device.create({
          data: {
            tenantId,
            branchId: input.branchId,
            code: input.code,
            name: input.name,
            pairingCodeHash: sha256(code),
            pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS),
            createdBy: auth.userId,
          },
        });
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'device.registered',
          entityType: 'device',
          entityId: device.id,
          branchId: device.branchId,
          changes: { code: device.code, name: device.name },
        });
        return {
          id: device.id,
          code: device.code,
          name: device.name,
          status: device.status,
          pairingCode: code,
          pairingExpiresAt: device.pairingExpiresAt,
        };
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('devices.duplicateCode', 'A device with this code already exists in the branch');
      throw err;
    }
  }

  /** New pairing code; any existing tokens are revoked (the device must pair again). */
  newPairingCode(auth: TenantContext, id: string) {
    const code = pairingCode();
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const device = await this.load(tx, auth, id);
      if (device.status === 'retired') throw conflict('devices.retired', 'This device is retired');
      await tx.deviceToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      const updated = await tx.device.update({
        where: { id },
        data: {
          status: 'pending_pairing',
          pairingCodeHash: sha256(code),
          pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS),
        },
      });
      await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
        action: 'device.repairing',
        entityType: 'device',
        entityId: id,
        branchId: device.branchId,
      });
      return { id, status: updated.status, pairingCode: code, pairingExpiresAt: updated.pairingExpiresAt };
    });
  }

  disable(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const device = await this.load(tx, auth, id);
      await tx.deviceToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.device.update({
        where: { id },
        data: { status: 'disabled', pairingCodeHash: null, pairingExpiresAt: null },
      });
      await this.audit.record(tx, auth.tenantId, this.audit.user(auth), {
        action: 'device.disabled',
        entityType: 'device',
        entityId: id,
        branchId: device.branchId,
      });
      return { id, status: 'disabled' };
    });
  }

  /** Exchanges a pairing code for tokens. The code is single-use. */
  async pair(input: DevicePairInput, meta: { ip?: string }): Promise<DeviceTokens> {
    const [hit] = await this.prisma.$queryRaw<{ device_id: string; tenant_id: string }[]>`
      SELECT device_id, tenant_id FROM resolve_device_pairing(${sha256(input.pairingCode)})`;
    if (!hit) throw invalidPairing();
    return this.prisma.withTenant(hit.tenant_id, async (tx) => {
      const claimed = await tx.device.updateMany({
        where: { id: hit.device_id, status: 'pending_pairing', pairingExpiresAt: { gt: new Date() } },
        data: {
          status: 'active',
          pairingCodeHash: null,
          pairingExpiresAt: null,
          appVersion: input.appVersion,
          osVersion: input.osVersion,
          lastSeenAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw invalidPairing();
      const device = await tx.device.findUniqueOrThrow({ where: { id: hit.device_id } });
      const tokens = await this.issue(tx, device.tenantId, device.id, randomUUID());
      await tx.deviceSyncState.upsert({
        where: { deviceId: device.id },
        create: { deviceId: device.id, tenantId: device.tenantId },
        update: { pullCursor: 0 },
      });
      await this.audit.record(
        tx,
        device.tenantId,
        { kind: 'system' },
        {
          action: 'device.paired',
          entityType: 'device',
          entityId: device.id,
          branchId: device.branchId,
          changes: { appVersion: input.appVersion, ip: meta.ip ?? null },
        },
      );
      return this.describe(tx, device, tokens);
    });
  }

  /**
   * Rotates tokens. Presenting a refresh token that was already used means it was copied: the whole
   * device is revoked and must be paired again (ADR-0009).
   */
  async refresh(input: DeviceRefreshInput): Promise<DeviceTokens> {
    const [hit] = await this.prisma.$queryRaw<{ device_id: string; tenant_id: string }[]>`
      SELECT device_id, tenant_id FROM resolve_device_token(${sha256(input.refreshToken)})`;
    if (!hit || hit.device_id !== input.deviceId) throw unauthorized('devices.invalidToken');
    const outcome = await this.prisma.withTenant(hit.tenant_id, async (tx) => {
      const token = await tx.deviceToken.findUniqueOrThrow({ where: { tokenHash: sha256(input.refreshToken) } });
      const device = await tx.device.findUniqueOrThrow({ where: { id: token.deviceId } });
      if (
        token.kind !== 'refresh' ||
        token.revokedAt ||
        token.expiresAt.getTime() <= Date.now() ||
        device.status !== 'active'
      ) {
        return { error: 'invalid' as const };
      }
      if (token.usedAt) {
        await tx.deviceToken.updateMany({
          where: { deviceId: device.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.device.update({ where: { id: device.id }, data: { status: 'disabled' } });
        await this.audit.record(
          tx,
          device.tenantId,
          { kind: 'system' },
          {
            action: 'device.tokenReuseDetected',
            entityType: 'device',
            entityId: device.id,
            branchId: device.branchId,
          },
        );
        return { error: 'reuse' as const };
      }
      const used = await tx.deviceToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) return { error: 'invalid' as const };
      await tx.deviceToken.updateMany({
        where: { deviceId: device.id, kind: 'access', revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return {
        tokens: await this.describe(tx, device, await this.issue(tx, device.tenantId, device.id, token.familyId)),
      };
    });
    // The revocation must commit, so the error is raised after the transaction.
    if ('error' in outcome)
      throw unauthorized(outcome.error === 'reuse' ? 'devices.tokenReuse' : 'devices.invalidToken');
    return outcome.tokens!;
  }

  /** Resolves a Bearer access token to the device identity used by DeviceAccess routes. */
  async authenticate(
    accessToken: string,
  ): Promise<{ device: DeviceContext; tenantStatus: string } | { error: string }> {
    const [hit] = await this.prisma.$queryRaw<{ device_id: string; tenant_id: string }[]>`
      SELECT device_id, tenant_id FROM resolve_device_token(${sha256(accessToken)})`;
    if (!hit) return { error: 'devices.invalidToken' };
    return this.prisma.withTenant(hit.tenant_id, async (tx) => {
      const token = await tx.deviceToken.findUniqueOrThrow({ where: { tokenHash: sha256(accessToken) } });
      if (token.kind !== 'access' || token.revokedAt || token.expiresAt.getTime() <= Date.now())
        return { error: 'devices.invalidToken' };
      const device = await tx.device.findUniqueOrThrow({ where: { id: token.deviceId } });
      if (device.status !== 'active') return { error: 'device_disabled' };
      const [branch, tenant] = await Promise.all([
        tx.branch.findUniqueOrThrow({ where: { id: device.branchId }, select: { code: true } }),
        tx.tenant.findUniqueOrThrow({ where: { id: device.tenantId }, select: { status: true } }),
      ]);
      await tx.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
      return {
        tenantStatus: tenant.status,
        device: {
          deviceId: device.id,
          tenantId: device.tenantId,
          branchId: device.branchId,
          deviceCode: device.code,
          branchCode: branch.code,
        },
      };
    });
  }

  private async issue(tx: Tx, tenantId: string, deviceId: string, familyId: string) {
    const access = randomToken();
    const refresh = randomToken();
    const now = Date.now();
    const accessExpiresAt = new Date(now + ACCESS_TTL_MS);
    await tx.deviceToken.createMany({
      data: [
        { tenantId, deviceId, kind: 'access', tokenHash: sha256(access), familyId, expiresAt: accessExpiresAt },
        {
          tenantId,
          deviceId,
          kind: 'refresh',
          tokenHash: sha256(refresh),
          familyId,
          expiresAt: new Date(now + REFRESH_TTL_MS),
        },
      ],
    });
    return { access, refresh, accessExpiresAt };
  }

  private async describe(
    tx: Tx,
    device: { id: string; tenantId: string; branchId: string; code: string },
    t: { access: string; refresh: string; accessExpiresAt: Date },
  ): Promise<DeviceTokens> {
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: device.branchId }, select: { code: true } });
    const settings = await tx.tenantSettings.findUniqueOrThrow({
      where: { tenantId: device.tenantId },
      select: { leaseDays: true },
    });
    return {
      deviceId: device.id,
      tenantId: device.tenantId,
      branchId: device.branchId,
      deviceCode: device.code,
      branchCode: branch.code,
      accessToken: t.access,
      accessExpiresAt: t.accessExpiresAt.toISOString(),
      refreshToken: t.refresh,
      lease: this.lease.issue(
        { tenantId: device.tenantId, branchId: device.branchId, deviceId: device.id },
        settings.leaseDays,
      ),
      leasePublicKey: this.lease.publicKeySpki,
    };
  }

  /** Fresh lease for an authenticated device (returned with every push). */
  async renewLease(device: DeviceContext) {
    const settings = await this.prisma.withTenant(device.tenantId, (tx) =>
      tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: device.tenantId }, select: { leaseDays: true } }),
    );
    return this.lease.issue(device, settings.leaseDays);
  }

  private async load(tx: Tx, auth: TenantContext, id: string) {
    const device = await tx.device.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!device || !canAccessBranch(auth, device.branchId)) throw notFound('devices');
    return device;
  }
}
