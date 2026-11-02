import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuidv7 } from '@ros/domain';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient, syncServiceFor } from './fixtures';
import { buildSaleOp, pushBody } from './sale-factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 5a end to end on tenant A's fixture stock (tea leaves, 5 g per tea). The fixtures built it through
 * the real services: opening balance 1 kg at 500/kg, 10 g wasted, 100 g transferred A1 → A2, an A2 count of
 * 98 g, and one synced tea sale that consumed 5 g.
 */
describe('inventory: recipes, stock ledger, COGS, counts and transfers', () => {
  let app: INestApplication;
  let ownerA: Session;
  let managerA: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const prisma = new PrismaService();
  const sync = syncServiceFor(prisma);
  let seq = 100;

  let itemId: string;
  let variantId: string;
  let main1: string;
  let main2: string;
  let device: { tenantId: string; branchId: string; deviceId: string; branchCode: string; deviceCode: string };
  let teaItem: Parameters<typeof buildSaleOp>[1]['items'][number];
  let cashId: string;

  const balance = async (warehouseId: string) =>
    owner.stockBalance.findUniqueOrThrow({ where: { warehouseId_itemId: { warehouseId, itemId } } });
  const sell = async (qty: string) => {
    const op = buildSaleOp(device, { seq: ++seq, paymentMethodId: cashId, items: [{ ...teaItem, qty }] });
    const res = await sync.push(device, pushBody([op]));
    expect(res.results[0]?.status).toBe('accepted');
    return { op, result: res.results[0] as { result?: Record<string, unknown> } };
  };
  /** [account code, debit, credit] of a journal entry, sorted. */
  const journal = async (entryId: string) =>
    (
      await owner.$queryRaw<{ code: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
        SELECT a.code, l.debit, l.credit FROM journal_lines l JOIN accounts a ON a.id = l.account_id
        WHERE l.journal_entry_id = ${entryId}::uuid`
    )
      .map((l) => [l.code, l.debit.toFixed(2), l.credit.toFixed(2)])
      .sort();
  const reconcile = async () => (await ownerA.agent.get('/api/v1/inventory/reconciliation').expect(200)).body;

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    ownerA = await login(app, EMAILS.ownerA);
    managerA = await login(app, EMAILS.managerA);
    const tenantId = fx.tenantA.id;
    itemId = (await owner.inventoryItem.findFirstOrThrow({ where: { tenantId, code: 'TEA-LEAF' } })).id;
    main1 = (await owner.warehouse.findFirstOrThrow({ where: { tenantId, code: 'A1-MAIN' } })).id;
    main2 = (await owner.warehouse.findFirstOrThrow({ where: { tenantId, code: 'A2-MAIN' } })).id;
    const variant = await owner.productVariant.findFirstOrThrow({ where: { tenantId }, include: { product: true } });
    variantId = variant.id;
    const rates = await owner.taxCategoryRate.findMany({ where: { taxCategoryId: variant.product.taxCategoryId } });
    teaItem = {
      variantId,
      taxCategoryId: variant.product.taxCategoryId,
      taxes: rates.map((r) => ({ taxRateId: r.taxRateId, rate: '0.14' })),
      unitPrice: '20.00',
      nameAr: 'شاي',
      nameEn: 'Tea',
    };
    const d = await owner.device.findFirstOrThrow({ where: { tenantId, code: 'P1' } });
    device = { tenantId, branchId: fx.branchA1.id, deviceId: d.id, branchCode: 'A1', deviceCode: 'P1' };
    cashId = (await owner.paymentMethod.findFirstOrThrow({ where: { tenantId, code: 'CASH' } })).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
    await app.close();
  });

  it('values every fixture step at weighted average and keeps the ledger, balances and GL in step', async () => {
    const a1 = await balance(main1);
    expect([a1.qtyBase.toString(), a1.totalValue.toFixed(2)]).toEqual(['885', '442.50']);
    const a2 = await balance(main2);
    expect([a2.qtyBase.toString(), a2.totalValue.toFixed(2)]).toEqual(['98', '49.00']);
    const transit = await owner.warehouse.findFirstOrThrow({ where: { tenantId: fx.tenantA.id, kind: 'transit' } });
    expect((await balance(transit.id)).qtyBase.toString()).toBe('0');

    const r = await reconcile();
    expect(r).toMatchObject({ ledgerMatchesBalances: true, mismatches: [], glMatchesStock: true });
    expect(r.stockValue).toBe('491.50');
    expect(r.glInventoryValue).toBe('491.50');

    const list = (await ownerA.agent.get('/api/v1/inventory/balances').expect(200)).body as {
      warehouseCode: string;
      belowMinimum: boolean;
    }[];
    expect(list.find((b) => b.warehouseCode === 'A2-MAIN')?.belowMinimum).toBe(true);
    expect(list.find((b) => b.warehouseCode === 'A1-MAIN')?.belowMinimum).toBe(false);
  });

  it('consumes the recipe of every synced sale and posts COGS from the same movements', async () => {
    const { op } = await sell('3');
    const invoiceId = (op.payload as { invoice: { id: string } }).invoice.id;
    const line = await owner.invoiceLine.findFirstOrThrow({ where: { invoiceId } });
    const active = await owner.recipeVersion.findFirstOrThrow({ where: { tenantId: fx.tenantA.id, status: 'active' } });
    expect(line.recipeVersionId).toBe(active.id);

    const moves = await owner.stockMovement.findMany({ where: { sourceType: 'invoice', sourceId: invoiceId } });
    expect(moves.map((m) => [m.movementType, m.qtyBase.toString(), m.totalCost.toFixed(2)])).toEqual([
      ['sale_consumption', '-15', '-7.50'],
    ]);
    expect(await journal(moves[0]!.journalEntryId!)).toEqual([
      ['1200', '0.00', '7.50'],
      ['5100', '7.50', '0.00'],
    ]);
    expect((await balance(main1)).qtyBase.toString()).toBe('870');
  });

  it('never consumes twice when the same sale is pushed again', async () => {
    const { op } = await sell('1');
    const before = await owner.stockMovement.count({ where: { tenantId: fx.tenantA.id } });
    const again = await sync.push(device, pushBody([op]));
    expect(again.results[0]?.status).toBe('already_processed');
    expect(await owner.stockMovement.count({ where: { tenantId: fx.tenantA.id } })).toBe(before);
  });

  it('keeps old sales on their recipe version when the recipe changes', async () => {
    const before = await owner.recipeVersion.findFirstOrThrow({ where: { tenantId: fx.tenantA.id, status: 'active' } });
    const v2 = await call(ownerA, 'POST', '/api/v1/inventory/recipes')
      .send({ variantId, lines: [{ itemId, qty: '6', unit: 'g', wastePct: '0' }] })
      .expect(201);
    expect(v2.body.version).toBe(before.version + 1);
    expect((await owner.recipeVersion.findUniqueOrThrow({ where: { id: before.id } })).status).toBe('retired');
    // Versions are immutable: lines of the retired version cannot be edited even by the app role.
    await expect(
      prisma.withTenant(fx.tenantA.id, (tx) => tx.$executeRawUnsafe(`UPDATE recipe_lines SET qty = 1`)),
    ).rejects.toThrow(/immutable/);

    const { op } = await sell('1');
    const invoiceId = (op.payload as { invoice: { id: string } }).invoice.id;
    expect((await owner.invoiceLine.findFirstOrThrow({ where: { invoiceId } })).recipeVersionId).toBe(v2.body.id);
    const m = await owner.stockMovement.findFirstOrThrow({ where: { sourceId: invoiceId } });
    expect(m.qtyBase.toString()).toBe('-6');

    await call(ownerA, 'POST', '/api/v1/inventory/recipes')
      .send({ variantId, lines: [{ itemId, qty: '1', unit: 'pc' }] })
      .expect(400);
  });

  it('sells through zero stock, flags it, and settles the shortfall as a price variance on the next receipt', async () => {
    const onHand = Number((await balance(main1)).qtyBase);
    const portions = String(Math.ceil(onHand / 6) + 2); // 6 g each → ends below zero
    const { op } = await sell(portions);
    const invoiceId = (op.payload as { invoice: { id: string } }).invoice.id;
    const d = await owner.saleDiscrepancy.findMany({ where: { invoiceId } });
    expect(d.map((x) => x.kind)).toContain('negative_stock');
    const negative = await balance(main1);
    expect(negative.qtyBase.isNegative()).toBe(true);

    await call(ownerA, 'POST', '/api/v1/inventory/adjustments')
      .send({
        warehouseId: main1,
        kind: 'opening_balance',
        reason: 'Late delivery booked',
        lines: [{ itemId, qty: '2', unit: 'kg', unitCost: '600' }],
      })
      .expect(201);
    const after = await balance(main1);
    // Everything left is valued at the new cost (0.60/g); the difference went to price variance.
    expect(after.totalValue.toFixed(2)).toBe(after.qtyBase.mul('0.6').toFixed(2));
    const reval = await owner.stockMovement.findMany({
      where: { tenantId: fx.tenantA.id, movementType: 'revaluation' },
    });
    expect(reval).toHaveLength(1);
    expect((await reconcile()).glMatchesStock).toBe(true);
  });

  it('books a shortfall on receipt as a transfer variance, never silently', async () => {
    const t = await call(ownerA, 'POST', '/api/v1/inventory/transfers')
      .send({ fromWarehouseId: main1, toWarehouseId: main2, lines: [{ itemId, qty: '50', unit: 'g' }] })
      .expect(201);
    await call(ownerA, 'POST', `/api/v1/inventory/transfers/${t.body.id}/receive`)
      .send({ lines: [{ itemId, qtyReceived: '50', unit: 'g' }] })
      .expect(400); // not dispatched yet
    await call(ownerA, 'POST', `/api/v1/inventory/transfers/${t.body.id}/dispatch`).expect(201);
    const a2 = Number((await balance(main2)).qtyBase);
    await call(ownerA, 'POST', `/api/v1/inventory/transfers/${t.body.id}/receive`)
      .send({ lines: [{ itemId, qtyReceived: '60', unit: 'g' }] })
      .expect(400);
    const done = await call(ownerA, 'POST', `/api/v1/inventory/transfers/${t.body.id}/receive`)
      .send({ lines: [{ itemId, qtyReceived: '45', unit: 'g' }] })
      .expect(201);
    expect(done.body.status).toBe('received');
    expect(Number((await balance(main2)).qtyBase)).toBe(a2 + 45);
    const variance = await owner.stockMovement.findFirstOrThrow({
      where: { sourceId: t.body.id, movementType: 'transfer_variance' },
    });
    expect([variance.qtyBase.toString(), variance.totalCost.toFixed(2)]).toEqual(['-5', '-3.00']);
    expect(await journal(done.body.receiveJournalId)).toEqual([
      ['1200', '27.00', '0.00'],
      ['1210', '0.00', '30.00'],
      ['5300', '3.00', '0.00'],
    ]);
    const transit = await owner.warehouse.findFirstOrThrow({ where: { tenantId: fx.tenantA.id, kind: 'transit' } });
    expect((await balance(transit.id)).totalValue.toFixed(2)).toBe('0.00');
    expect(await reconcile()).toMatchObject({ ledgerMatchesBalances: true, glMatchesStock: true });
  });

  it('turns an approved count into gain/loss movements against the stock at approval time', async () => {
    const count = await call(ownerA, 'POST', '/api/v1/inventory/counts').send({ warehouseId: main2 }).expect(201);
    await call(ownerA, 'POST', '/api/v1/inventory/counts').send({ warehouseId: main2 }).expect(409);
    const system = Number(count.body.lines.find((l: { itemId: string }) => l.itemId === itemId).systemQty);
    await call(ownerA, 'PUT', `/api/v1/inventory/counts/${count.body.id}/lines`)
      .send({ lines: [{ itemId, countedQty: String(system + 4), unit: 'g' }] })
      .expect(200);
    const approved = await call(ownerA, 'POST', `/api/v1/inventory/counts/${count.body.id}/approve`).expect(201);
    expect(approved.body.status).toBe('approved');
    const gain = await owner.stockMovement.findFirstOrThrow({ where: { sourceId: count.body.id } });
    expect([gain.movementType, gain.qtyBase.toString()]).toEqual(['count_gain', '4']);
    expect(Number((await balance(main2)).qtyBase)).toBe(system + 4);
    await call(ownerA, 'POST', `/api/v1/inventory/counts/${count.body.id}/approve`).expect(400);
  });

  it('records food voided after the kitchen as wastage (order cancelled on the POS)', async () => {
    const cashier = await owner.employee.findFirstOrThrow({ where: { tenantId: fx.tenantA.id, employeeNo: 'C1' } });
    const orderId = uuidv7();
    const now = new Date().toISOString();
    const res = await sync.push(
      device,
      pushBody([
        {
          operation_id: uuidv7(),
          tenant_id: device.tenantId,
          branch_id: device.branchId,
          device_id: device.deviceId,
          operation_type: 'order.cancelled',
          schema_version: 1,
          occurred_at: now,
          local_seq: ++seq,
          depends_on: [],
          refs: {},
          payload: {
            orderId,
            localNumber: 'A1-P1-X0001',
            channel: 'takeaway',
            tableId: null,
            employeeId: cashier.id,
            openedAt: now,
            cancelledAt: now,
            reason: 'Customer left',
            approval: null,
            items: [
              {
                orderItemId: uuidv7(),
                variantId,
                productNameEn: 'Tea',
                qty: '2',
                unitPrice: '20.00',
                wasSentToKitchen: true,
              },
              {
                orderItemId: uuidv7(),
                variantId,
                productNameEn: 'Tea',
                qty: '1',
                unitPrice: '20.00',
                wasSentToKitchen: false,
              },
            ],
          },
        },
      ] as never),
    );
    expect(res.results[0]?.status).toBe('accepted');
    const moves = await owner.stockMovement.findMany({ where: { sourceType: 'order', sourceId: orderId } });
    expect(moves.map((m) => [m.movementType, m.qtyBase.toString()])).toEqual([['wastage', '-12']]);
    expect((await journal(moves[0]!.journalEntryId!)).map((l) => l[0])).toEqual(['1200', '5200']);
  });

  it('keeps the stock ledger append-only for the application role', async () => {
    const run = (sql: string) => prisma.withTenant(fx.tenantA.id, (tx) => tx.$executeRawUnsafe(sql));
    await expect(run(`UPDATE stock_movements SET qty_base = 0`)).rejects.toThrow(/permission denied/i);
    await expect(run(`DELETE FROM stock_movements`)).rejects.toThrow(/permission denied/i);
    // A movement whose sign contradicts its type is refused by the database itself.
    await expect(
      owner.$executeRaw`INSERT INTO stock_movements (id, tenant_id, warehouse_id, item_id, movement_type, qty_base, unit_cost, total_cost, source_type, source_id, business_date, occurred_at)
        VALUES (${uuidv7()}::uuid, ${fx.tenantA.id}::uuid, ${main1}::uuid, ${itemId}::uuid, 'wastage', 5, 0, 0, 'test', ${uuidv7()}::uuid, current_date, now())`,
    ).rejects.toThrow(/check constraint/i);
  });

  it('validates adjustments and confines branch managers to their own warehouses', async () => {
    await call(ownerA, 'POST', '/api/v1/inventory/adjustments')
      .send({ warehouseId: main1, kind: 'wastage', reason: 'Bad', lines: [{ itemId, qty: '-5', unit: 'g' }] })
      .expect(400);
    await call(ownerA, 'POST', '/api/v1/inventory/adjustments')
      .send({
        warehouseId: main1,
        kind: 'opening_balance',
        reason: 'No cost',
        lines: [{ itemId, qty: '5', unit: 'g' }],
      })
      .expect(400);
    const out = await call(ownerA, 'POST', '/api/v1/inventory/adjustments')
      .send({ warehouseId: main1, kind: 'adjustment', reason: 'Recount', lines: [{ itemId, qty: '-3', unit: 'g' }] })
      .expect(201);
    expect(out.body.number).toMatch(/^ADJ-\d{6}$/);
    const m = await owner.stockMovement.findFirstOrThrow({ where: { sourceId: out.body.id } });
    expect(m.movementType).toBe('adjustment_out');

    // Manager A is scoped to branch A1: A2's warehouse does not exist for them.
    await call(managerA, 'POST', '/api/v1/inventory/counts').send({ warehouseId: main2 }).expect(404);
    const visible = (await managerA.agent.get('/api/v1/inventory/balances').expect(200)).body as {
      warehouseCode: string;
    }[];
    expect([...new Set(visible.map((b) => b.warehouseCode))]).toEqual(['A1-MAIN']);
    const warehouses = (await managerA.agent.get('/api/v1/inventory/warehouses').expect(200)).body as {
      code: string;
    }[];
    expect(warehouses.map((w) => w.code)).toEqual(['A1-MAIN']);
    // A transfer may go to any branch's store, so the destination list is tenant-wide (never transit).
    const targets = (await managerA.agent.get('/api/v1/inventory/warehouses?destinations=true').expect(200)).body as {
      code: string;
    }[];
    expect(targets.map((w) => w.code)).toEqual(['A1-MAIN', 'A2-MAIN']);
    const all = (await ownerA.agent.get('/api/v1/inventory/warehouses').expect(200)).body as { kind: string }[];
    expect(all.map((w) => w.kind).sort()).toEqual(['main', 'main', 'transit']);
    await managerA.agent.get('/api/v1/inventory/reconciliation').expect(403);
    expect(await reconcile()).toMatchObject({ ledgerMatchesBalances: true, glMatchesStock: true });
  });

  it('rejects duplicate item codes', async () => {
    await call(ownerA, 'POST', '/api/v1/inventory/items')
      .send({ code: 'TEA-LEAF', nameAr: 'مكرر', nameEn: 'Dup', baseUnit: 'g' })
      .expect(409);
    const made = await call(ownerA, 'POST', '/api/v1/inventory/items')
      .send({
        code: 'CUP',
        nameAr: 'كوب',
        nameEn: 'Cup',
        baseUnit: 'pc',
        kind: 'packaging',
        conversions: { box: '50' },
      })
      .expect(201);
    expect(new Prisma.Decimal(made.body.standardCost).isZero()).toBe(true);
  });
});
