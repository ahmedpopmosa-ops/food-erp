import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilePrinter, NodeSqliteDriver } from './node';
import { migrate } from './schema';
import { PosCore } from './pos';
import { ReferenceStore } from './catalog';
import { IDS, NOW, seedPos, TEST_PIN } from './test-support';

describe('dine-in POS (Phase 4b)', () => {
  let dir: string;
  let db: NodeSqliteDriver;
  let pos: PosCore;
  const ops = async () =>
    (await db.all<{ envelope: string }>('SELECT envelope FROM outbox ORDER BY local_seq')).map((r) =>
      JSON.parse(r.envelope),
    );
  const setSettings = (data: Record<string, unknown>) =>
    db.batch(
      new ReferenceStore(db).changeStatements([
        {
          entity_type: 'tenant_settings',
          op: 'upsert',
          id: IDS.tenant,
          data: { tenantId: IDS.tenant, priceIncludesTax: true, ...data },
        },
      ]),
    );

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ros-dine-'));
    db = new NodeSqliteDriver(join(dir, 'pos.db'));
    await migrate(db);
    await seedPos(db);
    pos = new PosCore(db, new FilePrinter(join(dir, 'printer')), () => NOW);
    await pos.login('C1', TEST_PIN);
    await pos.openCashSession('500');
  });
  afterEach(() => db.close());

  it('prices modifiers and enforces group limits', async () => {
    const order = await pos.openOrder();
    await expect(pos.addItem(order, IDS.variant, '1', { modifierIds: [IDS.large, IDS.large] })).rejects.toMatchObject({
      code: 'modifiers_invalid',
    });
    await expect(
      pos.addItem(order, IDS.variant, '1', { modifierIds: ['0192f0c4-0000-7000-8000-0000000000ff'] }),
    ).rejects.toMatchObject({ code: 'modifiers_invalid' });
    await pos.addItem(order, IDS.variant, '1', { modifierIds: [IDS.large, IDS.noOnion] }); // 57.00 + 11.40
    expect((await pos.quote(order)).total).toBe('68.40');
    await pos.finalize(order, [{ paymentMethodId: IDS.cash, tendered: '100' }]);
    const sale = (await ops()).at(-1);
    expect(sale.payload.lines[0]).toMatchObject({
      unitPrice: '68.40',
      modifiers: [{ modifierId: IDS.large, nameEn: 'Large' }, { modifierId: IDS.noOnion }],
    });
  });

  it('applies discounts with VAT on the discounted price, and needs approval above the limit', async () => {
    const order = await pos.openOrder();
    await pos.addItem(order, IDS.variant, '2'); // 114.00
    await pos.setLineDiscount(order, 1, { kind: 'percent', value: '0.1' }); // within the 20 % limit
    expect(await pos.quote(order)).toMatchObject({
      subtotal: '100.00',
      discountTotal: '10.00',
      taxTotal: '12.60',
      total: '102.60',
    });
    await expect(pos.setOrderDiscount(order, { kind: 'percent', value: '0.5' }, 'VIP')).rejects.toMatchObject({
      code: 'approval_required',
    });
    await pos.setOrderDiscount(order, { kind: 'amount', value: '2.60' }, 'Round down', null);
    expect((await pos.quote(order)).total).toBe('100.00');
    const big = await pos.openOrder();
    await pos.addItem(big, IDS.variant);
    await pos.setOrderDiscount(
      big,
      { kind: 'percent', value: '0.5' },
      'Staff meal',
      await pos.approve('pos.discount_over_limit', 'M1', TEST_PIN),
    );
    await pos.finalize(big, [{ paymentMethodId: IDS.cash, tendered: '28.50' }]);
    const sale = (await ops()).at(-1);
    expect(sale.payload.order.discount).toEqual({ kind: 'percent', value: '0.5' });
    expect(sale.payload.approvals.map((a: { action: string }) => a.action)).toEqual(['pos.discount_over_limit']);
    expect(sale.payload.invoice).toMatchObject({ total: '28.50', discountTotal: '25.00' });
  });

  it('adds the dine-in service charge (taxed when configured), not for takeaway', async () => {
    await setSettings({ serviceChargeRate: '0.12', serviceChargeTaxCategoryId: IDS.taxCat });
    const table = await pos.openOrder('dine_in', { tableId: IDS.table1, guests: 3 });
    await pos.addItem(table, IDS.variant, '2');
    expect(await pos.quote(table)).toMatchObject({
      subtotal: '100.00',
      serviceChargeTotal: '12.00',
      taxTotal: '15.68',
      total: '127.68',
    });
    const take = await pos.openOrder('takeaway');
    await pos.addItem(take, IDS.variant, '2');
    expect((await pos.quote(take)).serviceChargeTotal).toBe('0.00');
    await pos.finalize(table, [{ paymentMethodId: IDS.card }]);
    const sale = (await ops()).at(-1);
    expect(sale.payload.order).toMatchObject({ tableId: IDS.table1, guests: 3 });
    expect(sale.payload.serviceCharge).toMatchObject({ rate: '0.12', netAmount: '12.00', taxAmount: '1.68' });
  });

  it('prints kitchen tickets; voiding a sent item needs a manager, and voids travel with the sale', async () => {
    const order = await pos.openOrder('dine_in', { tableId: IDS.table1 });
    await pos.addItem(order, IDS.variant, '1', { modifierIds: [IDS.noOnion] });
    await pos.addItem(order, IDS.variant, '1');
    expect(await pos.sendToKitchen(order)).toBe(2);
    const ticket = readdirSync(join(dir, 'printer')).find((f) => f.startsWith('kitchen-'))!;
    expect(readFileSync(join(dir, 'printer', ticket), 'utf8')).toMatch(/KITCHEN Table T1[\s\S]*\+ No onion/);
    await expect(pos.voidItem(order, 2, 'Customer changed mind')).rejects.toMatchObject({ code: 'approval_required' });
    // The firing is queued for the kitchen display in the same batch, with modifiers and the table label.
    const fired = (await ops()).filter((o) => o.operation_type === 'kitchen.fired');
    expect(fired).toHaveLength(1);
    expect(fired[0].payload).toMatchObject({ orderId: order, label: 'T1', tableId: IDS.table1, channel: 'dine_in' });
    expect(
      fired[0].payload.items.map((i: { modifiers: { nameEn: string }[] }) => i.modifiers.map((m) => m.nameEn)),
    ).toEqual([['No onion'], []]);
    expect(await pos.sendToKitchen(order)).toBe(0); // nothing new: no second firing
    expect((await ops()).filter((o) => o.operation_type === 'kitchen.fired')).toHaveLength(1);
    await pos.voidItem(order, 2, 'Customer changed mind', await pos.approve('pos.void_sent_item', 'M1', TEST_PIN));
    const voided = (await ops()).at(-1);
    expect(voided).toMatchObject({
      operation_type: 'kitchen.voided',
      payload: { orderId: order, orderItemId: fired[0].payload.items[1].orderItemId, reason: 'Customer changed mind' },
    });
    await pos.addItem(order, IDS.variant, '1');
    await pos.voidItem(order, 3, 'Typo'); // unsent: the cashier may void, and the kitchen never hears of it
    expect((await ops()).filter((o) => o.operation_type === 'kitchen.voided')).toHaveLength(1);
    expect((await pos.quote(order)).total).toBe('57.00');
    await pos.finalize(order, [{ paymentMethodId: IDS.card }]);
    const sale = (await ops()).at(-1);
    expect(sale.payload.lines).toHaveLength(1);
    expect(
      sale.payload.voids.map((v: { wasSentToKitchen: boolean; approvalId: string | null }) => [
        v.wasSentToKitchen,
        !!v.approvalId,
      ]),
    ).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(sale.payload.approvals.map((a: { action: string }) => a.action)).toEqual(['pos.void_sent_item']);
  });

  it('transfers, splits and merges table orders', async () => {
    const a = await pos.openOrder('dine_in', { tableId: IDS.table1 });
    await expect(pos.openOrder('dine_in', { tableId: IDS.table1 })).rejects.toMatchObject({ code: 'table_occupied' });
    // Sent rounds stay separate lines (an unsent repeat tap would only raise one line's quantity).
    for (let i = 0; i < 3; i++) {
      await pos.addItem(a, IDS.variant);
      await pos.sendToKitchen(a);
    }
    await pos.transferTable(a, IDS.table2);
    let plan = await pos.tables();
    expect(plan[0]!.tables.map((t) => [t.label, t.openOrders.length])).toEqual([
      ['T1', 0],
      ['T2', 1],
    ]);

    const b = await pos.splitOrder(a, [2, 3]);
    expect((await pos.quote(a)).total).toBe('57.00');
    expect((await pos.quote(b)).total).toBe('114.00');
    await expect(pos.splitOrder(a, [1])).rejects.toMatchObject({ code: 'invalid_split' });

    const c = await pos.openOrder('dine_in', { tableId: IDS.table1 });
    await pos.addItem(c, IDS.variant);
    await pos.mergeOrders(b, c);
    expect((await pos.quote(b)).total).toBe('171.00');
    await expect(pos.addItem(c, IDS.variant)).rejects.toMatchObject({ code: 'order_closed' });
    plan = await pos.tables();
    expect(plan[0]!.tables.find((t) => t.label === 'T1')!.openOrders).toHaveLength(0);

    await pos.finalize(a, [{ paymentMethodId: IDS.card }]);
    await pos.finalize(b, [{ paymentMethodId: IDS.card }]);
    const sales = (await ops()).filter((o) => o.operation_type === 'sale.finalized');
    expect(sales.map((s) => [s.payload.order.tableId, s.payload.lines.length])).toEqual([
      [IDS.table2, 1],
      [IDS.table2, 3],
    ]);
  });

  it('cancelling an order after it reached the kitchen needs approval and records an operation', async () => {
    const quiet = await pos.openOrder();
    await pos.addItem(quiet, IDS.variant);
    await pos.cancelOrder(quiet, 'Left before ordering'); // nothing sent: no operation
    const sent = await pos.openOrder('dine_in', { tableId: IDS.table1 });
    await pos.addItem(sent, IDS.variant);
    await pos.sendToKitchen(sent);
    await expect(pos.cancelOrder(sent, 'Walked out')).rejects.toMatchObject({ code: 'approval_required' });
    await pos.cancelOrder(sent, 'Walked out', await pos.approve('pos.void_sent_item', 'M1', TEST_PIN));
    const last = (await ops()).at(-1);
    expect(last).toMatchObject({
      operation_type: 'order.cancelled',
      payload: { reason: 'Walked out', tableId: IDS.table1 },
    });
    expect(last.payload.items).toEqual([expect.objectContaining({ wasSentToKitchen: true })]);
    expect((await ops()).filter((o) => o.operation_type === 'order.cancelled')).toHaveLength(1);
  });
});
