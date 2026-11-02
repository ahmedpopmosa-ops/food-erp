import { Injectable } from '@nestjs/common';
import {
  KITCHEN_TRANSITIONS,
  type KitchenStationCreateInput,
  type KitchenStationUpdateInput,
  type KitchenTicketStatus,
  type KitchenTicketStatusInput,
  type KitchenTicketsQuery,
} from '@ros/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../identity/audit/audit.service';
import { badRequest, conflict, isUniqueViolation, notFound } from '../common/errors';
import { branchScope, canAccessBranch, type TenantContext } from '../common/auth-context';
import { setStatus } from './kitchen.tickets';

const DONE_WINDOW_MS = 2 * 3600_000;

/**
 * Kitchen display (P7-5): stations with their category routes, and the tickets of a branch per station with
 * elapsed time and a delayed flag after the station's threshold. Ticket moves are optimistic (the screen sends
 * the status it showed) and each one is recorded as an event with the user.
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Branches the caller works in (kitchen staff have no branch-setup permission to list them otherwise). */
  branches(auth: TenantContext) {
    const scope = branchScope(auth);
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.branch.findMany({
        where: { tenantId: auth.tenantId, status: 'active', ...(scope ? { id: { in: scope } } : {}) },
        select: { id: true, code: true, nameAr: true, nameEn: true },
        orderBy: { code: 'asc' },
      }),
    );
  }

  stations(auth: TenantContext, branchId: string) {
    this.branch(auth, branchId);
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.kitchenStation.findMany({
        where: { tenantId: auth.tenantId, branchId },
        include: { routes: { select: { categoryId: true } } },
        orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
      }),
    );
  }

  async createStation(auth: TenantContext, input: KitchenStationCreateInput) {
    this.branch(auth, input.branchId);
    const tenantId = auth.tenantId;
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        if (!(await tx.branch.findFirst({ where: { id: input.branchId, tenantId } }))) throw notFound('branches');
        if (input.isDefault)
          await tx.kitchenStation.updateMany({
            where: { branchId: input.branchId, isDefault: true },
            data: { isDefault: false },
          });
        const station = await tx.kitchenStation.create({
          data: {
            tenantId,
            branchId: input.branchId,
            code: input.code.toUpperCase(),
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            delayThresholdSec: input.delayThresholdSec,
            isDefault: input.isDefault,
          },
        });
        await this.setRoutes(tx, tenantId, input.branchId, station.id, input.categoryIds);
        await this.audit.record(tx, tenantId, this.audit.user(auth), {
          action: 'kitchen_station.created',
          entityType: 'kitchen_station',
          entityId: station.id,
          branchId: input.branchId,
          changes: { code: station.code, categories: input.categoryIds.length },
        });
        return tx.kitchenStation.findUniqueOrThrow({ where: { id: station.id }, include: { routes: true } });
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('kitchen.duplicateStation', 'A station with this code exists in the branch');
      throw err;
    }
  }

  updateStation(auth: TenantContext, id: string, input: KitchenStationUpdateInput) {
    const tenantId = auth.tenantId;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const station = await tx.kitchenStation.findFirst({ where: { id, tenantId } });
      if (!station || !canAccessBranch(auth, station.branchId)) throw notFound('kitchen_stations');
      if (input.isActive === false && station.isDefault)
        throw badRequest('kitchen.defaultStation', 'Choose another default station before deactivating this one');
      if (input.isDefault)
        await tx.kitchenStation.updateMany({
          where: { branchId: station.branchId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      await tx.kitchenStation.update({
        where: { id },
        data: {
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          delayThresholdSec: input.delayThresholdSec,
          isDefault: input.isDefault,
          isActive: input.isActive,
        },
      });
      if (input.categoryIds) await this.setRoutes(tx, tenantId, station.branchId, id, input.categoryIds);
      await this.audit.record(tx, tenantId, this.audit.user(auth), {
        action: 'kitchen_station.updated',
        entityType: 'kitchen_station',
        entityId: id,
        branchId: station.branchId,
        changes: { ...input },
      });
      return tx.kitchenStation.findUniqueOrThrow({ where: { id }, include: { routes: true } });
    });
  }

  tickets(auth: TenantContext, q: KitchenTicketsQuery) {
    this.branch(auth, q.branchId);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const now = new Date();
      const stations = await tx.kitchenStation.findMany({ where: { tenantId: auth.tenantId, branchId: q.branchId } });
      const rows = await tx.kitchenTicket.findMany({
        where: {
          tenantId: auth.tenantId,
          branchId: q.branchId,
          ...(q.stationId ? { stationId: q.stationId } : {}),
          ...(q.view === 'active'
            ? { status: { in: ['new', 'preparing', 'ready'] } }
            : {
                status: { in: ['served', 'cancelled'] },
                OR: [
                  { servedAt: { gte: new Date(now.getTime() - DONE_WINDOW_MS) } },
                  { cancelledAt: { gte: new Date(now.getTime() - DONE_WINDOW_MS) } },
                ],
              }),
        },
        include: { items: { orderBy: { id: 'asc' } } },
        orderBy: q.view === 'active' ? { firedAt: 'asc' } : { firedAt: 'desc' },
        take: 200,
      });
      return { serverTime: now.toISOString(), tickets: rows.map((t) => this.present(t, stations, now)) };
    });
  }

  ticket(auth: TenantContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const t = await this.load(tx, auth, id);
      const stations = await tx.kitchenStation.findMany({ where: { id: t.stationId } });
      const events = await tx.kitchenTicketEvent.findMany({ where: { ticketId: id }, orderBy: { occurredAt: 'asc' } });
      return { ...this.present(t, stations, new Date()), events };
    });
  }

  move(auth: TenantContext, id: string, input: KitchenTicketStatusInput) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM kitchen_tickets WHERE id = ${id}::uuid FOR UPDATE`;
      const t = await this.load(tx, auth, id);
      if (t.status !== input.from)
        throw conflict('kitchen.staleTicket', 'The ticket was changed on another screen', { status: t.status });
      if (!KITCHEN_TRANSITIONS[t.status as KitchenTicketStatus].includes(input.to))
        throw badRequest('invalid_state_transition', `Ticket is ${t.status}`);
      await setStatus(tx, auth.tenantId, id, t.status, input.to, { type: 'user', id: auth.userId });
      const stations = await tx.kitchenStation.findMany({ where: { id: t.stationId } });
      return this.present(await this.load(tx, auth, id), stations, new Date());
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private branch(auth: TenantContext, branchId: string) {
    if (!canAccessBranch(auth, branchId)) throw notFound('branches');
  }

  private async load(tx: Tx, auth: TenantContext, id: string) {
    const t = await tx.kitchenTicket.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!t || !canAccessBranch(auth, t.branchId)) throw notFound('kitchen_tickets');
    return t;
  }

  /** Replaces the station's categories; a category moved here leaves its previous station of the branch. */
  private async setRoutes(tx: Tx, tenantId: string, branchId: string, stationId: string, categoryIds: string[]) {
    const unique = [...new Set(categoryIds)];
    if (unique.length && (await tx.category.count({ where: { tenantId, id: { in: unique } } })) !== unique.length)
      throw badRequest('kitchen.unknownCategory', 'Category not found');
    await tx.kitchenStationRoute.deleteMany({ where: { stationId } });
    await tx.kitchenStationRoute.deleteMany({ where: { branchId, categoryId: { in: unique } } });
    if (unique.length)
      await tx.kitchenStationRoute.createMany({
        data: unique.map((categoryId) => ({ tenantId, branchId, categoryId, stationId })),
      });
  }

  private present(
    t: Awaited<ReturnType<KitchenService['load']>>,
    stations: { id: string; nameAr: string; nameEn: string; delayThresholdSec: number }[],
    now: Date,
  ) {
    const station = stations.find((s) => s.id === t.stationId);
    const threshold = station?.delayThresholdSec ?? 600;
    const end = t.readyAt ?? t.servedAt ?? t.cancelledAt ?? now;
    const elapsedSec = Math.max(0, Math.floor((end.getTime() - t.firedAt.getTime()) / 1000));
    return {
      ...t,
      items: t.items.map((i) => ({ ...i, qty: i.qty.toString() })),
      station: station ? { id: station.id, nameAr: station.nameAr, nameEn: station.nameEn } : null,
      delayThresholdSec: threshold,
      elapsedSec,
      delayed: ['new', 'preparing'].includes(t.status) && elapsedSec > threshold,
    };
  }
}
