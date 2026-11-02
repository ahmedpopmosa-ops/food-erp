import type { INestApplication } from '@nestjs/common';
import { uuidv7 } from '@ros/domain';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient, syncServiceFor } from './fixtures';
import { envelope, pushBody } from './sale-factory';
import { PrismaService } from '../src/prisma/prisma.service';

interface Ticket {
  id: string;
  ticketNo: number;
  label: string;
  status: string;
  stationId: string;
  delayed: boolean;
  elapsedSec: number;
  items: {
    orderItemId: string;
    nameEn: string;
    qty: string;
    voidedAt: string | null;
    modifiers: { nameEn: string }[];
  }[];
  events?: { fromStatus: string | null; toStatus: string; actorType: string }[];
}

/**
 * P7-5 on tenant A, branch A1, through the real sync path (device P1) and the kitchen API. The tea product
 * (category Drinks) is routed to a BAR station; anything else falls back to the default KITCHEN station, which
 * is created on the first firing. No stock or money is touched.
 */
describe('kitchen display: stations, tickets, states, voids and cancellations', () => {
  let app: INestApplication;
  let ownerA: Session;
  let managerA: Session;
  let nopermA: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const prisma = new PrismaService();
  const sync = syncServiceFor(prisma);
  let device: { tenantId: string; branchId: string; deviceId: string; branchCode: string; deviceCode: string };
  let teaVariant: string;
  let drinks: string;
  let bar: string;
  let seq = 500;

  const fire = async (o: {
    orderId?: string;
    items: { variantId: string; name: string; modifiers?: string[] }[];
    firedAt?: string;
    label?: string;
  }) => {
    const orderId = o.orderId ?? uuidv7();
    const items = o.items.map((i) => ({
      orderItemId: uuidv7(),
      variantId: i.variantId,
      nameAr: i.name,
      nameEn: i.name,
      qty: '1',
      modifiers: (i.modifiers ?? []).map((m) => ({ nameAr: m, nameEn: m })),
    }));
    const op = envelope(device, ++seq, 'kitchen.fired', {
      fireId: uuidv7(),
      orderId,
      label: o.label ?? 'T1',
      channel: 'dine_in',
      tableId: null,
      employeeId: uuidv7(),
      firedAt: o.firedAt ?? new Date().toISOString(),
      items,
    });
    const res = await sync.push(device, pushBody([op]));
    expect(res.results[0]?.status).toBe('accepted');
    return {
      op,
      orderId,
      items,
      ticketIds: (res.results[0] as unknown as { server_refs: { kitchen_ticket_ids: string[] } }).server_refs
        .kitchen_ticket_ids,
    };
  };
  const tickets = async (q: string) =>
    (await ownerA.agent.get(`/api/v1/kitchen/tickets?branchId=${fx.branchA1.id}${q}`).expect(200)).body
      .tickets as Ticket[];
  const move = (s: Session, id: string, from: string, to: string) =>
    call(s, 'POST', `/api/v1/kitchen/tickets/${id}/status`).send({ from, to });

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    ownerA = await login(app, EMAILS.ownerA);
    managerA = await login(app, EMAILS.managerA);
    nopermA = await login(app, EMAILS.nopermA);
    const tenantId = fx.tenantA.id;
    const d = await owner.device.findFirstOrThrow({ where: { tenantId, code: 'P1' } });
    device = { tenantId, branchId: fx.branchA1.id, deviceId: d.id, branchCode: 'A1', deviceCode: 'P1' };
    const variant = await owner.productVariant.findFirstOrThrow({ where: { tenantId }, include: { product: true } });
    teaVariant = variant.id;
    drinks = variant.product.categoryId;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
    await app.close();
  });

  it('sets up stations per branch with category routes, within the manager’s branches', async () => {
    const res = await call(ownerA, 'POST', '/api/v1/kitchen/stations')
      .send({
        branchId: fx.branchA1.id,
        code: 'bar',
        nameAr: 'البار',
        nameEn: 'Bar',
        delayThresholdSec: 120,
        categoryIds: [drinks],
      })
      .expect(201);
    bar = res.body.id;
    expect([res.body.code, res.body.routes.map((r: { categoryId: string }) => r.categoryId)]).toEqual([
      'BAR',
      [drinks],
    ]);
    await call(ownerA, 'POST', '/api/v1/kitchen/stations')
      .send({ branchId: fx.branchA1.id, code: 'BAR', nameAr: 'مكرر', nameEn: 'Dup' })
      .expect(409);
    // The A1 manager (catalog.manage) works in A1 only.
    await call(managerA, 'POST', '/api/v1/kitchen/stations')
      .send({ branchId: fx.branchA2.id, code: 'X', nameAr: 'س', nameEn: 'X' })
      .expect(404);
    await managerA.agent.get(`/api/v1/kitchen/stations?branchId=${fx.branchA2.id}`).expect(404);
    const branches = (await managerA.agent.get('/api/v1/kitchen/branches').expect(200)).body as { code: string }[];
    expect(branches.map((b) => b.code)).toEqual(['A1']);
    await nopermA.agent.get(`/api/v1/kitchen/tickets?branchId=${fx.branchA1.id}`).expect(403);
  });

  it('splits a firing into station tickets, numbered per branch and day, exactly once', async () => {
    const f = await fire({
      items: [
        { variantId: teaVariant, name: 'Tea', modifiers: ['No sugar'] },
        { variantId: uuidv7(), name: 'Off-menu dish' }, // unknown product: the default station
      ],
    });
    expect(f.ticketIds).toHaveLength(2);
    const all = await tickets('');
    const barTicket = all.find((t) => t.stationId === bar)!;
    const kitchenTicket = all.find((t) => t.stationId !== bar)!;
    expect([barTicket.ticketNo, kitchenTicket.ticketNo]).toEqual([1, 2]);
    expect(barTicket.items.map((i) => [i.nameEn, i.modifiers.map((m) => m.nameEn)])).toEqual([['Tea', ['No sugar']]]);
    expect(kitchenTicket.items.map((i) => i.nameEn)).toEqual(['Off-menu dish']);
    expect([barTicket.status, barTicket.delayed, barTicket.label]).toEqual(['new', false, 'T1']);
    const station = await owner.kitchenStation.findUniqueOrThrow({ where: { id: kitchenTicket.stationId } });
    expect([station.code, station.isDefault]).toEqual(['KITCHEN', true]);

    const again = await sync.push(device, pushBody([f.op]));
    expect(again.results[0]?.status).toBe('already_processed');
    expect(await owner.kitchenTicket.count({ where: { fireId: (f.op.payload as { fireId: string }).fireId } })).toBe(2);
  });

  it('moves tickets through the kitchen flow with an audited history, refusing stale or skipped steps', async () => {
    const { ticketIds } = await fire({ items: [{ variantId: teaVariant, name: 'Tea' }] });
    const id = ticketIds[0]!;
    await move(ownerA, id, 'new', 'preparing').expect(201);
    const stale = await move(ownerA, id, 'new', 'preparing').expect(409);
    expect(stale.body).toMatchObject({ code: 'kitchen.staleTicket', details: { status: 'preparing' } });
    await move(ownerA, id, 'preparing', 'served').expect(400);
    await move(ownerA, id, 'preparing', 'ready').expect(201);
    await move(ownerA, id, 'ready', 'preparing').expect(201); // recalled
    await move(ownerA, id, 'preparing', 'ready').expect(201);
    const served = await move(ownerA, id, 'ready', 'served').expect(201);
    expect(served.body.status).toBe('served');
    await move(ownerA, id, 'served', 'ready').expect(400);

    const detail = (await ownerA.agent.get(`/api/v1/kitchen/tickets/${id}`).expect(200)).body as Ticket;
    expect(detail.events!.map((e) => [e.fromStatus, e.toStatus, e.actorType])).toEqual([
      [null, 'new', 'device'],
      ['new', 'preparing', 'user'],
      ['preparing', 'ready', 'user'],
      ['ready', 'preparing', 'user'],
      ['preparing', 'ready', 'user'],
      ['ready', 'served', 'user'],
    ]);
    expect((await tickets('&view=done')).map((t) => t.id)).toContain(id);
    expect((await tickets('')).map((t) => t.id)).not.toContain(id);
  });

  it('highlights tickets waiting longer than the station threshold', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { ticketIds } = await fire({
      items: [{ variantId: teaVariant, name: 'Tea' }],
      firedAt: tenMinutesAgo,
      label: 'T7',
    });
    const t = (await tickets(`&stationId=${bar}`)).find((x) => x.id === ticketIds[0])!;
    expect(t.delayed).toBe(true);
    expect(t.elapsedSec).toBeGreaterThanOrEqual(600);
    await move(ownerA, t.id, 'new', 'ready').expect(201);
    const ready = (await tickets(`&stationId=${bar}`)).find((x) => x.id === t.id)!;
    expect(ready.delayed).toBe(false); // ready on the pass: no longer the kitchen's delay
  });

  it('strikes voided items, cancels emptied tickets and the tickets of a cancelled order (in either order)', async () => {
    const f = await fire({
      items: [
        { variantId: teaVariant, name: 'Tea' },
        { variantId: teaVariant, name: 'Tea 2' },
      ],
    });
    const voidOp = (orderItemId: string) =>
      envelope(device, ++seq, 'kitchen.voided', {
        orderId: f.orderId,
        orderItemId,
        reason: 'Guest changed mind',
        voidedAt: new Date().toISOString(),
      });
    let res = await sync.push(device, pushBody([voidOp(f.items[0]!.orderItemId)]));
    expect(res.results[0]).toMatchObject({ status: 'accepted', server_refs: { kitchen_items_voided: 1 } });
    let t = (await ownerA.agent.get(`/api/v1/kitchen/tickets/${f.ticketIds[0]}`).expect(200)).body as Ticket;
    expect([t.status, t.items.filter((i) => i.voidedAt).length]).toEqual(['new', 1]);
    res = await sync.push(device, pushBody([voidOp(f.items[1]!.orderItemId)]));
    t = (await ownerA.agent.get(`/api/v1/kitchen/tickets/${f.ticketIds[0]}`).expect(200)).body as Ticket;
    expect(t.status).toBe('cancelled'); // nothing left to cook
    res = await sync.push(device, pushBody([voidOp(uuidv7())]));
    expect(res.results[0]).toMatchObject({ status: 'accepted', server_refs: { kitchen_items_voided: 0 } });

    // order.cancelled after the firing cancels the open tickets…
    const employee = await owner.employee.findFirstOrThrow({ where: { tenantId: fx.tenantA.id } });
    const cancel = (orderId: string, orderItemId: string) =>
      envelope(device, ++seq, 'order.cancelled', {
        orderId,
        localNumber: `A1-P1-X${seq}`,
        channel: 'dine_in',
        tableId: null,
        employeeId: employee.id,
        openedAt: new Date().toISOString(),
        cancelledAt: new Date().toISOString(),
        reason: 'Guests left',
        approval: null,
        items: [
          {
            orderItemId,
            variantId: teaVariant,
            productNameEn: 'Tea',
            qty: '1',
            unitPrice: '20.00',
            wasSentToKitchen: false,
          },
        ],
      });
    const g = await fire({ items: [{ variantId: teaVariant, name: 'Tea' }] });
    expect((await sync.push(device, pushBody([cancel(g.orderId, g.items[0]!.orderItemId)]))).results[0]?.status).toBe(
      'accepted',
    );
    expect((await owner.kitchenTicket.findUniqueOrThrow({ where: { id: g.ticketIds[0] } })).status).toBe('cancelled');
    // …and a firing that arrives after its order's cancellation is filed as cancelled.
    const lateOrder = uuidv7();
    const lateItem = uuidv7();
    expect((await sync.push(device, pushBody([cancel(lateOrder, lateItem)]))).results[0]?.status).toBe('accepted');
    const late = await fire({ orderId: lateOrder, items: [{ variantId: teaVariant, name: 'Tea' }] });
    expect((await owner.kitchenTicket.findUniqueOrThrow({ where: { id: late.ticketIds[0] } })).status).toBe(
      'cancelled',
    );
  });

  it('keeps the ticket history append-only and the flow enforced in the database', async () => {
    const run = (sql: string) => prisma.withTenant(fx.tenantA.id, (tx) => tx.$executeRawUnsafe(sql));
    await expect(run(`UPDATE kitchen_ticket_events SET to_status = 'new'`)).rejects.toThrow(/permission denied/i);
    await expect(run(`DELETE FROM kitchen_tickets`)).rejects.toThrow(/permission denied/i);
    await expect(run(`UPDATE kitchen_tickets SET status = 'new' WHERE status = 'served'`)).rejects.toThrow(
      /cannot go from served/,
    );
    await expect(run(`UPDATE kitchen_ticket_items SET qty = 9`)).rejects.toThrow(/immutable/);
  });
});
