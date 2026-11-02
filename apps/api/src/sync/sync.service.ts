import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  operationSchema,
  PULL_ENTITY_TYPES,
  type OperationResult,
  type PullChange,
  type PullEntityType,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncOperation,
} from '@ros/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { SaleFinalizedHandler } from './sale.handler';
import { CashSessionClosedHandler, CashSessionOpenedHandler, CashMovementHandler } from './cash.handlers';
import { RefundIssuedHandler } from './refund.handler';
import { OrderCancelledHandler } from './order-cancelled.handler';
import { KitchenFiredHandler, KitchenVoidedHandler } from '../kitchen/kitchen.handlers';
import { PermanentRejection, Retryable, type OperationHandler } from './sync.errors';
import { PostingConfigError } from '../accounting/posting.service';
import { DevicesService } from '../devices/devices.service';
import { sha256 } from '../common/crypto';
import type { DeviceContext } from '../common/auth-context';

/** Long backoff for operations blocked on configuration a manager must fix (e.g. a missing account mapping). */
const CONFIG_RETRY_MS = 60 * 60_000;

/** Stable JSON (sorted keys) so the same payload always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

class AlreadyProcessed {
  constructor(readonly refs: Record<string, unknown>) {}
}

/**
 * Push/pull endpoints of the sync contract (docs/06-sync-protocol.md). Each operation is processed in its own
 * transaction; the idempotency key is inserted in that same transaction, so a crash between commit and
 * response is answered with `already_processed` on retry.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger('SyncService');
  private readonly handlers: Map<string, OperationHandler>;

  constructor(
    private readonly prisma: PrismaService,
    sale: SaleFinalizedHandler,
    opened: CashSessionOpenedHandler,
    movement: CashMovementHandler,
    closed: CashSessionClosedHandler,
    refund: RefundIssuedHandler,
    cancelled: OrderCancelledHandler,
    fired: KitchenFiredHandler,
    voided: KitchenVoidedHandler,
    private readonly devices?: DevicesService,
  ) {
    this.handlers = new Map([sale, opened, movement, closed, refund, cancelled, fired, voided].map((h) => [h.type, h]));
  }

  async push(device: DeviceContext, req: PushRequest): Promise<PushResponse> {
    const started = Date.now();
    const results: OperationResult[] = [];
    for (const raw of req.operations) results.push(await this.processOne(device, raw));

    const count = (s: OperationResult['status']) => results.filter((r) => r.status === s).length;
    await this.prisma.withTenant(device.tenantId, async (tx) => {
      await tx.syncBatch.create({
        data: {
          tenantId: device.tenantId,
          deviceId: device.deviceId,
          batchId: req.batch_id,
          opCount: results.length,
          accepted: count('accepted'),
          duplicates: count('already_processed'),
          rejected: count('rejected'),
          retryable: count('retryable') + count('blocked'),
          clientAppVersion: req.client.app_version,
          clientSchemaVersion: req.client.local_schema_version,
          durationMs: Date.now() - started,
        },
      });
      await tx.deviceSyncState.upsert({
        where: { deviceId: device.deviceId },
        create: {
          deviceId: device.deviceId,
          tenantId: device.tenantId,
          lastPushAt: new Date(),
          clockSkewMs: Date.now() - Date.parse(req.device_time),
        },
        update: {
          lastPushAt: new Date(),
          clockSkewMs: Date.now() - Date.parse(req.device_time),
          lastErrorCode: results.find((r) => r.error)?.error?.code ?? null,
        },
      });
      await tx.device.update({
        where: { id: device.deviceId },
        data: { appVersion: req.client.app_version, localSchemaVersion: req.client.local_schema_version },
      });
    });
    const lease = this.devices ? await this.devices.renewLease(device) : undefined;
    return { batch_id: req.batch_id, server_time: new Date().toISOString(), results, lease };
  }

  private async processOne(device: DeviceContext, raw: unknown): Promise<OperationResult> {
    const env = operationSchema.safeParse(raw);
    const rawId = (raw as { operation_id?: unknown } | null)?.operation_id;
    if (!env.success) {
      return {
        operation_id: typeof rawId === 'string' ? rawId : 'unknown',
        status: 'rejected',
        error: {
          code: 'envelope_invalid',
          details: env.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
    }
    const op = env.data;
    if (op.tenant_id !== device.tenantId || op.branch_id !== device.branchId || op.device_id !== device.deviceId) {
      return { operation_id: op.operation_id, status: 'rejected', error: { code: 'scope_mismatch' } };
    }
    const handler = this.handlers.get(op.operation_type);
    if (!handler) return this.reject(device, op, new PermanentRejection('operation_not_allowed'));
    if (!handler.versions.includes(op.schema_version))
      return this.reject(device, op, new PermanentRejection('schema_version_unsupported'));

    const hash = sha256(canonicalJson(op.payload));
    for (let attempt = 1; ; attempt++) {
      try {
        const refs = await this.prisma.withTenant(device.tenantId, (tx) => this.applyOnce(tx, device, op, hash));
        return { operation_id: op.operation_id, status: 'accepted', server_refs: refs };
      } catch (err) {
        if (err instanceof AlreadyProcessed)
          return { operation_id: op.operation_id, status: 'already_processed', server_refs: err.refs };
        if (err instanceof Retryable) {
          return {
            operation_id: op.operation_id,
            status: err.code === 'dependency_rejected' ? 'blocked' : 'retryable',
            error: { code: err.code, details: err.details },
            retry_after_ms: err.retryAfterMs,
          };
        }
        if (err instanceof PermanentRejection) return this.reject(device, op, err, hash);
        if (err instanceof PostingConfigError) return this.quarantine(device, op, hash, err);
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return this.reject(device, op, new PermanentRejection('id_conflict', err.meta), hash);
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034' && attempt < 3) continue;
        this.logger.error(
          { operationId: op.operation_id, err: err instanceof Error ? err.message : err },
          'sync operation failed',
        );
        return {
          operation_id: op.operation_id,
          status: 'retryable',
          error: { code: 'internal' },
          retry_after_ms: 30_000,
        };
      }
    }
  }

  private async applyOnce(tx: Tx, device: DeviceContext, op: SyncOperation, hash: string) {
    const inserted = await tx.$queryRaw<{ key: string }[]>`
      INSERT INTO idempotency_keys (tenant_id, scope, key, request_hash, status)
      VALUES (${device.tenantId}::uuid, 'sync', ${op.operation_id}, ${hash}, 'in_progress')
      ON CONFLICT DO NOTHING RETURNING key`;
    if (inserted.length === 0) {
      // A concurrent request holding the same key makes this wait for its commit, then read the result.
      const [existing] = await tx.$queryRaw<
        { request_hash: string; status: string; resource_refs: Record<string, unknown> | null }[]
      >`
        SELECT request_hash, status, resource_refs FROM idempotency_keys
        WHERE tenant_id = ${device.tenantId}::uuid AND scope = 'sync' AND key = ${op.operation_id} FOR UPDATE`;
      if (existing!.request_hash !== hash) throw new PermanentRejection('idempotency_key_reused');
      if (existing!.status === 'completed') throw new AlreadyProcessed(existing!.resource_refs ?? {});
      throw new Retryable('in_progress', 2_000);
    }

    if (op.depends_on.length) {
      const deps = await tx.idempotencyKey.findMany({
        where: { tenantId: device.tenantId, scope: 'sync', key: { in: op.depends_on }, status: 'completed' },
      });
      const missing = op.depends_on.filter((d) => !deps.some((k) => k.key === d));
      if (missing.length) {
        const rejected = await tx.syncOperation.findMany({
          where: {
            tenantId: device.tenantId,
            operationId: { in: missing },
            status: { in: ['rejected', 'quarantined'] },
          },
        });
        throw new Retryable(rejected.length ? 'dependency_rejected' : 'dependency_pending', 5_000, { missing });
      }
    }

    const refs = await this.handlers.get(op.operation_type)!.handle(tx, device, op);
    await tx.idempotencyKey.update({
      where: { tenantId_scope_key: { tenantId: device.tenantId, scope: 'sync', key: op.operation_id } },
      data: { status: 'completed', resourceRefs: refs as Prisma.InputJsonValue },
    });
    await this.recordOperation(tx, device, op, hash, { status: 'accepted', serverRefs: refs as Prisma.InputJsonValue });
    return refs;
  }

  private async reject(
    device: DeviceContext,
    op: SyncOperation,
    err: PermanentRejection,
    hash = sha256(canonicalJson(op.payload)),
  ): Promise<OperationResult> {
    await this.prisma.withTenant(device.tenantId, (tx) =>
      this.recordOperation(tx, device, op, hash, {
        status: 'rejected',
        errorCode: err.code,
        errorDetail: (err.details ?? null) as Prisma.InputJsonValue,
      }),
    );
    return { operation_id: op.operation_id, status: 'rejected', error: { code: err.code, details: err.details } };
  }

  /** Kept server-side for reprocessing once the configuration is fixed; the device retries slowly. */
  private async quarantine(
    device: DeviceContext,
    op: SyncOperation,
    hash: string,
    err: PostingConfigError,
  ): Promise<OperationResult> {
    await this.prisma.withTenant(device.tenantId, (tx) =>
      this.recordOperation(tx, device, op, hash, {
        status: 'quarantined',
        errorCode: err.code,
        errorDetail: (err.details ?? null) as Prisma.InputJsonValue,
      }),
    );
    return {
      operation_id: op.operation_id,
      status: 'retryable',
      error: { code: err.code, details: err.details },
      retry_after_ms: CONFIG_RETRY_MS,
    };
  }

  private recordOperation(
    tx: Tx,
    device: DeviceContext,
    op: SyncOperation,
    hash: string,
    outcome: {
      status: string;
      serverRefs?: Prisma.InputJsonValue;
      errorCode?: string;
      errorDetail?: Prisma.InputJsonValue;
    },
  ) {
    const base = {
      status: outcome.status,
      serverRefs: outcome.serverRefs,
      errorCode: outcome.errorCode ?? null,
      errorDetail: outcome.errorDetail ?? Prisma.DbNull,
      processedAt: new Date(),
    };
    return tx.syncOperation.upsert({
      where: { tenantId_operationId: { tenantId: device.tenantId, operationId: op.operation_id } },
      create: {
        tenantId: device.tenantId,
        operationId: op.operation_id,
        deviceId: device.deviceId,
        branchId: device.branchId,
        operationType: op.operation_type,
        schemaVersion: op.schema_version,
        occurredAt: new Date(op.occurred_at),
        localSeq: BigInt(op.local_seq),
        payloadHash: hash,
        payload: op.payload as Prisma.InputJsonValue,
        ...base,
      },
      update: { ...base, attempts: { increment: 1 } },
    });
  }

  /** Reference data changed since `cursor`, for this device's tenant and branch (docs/06 §6). */
  async pull(device: DeviceContext, cursor: number, limit: number): Promise<PullResponse> {
    return this.prisma.withTenant(device.tenantId, async (tx) => {
      const rows = await tx.changeLog.findMany({
        where: {
          tenantId: device.tenantId,
          changeSeq: { gt: BigInt(cursor) },
          OR: [{ branchId: null }, { branchId: device.branchId }],
          entityType: { in: [...PULL_ENTITY_TYPES] },
        },
        orderBy: { changeSeq: 'asc' },
        take: limit,
      });
      // Several changes of one entity in a page collapse to its current state.
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) latest.set(`${r.entityType}:${r.entityId}`, r);
      const changes: PullChange[] = [];
      for (const r of [...latest.values()].sort((a, b) => Number(a.changeSeq - b.changeSeq))) {
        const data = await this.load(tx, r.entityType as PullEntityType, r.entityId, device.branchId);
        changes.push(
          data
            ? { entity_type: r.entityType as PullEntityType, op: 'upsert', id: r.entityId, data }
            : { entity_type: r.entityType as PullEntityType, op: 'delete', id: r.entityId },
        );
      }
      const next = rows.length ? Number(rows[rows.length - 1]!.changeSeq) : cursor;
      await tx.deviceSyncState.upsert({
        where: { deviceId: device.deviceId },
        create: {
          deviceId: device.deviceId,
          tenantId: device.tenantId,
          pullCursor: BigInt(next),
          lastPullAt: new Date(),
        },
        update: { pullCursor: BigInt(next), lastPullAt: new Date() },
      });
      return { cursor, next_cursor: next, has_more: rows.length === limit, changes };
    });
  }

  private async load(
    tx: Tx,
    type: PullEntityType,
    id: string,
    branchId: string,
  ): Promise<Record<string, unknown> | null> {
    const json = (v: unknown) => (v ? (JSON.parse(JSON.stringify(v)) as Record<string, unknown>) : null);
    switch (type) {
      case 'branch':
        return json(
          await tx.branch.findUnique({
            where: { id },
            select: {
              id: true,
              code: true,
              nameAr: true,
              nameEn: true,
              timezone: true,
              currencyCode: true,
              address: true,
              phone: true,
              taxRegistrationNo: true,
              status: true,
            },
          }),
        );
      case 'tenant_settings':
        return json(await tx.tenantSettings.findUnique({ where: { tenantId: id } }));
      case 'category':
        return json(await tx.category.findUnique({ where: { id } }));
      case 'product':
        return json(await tx.product.findUnique({ where: { id } }));
      case 'product_variant':
        return json(await tx.productVariant.findUnique({ where: { id } }));
      case 'product_price':
        return json(await tx.productPrice.findUnique({ where: { id } }));
      case 'tax_rate':
        return json(await tx.taxRate.findUnique({ where: { id } }));
      case 'tax_category':
        return json(await tx.taxCategory.findUnique({ where: { id } }));
      case 'tax_category_rate':
        return json(await tx.taxCategoryRate.findUnique({ where: { id } }));
      case 'payment_method':
        return json(await tx.paymentMethod.findUnique({ where: { id } }));
      case 'employee': {
        // Only active employees with a PIN who work at this device's branch reach the device; anyone else
        // is sent as a deletion, so removing a branch assignment also removes the PIN hash from the POS.
        const e = await tx.employee.findUnique({ where: { id }, include: { branches: true } });
        if (!e || e.status !== 'active' || !e.posPinHash || !e.branches.some((b) => b.branchId === branchId))
          return null;
        return {
          id: e.id,
          employeeNo: e.employeeNo,
          fullNameAr: e.fullNameAr,
          fullNameEn: e.fullNameEn,
          roleId: e.roleId,
          pinHash: e.posPinHash,
        };
      }
      case 'role': {
        const r = await tx.role.findUnique({ where: { id }, include: { rolePermissions: true } });
        return r ? { id: r.id, name: r.name, permissions: r.rolePermissions.map((p) => p.permissionKey) } : null;
      }
      case 'modifier_group':
        return json(await tx.modifierGroup.findUnique({ where: { id } }));
      case 'modifier':
        return json(await tx.modifier.findUnique({ where: { id } }));
      case 'product_modifier_group':
        return json(await tx.productModifierGroup.findUnique({ where: { id } }));
      case 'service_area':
        return json(await tx.serviceArea.findUnique({ where: { id } }));
      case 'dining_table':
        return json(await tx.diningTable.findUnique({ where: { id } }));
    }
  }
}
