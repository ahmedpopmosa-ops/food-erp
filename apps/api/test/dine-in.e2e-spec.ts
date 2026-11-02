import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { MemoryCredentialStore, migrate, PosCore, SyncClient, type FetchLike } from '@ros/pos-core';
import { NodeSqliteDriver } from '@ros/pos-core/node';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';

const offline: FetchLike = () => Promise.reject(new TypeError('network down'));

/**
 * Phase 4b end to end: modifiers, tables and service charge configured in the dashboard; a dine-in order with
 * a modifier, a line discount, a kitchen ticket and an approved void; an order cancelled after the kitchen; and
 * two tills that both served table T1 while offline — kept, and flagged as a table conflict.
 */
describe('dine-in service on two offline tills', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerB: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const dir = mkdtempSync(join(tmpdir(), 'ros-dine-e2e-'));
  const tills: { db: NodeSqliteDriver; pos: PosCore; online: SyncClient; offline: SyncClient }[] = [];
  let variantId: string;
  let largeId: string;
  let tableId: string;
  let cardId: string;
  const invoices: string[] = [];

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api`.replace('[::1]', '127.0.0.1');
    fx = await loadFixtures();
    ownerB = await login(app, EMAILS.ownerB);
  });
  afterAll(async () => {
    for (const t of tills) await t.db.close();
    await owner.$disconnect();
    await app.close();
  });

  it('configures modifiers, a table, the service charge and staff in the dashboard', async () => {
    const group = await call(ownerB, 'POST', '/api/v1/catalog/modifier-groups')
      .send({
        nameAr: 'الحجم',
        nameEn: 'Size',
        minSelect: 0,
        maxSelect: 1,
        modifiers: [{ nameAr: 'كبير', nameEn: 'Large', priceDelta: '10.00' }],
      })
      .expect(201);
    largeId = group.body.modifiers[0].id;
    const products = (await ownerB.agent.get('/api/v1/catalog/products').expect(200)).body as {
      id: string;
      nameEn: string;
      variants: { id: string }[];
    }[];
    const koshary = products.find((p) => p.nameEn === 'Koshary')!;
    variantId = koshary.variants[0]!.id;
    await call(ownerB, 'PUT', `/api/v1/catalog/products/${koshary.id}/modifier-groups`)
      .send({ groupIds: [group.body.id] })
      .expect(200);

    const table = await call(ownerB, 'POST', `/api/v1/branches/${fx.branchB1.id}/tables`)
      .send({ label: 'T1', seats: 4 })
      .expect(201);
    tableId = table.body.id;
    await call(ownerB, 'POST', `/api/v1/branches/${fx.branchB1.id}/tables`).send({ label: 'T1' }).expect(409);

    // Editing: labels stay unique, an area is named in both languages, tables are deactivated (never deleted).
    const spare = await call(ownerB, 'POST', `/api/v1/branches/${fx.branchB1.id}/tables`)
      .send({ label: 'T9' })
      .expect(201);
    await call(ownerB, 'PATCH', `/api/v1/tables/${spare.body.id}`).send({ label: 'T1' }).expect(409);
    await call(ownerB, 'PATCH', `/api/v1/tables/${spare.body.id}`).send({ areaNameAr: 'التراس' }).expect(400);
    await call(ownerB, 'PATCH', `/api/v1/tables/${spare.body.id}`)
      .send({ seats: 6, areaNameAr: 'التراس', areaNameEn: 'Terrace', isActive: false })
      .expect(200);
    const plan = (await ownerB.agent.get(`/api/v1/branches/${fx.branchB1.id}/tables`).expect(200)).body as {
      nameEn: string;
      tables: { label: string; seats: number; isActive: boolean }[];
    }[];
    expect(plan.find((a) => a.nameEn === 'Terrace')?.tables).toEqual([
      expect.objectContaining({ label: 'T9', seats: 6, isActive: false }),
    ]);

    const taxCats = (await ownerB.agent.get('/api/v1/catalog/tax-categories').expect(200)).body as {
      id: string;
      code: string;
    }[];
    const settings = await ownerB.agent.get('/api/v1/settings').expect(200);
    await call(ownerB, 'PATCH', '/api/v1/settings')
      .send({
        serviceChargeRate: '0.12',
        serviceChargeTaxCategoryId: taxCats.find((c) => c.code === 'STANDARD')!.id,
        maxDiscountPct: '0.15',
        rowVersion: settings.body.rowVersion,
      })
      .expect(200);

    const roles = (await ownerB.agent.get('/api/v1/roles').expect(200)).body as { id: string; templateKey: string }[];
    for (const [no, tpl, pin] of [
      ['W1', 'cashier', '1212'],
      ['H1', 'manager', '3434'],
    ] as const) {
      const e = await call(ownerB, 'POST', '/api/v1/employees')
        .send({
          employeeNo: no,
          fullNameAr: no,
          fullNameEn: no,
          roleId: roles.find((r) => r.templateKey === tpl)!.id,
          branchIds: [fx.branchB1.id],
        })
        .expect(201);
      await call(ownerB, 'POST', `/api/v1/employees/${e.body.id}/pin`).send({ pin }).expect(200);
    }
    const methods = (await ownerB.agent.get('/api/v1/catalog/payment-methods').expect(200)).body as {
      id: string;
      code: string;
    }[];
    cardId = methods.find((m) => m.code === 'CARD')!.id;

    for (const code of ['D1', 'D2']) {
      const device = await call(ownerB, 'POST', '/api/v1/devices')
        .send({ branchId: fx.branchB1.id, code, name: code })
        .expect(201);
      const db = new NodeSqliteDriver(join(dir, `${code}.db`));
      await migrate(db);
      const creds = new MemoryCredentialStore();
      const online = new SyncClient(db, baseUrl, creds, undefined, () => Date.now() + 3_600_000);
      await online.pair(device.body.pairingCode);
      await online.pull();
      const pos = new PosCore(db, { print: async () => undefined });
      await pos.login('W1', '1212');
      tills.push({ db, pos, online, offline: new SyncClient(db, baseUrl, creds, offline) });
    }
    const menu = await tills[0]!.pos.menu('dine_in');
    expect(menu.find((m) => m.variantId === variantId)!.modifierGroups[0]!.modifiers).toEqual([
      expect.objectContaining({ id: largeId, priceDelta: '10.00' }),
    ]);
    expect((await tills[0]!.pos.tables())[0]!.tables.map((t) => t.label)).toEqual(['T1']);
  });

  it('serves table T1 on both tills while offline', async () => {
    const [d1, d2] = tills as [(typeof tills)[0], (typeof tills)[0]];
    const order = await d1.pos.openOrder('dine_in', { tableId, guests: 2 });
    // Till 2 has not seen till 1's order (both offline) and seats T1 at the same time.
    const other = await d2.pos.openOrder('dine_in', { tableId });
    await d2.pos.addItem(other, variantId);
    await d1.pos.addItem(order, variantId, '1', { modifierIds: [largeId] }); // 60 + 10 = 70.00
    await d1.pos.setLineDiscount(order, 1, { kind: 'percent', value: '0.1' });
    await d1.pos.addItem(order, variantId, '1');
    await d1.pos.sendToKitchen(order);
    await d1.pos.voidItem(order, 2, 'Wrong item', await d1.pos.approve('pos.void_sent_item', 'H1', '3434'));
    const q = await d1.pos.quote(order);
    expect(q).toMatchObject({ serviceChargeTotal: '6.63', discountTotal: '6.14' });
    invoices.push((await d1.pos.finalize(order, [{ paymentMethodId: cardId }])).invoiceId);
    invoices.push((await d2.pos.finalize(other, [{ paymentMethodId: cardId }])).invoiceId);

    const abandoned = await d1.pos.openOrder('dine_in', { tableId });
    await d1.pos.addItem(abandoned, variantId);
    await d1.pos.sendToKitchen(abandoned);
    await d1.pos.cancelOrder(abandoned, 'Guests left', await d1.pos.approve('pos.void_sent_item', 'H1', '3434'));
    for (const t of tills) expect((await t.offline.push()).state).toBe('offline');
  });

  it('syncs: both sales kept, the second flagged as a table conflict, ledger balanced', async () => {
    const [r1, r2] = [await tills[0]!.online.push(), await tills[1]!.online.push()];
    // Till 1: firing + void of the first order, its sale, firing of the abandoned order, its cancellation.
    expect(r1).toMatchObject({ sent: 5, acked: 5, rejected: 0 });
    expect(r2).toMatchObject({ sent: 1, acked: 1, rejected: 0 }); // till 2 never sent anything to the kitchen

    // The kitchen display saw it all: the voided line struck through, the abandoned order's ticket cancelled.
    const kitchen = await owner.kitchenTicket.findMany({
      where: { tenantId: fx.tenantB.id, label: 'T1' },
      include: { items: true },
      orderBy: { firedAt: 'asc' },
    });
    expect(kitchen.map((k) => [k.status, k.items.length, k.items.filter((i) => i.voidedAt).length])).toEqual([
      ['new', 2, 1],
      ['cancelled', 1, 0],
    ]);

    const first = await ownerB.agent.get(`/api/v1/sales/invoices/${invoices[0]}`).expect(200);
    expect(first.body).toMatchObject({ discountTotal: '6.14', serviceChargeTotal: '6.63', discrepancies: [] });
    expect(first.body.lines[0].descriptionEn).toBe('Koshary + Large');
    const accounts = await owner.account.findMany({ where: { tenantId: fx.tenantB.id } });
    const code = (id: string) => accounts.find((a) => a.id === id)!.code;
    const journal = first.body.journal.lines.map((l: { accountId: string; debit: string; credit: string }) => [
      code(l.accountId),
      Number(l.debit) ? 'Dr' : 'Cr',
    ]);
    expect(journal).toEqual(
      expect.arrayContaining([
        ['1120', 'Dr'],
        ['4190', 'Dr'],
        ['4100', 'Cr'],
        ['4200', 'Cr'],
        ['2210', 'Cr'],
      ]),
    );
    const order = await owner.order.findUniqueOrThrow({
      where: { id: (await owner.invoice.findUniqueOrThrow({ where: { id: invoices[0]! } })).orderId },
      include: { items: true },
    });
    expect(order).toMatchObject({ tableId, guests: 2 });
    expect(order.items.map((i) => i.status).sort()).toEqual(['sent', 'voided']);
    expect(
      await owner.approval.count({
        where: { subjectId: invoices[0]!, action: 'pos.void_sent_item', authorised: true },
      }),
    ).toBe(1);

    const second = await ownerB.agent.get(`/api/v1/sales/invoices/${invoices[1]}`).expect(200);
    expect(second.body.discrepancies.map((d: { kind: string }) => d.kind)).toEqual(['table_conflict']);

    expect(
      await owner.order.count({ where: { tenantId: fx.tenantB.id, status: 'cancelled', cancelReason: 'Guests left' } }),
    ).toBe(1);
    const tb = await ownerB.agent.get('/api/v1/accounting/trial-balance').expect(200);
    expect(tb.body.balanced).toBe(true);
  });
});
