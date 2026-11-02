import { Prisma } from '@prisma/client';
import type { KitchenFiredV1 } from '@ros/contracts';
import { businessDate, childId } from '@ros/domain';
import type { Tx } from '../prisma/prisma.service';

/**
 * Kitchen ticket rules shared by the sync handlers and the order flows (P7-5). Every status change writes an
 * append-only event with its actor. Nothing here rejects: the kitchen must never block a sale or a
 * cancellation behind it, so unknown items or routes fall back to the branch's default station.
 */

export interface KitchenActor {
  type: 'user' | 'device' | 'system';
  id: string | null;
}

const ACTIVE = ['new', 'preparing', 'ready'];

/** The branch's default station, created on first use ("Kitchen") so a firing always has somewhere to go. */
export async function defaultStation(tx: Tx, tenantId: string, branchId: string) {
  const existing = await tx.kitchenStation.findFirst({ where: { tenantId, branchId, isDefault: true } });
  if (existing) return existing;
  await tx.$executeRaw`
    INSERT INTO kitchen_stations (tenant_id, branch_id, code, name_ar, name_en, is_default, updated_at)
    VALUES (${tenantId}::uuid, ${branchId}::uuid, 'KITCHEN', 'المطبخ', 'Kitchen', true, now())
    ON CONFLICT DO NOTHING`;
  return tx.kitchenStation.findFirstOrThrow({ where: { tenantId, branchId, isDefault: true } });
}

export async function recordEvent(
  tx: Tx,
  tenantId: string,
  ticketId: string,
  from: string | null,
  to: string,
  actor: KitchenActor,
  note?: string,
) {
  await tx.kitchenTicketEvent.create({
    data: { tenantId, ticketId, fromStatus: from, toStatus: to, actorType: actor.type, actorId: actor.id, note },
  });
}

/** Splits one firing into tickets per station (by product category route), numbered per branch and day. */
export async function fireTickets(
  tx: Tx,
  ctx: { tenantId: string; branchId: string; deviceId: string },
  p: KitchenFiredV1,
) {
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: ctx.branchId } });
  const settings = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: ctx.tenantId } });
  const variants = await tx.productVariant.findMany({
    where: { id: { in: p.items.map((i) => i.variantId) } },
    include: { product: { select: { categoryId: true } } },
  });
  const routes = await tx.kitchenStationRoute.findMany({
    where: { branchId: ctx.branchId, station: { isActive: true } },
  });
  const fallback = await defaultStation(tx, ctx.tenantId, ctx.branchId);
  const byStation = new Map<string, KitchenFiredV1['items']>();
  for (const item of p.items) {
    const category = variants.find((v) => v.id === item.variantId)?.product.categoryId;
    const station = routes.find((r) => r.categoryId === category)?.stationId ?? fallback.id;
    byStation.set(station, [...(byStation.get(station) ?? []), item]);
  }
  // Cancelled before this firing arrived (operations from different devices): keep the tickets, cancelled.
  const cancelled = await tx.order.findFirst({ where: { id: p.orderId, status: 'cancelled' } });
  const day = businessDate(p.firedAt, branch.timezone, settings.businessDayCutoff);
  const firedAt = new Date(Math.min(Date.parse(p.firedAt), Date.now()));
  const actor: KitchenActor = { type: 'device', id: ctx.deviceId };
  const ids: string[] = [];
  for (const [stationId, items] of byStation) {
    const id = childId(p.fireId, `station:${stationId}`);
    const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`
      INSERT INTO document_sequences (tenant_id, doc_type, scope_key, next_value)
      VALUES (${ctx.tenantId}::uuid, 'kitchen_ticket', ${`${ctx.branchId}:${day}`}, 2)
      ON CONFLICT (tenant_id, doc_type, scope_key) DO UPDATE SET next_value = document_sequences.next_value + 1
      RETURNING next_value - 1 AS value`;
    await tx.kitchenTicket.create({
      data: {
        id,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        stationId,
        orderId: p.orderId,
        fireId: p.fireId,
        ticketNo: Number(value),
        label: p.label,
        channel: p.channel,
        firedAt,
        items: {
          create: items.map((i) => ({
            id: childId(id, `item:${i.orderItemId}`),
            tenantId: ctx.tenantId,
            orderItemId: i.orderItemId,
            nameAr: i.nameAr,
            nameEn: i.nameEn,
            qty: new Prisma.Decimal(i.qty),
            modifiers: i.modifiers,
          })),
        },
      },
    });
    await recordEvent(tx, ctx.tenantId, id, null, 'new', actor);
    if (cancelled)
      await setStatus(tx, ctx.tenantId, id, 'new', 'cancelled', { type: 'system', id: null }, 'Order was cancelled');
    ids.push(id);
  }
  return ids;
}

/** Marks a sent item voided on its tickets; a ticket left with no live items is cancelled. */
export async function voidTicketItem(
  tx: Tx,
  tenantId: string,
  orderItemId: string,
  reason: string,
  at: Date,
  actor: KitchenActor,
) {
  const items = await tx.kitchenTicketItem.findMany({
    where: { tenantId, orderItemId, voidedAt: null },
    include: { ticket: { include: { items: true } } },
  });
  for (const item of items) {
    await tx.kitchenTicketItem.update({ where: { id: item.id }, data: { voidedAt: at, voidReason: reason } });
    const t = item.ticket;
    await recordEvent(tx, tenantId, t.id, t.status, t.status, actor, `void ${item.nameEn}: ${reason}`);
    const live = t.items.filter((x) => x.id !== item.id && !x.voidedAt).length;
    if (live === 0 && ACTIVE.includes(t.status))
      await setStatus(tx, tenantId, t.id, t.status, 'cancelled', actor, 'All items voided');
  }
  return items.length;
}

/** Cancels every unfinished ticket of an order. */
export async function cancelOrderTickets(tx: Tx, tenantId: string, orderId: string, actor: KitchenActor, note: string) {
  const tickets = await tx.kitchenTicket.findMany({ where: { tenantId, orderId, status: { in: ACTIVE } } });
  for (const t of tickets) await setStatus(tx, tenantId, t.id, t.status, 'cancelled', actor, note);
  return tickets.length;
}

export async function setStatus(
  tx: Tx,
  tenantId: string,
  id: string,
  from: string,
  to: string,
  actor: KitchenActor,
  note?: string,
) {
  const now = new Date();
  const stamp: Prisma.KitchenTicketUpdateInput =
    to === 'preparing'
      ? { startedAt: now }
      : to === 'ready'
        ? { readyAt: now }
        : to === 'served'
          ? { servedAt: now }
          : to === 'cancelled'
            ? { cancelledAt: now }
            : {};
  await tx.kitchenTicket.update({ where: { id }, data: { status: to, ...stamp } });
  await recordEvent(tx, tenantId, id, from, to, actor, note);
}
