import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 5b end to end on tenant B (whose other suites only check that its trial balance balances): order →
 * approval → receipts with freight → supplier invoice with a price difference and VAT → return of uninvoiced
 * goods → payments, with the payables and GRNI sub-ledgers reconciled to the GL. Tenant A is used only for
 * scope and cross-tenant checks that change no stock.
 */
describe('purchasing: orders, receipts, supplier invoices, returns and payments', () => {
  let app: INestApplication;
  let ownerB: Session;
  let ownerA: Session;
  let managerA: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const prisma = new PrismaService();

  let warehouseId: string;
  let flour: string;
  let oil: string;
  let supplierId: string;
  let orderId: string;
  let receipt1: { id: string; lines: { id: string; itemId: string }[] };
  let receipt2: { id: string; lines: { id: string; itemId: string }[] };
  let bigInvoice: string;
  let smallInvoice: string;
  const today = new Date().toISOString().slice(0, 10);

  /** [account code, debit, credit] of a journal entry, sorted. */
  const journal = async (entryId: string) =>
    (
      await owner.$queryRaw<{ code: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
        SELECT a.code, l.debit, l.credit FROM journal_lines l JOIN accounts a ON a.id = l.account_id
        WHERE l.journal_entry_id = ${entryId}::uuid`
    )
      .map((l) => [l.code, l.debit.toFixed(2), l.credit.toFixed(2)])
      .sort();
  const balance = async (itemId: string) => {
    const b = await owner.stockBalance.findUniqueOrThrow({ where: { warehouseId_itemId: { warehouseId, itemId } } });
    return [b.qtyBase.toString(), b.totalValue.toFixed(2)];
  };
  const accountId = async (code: string) =>
    (await owner.account.findFirstOrThrow({ where: { tenantId: fx.tenantB.id, code } })).id;
  const line = (r: typeof receipt1, itemId: string) => r.lines.find((l) => l.itemId === itemId)!.id;

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    ownerB = await login(app, EMAILS.ownerB);
    ownerA = await login(app, EMAILS.ownerA);
    managerA = await login(app, EMAILS.managerA);
    warehouseId = (await owner.warehouse.findFirstOrThrow({ where: { tenantId: fx.tenantB.id, code: 'B1-MAIN' } })).id;
    const item = (code: string, baseUnit: string, conversions = {}) =>
      call(ownerB, 'POST', '/api/v1/inventory/items')
        .send({ code, nameAr: code, nameEn: code, baseUnit, conversions })
        .expect(201)
        .then((r) => r.body.id as string);
    flour = await item('FLOUR', 'g');
    oil = await item('OIL', 'ml', { bottle: '750' });
    const s = await call(ownerB, 'POST', '/api/v1/purchasing/suppliers')
      .send({ code: 'MILL', nameAr: 'المطحن', nameEn: 'The Mill', paymentTermsDays: 30 })
      .expect(201);
    supplierId = s.body.id;
    await call(ownerB, 'POST', '/api/v1/purchasing/suppliers')
      .send({ code: 'MILL', nameAr: 'مكرر', nameEn: 'Duplicate' })
      .expect(409);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
    await app.close();
  });

  it('receives an approved order in parts, capitalising freight and never beyond what was ordered', async () => {
    const po = await call(ownerB, 'POST', '/api/v1/purchasing/orders')
      .send({
        supplierId,
        warehouseId,
        lines: [
          { itemId: flour, qty: '10', unit: 'kg', unitPrice: '20' },
          { itemId: oil, qty: '8', unit: 'bottle', unitPrice: '45' },
        ],
      })
      .expect(201);
    orderId = po.body.id;
    expect([po.body.status, po.body.total]).toEqual(['draft', '560']);
    const receive = (body: object) => call(ownerB, 'POST', '/api/v1/purchasing/receipts').send({ orderId, ...body });

    const draft = await receive({ lines: [{ itemId: flour, qty: '1', unit: 'kg' }] }).expect(400);
    expect(draft.body.code).toBe('invalid_state_transition');
    await call(ownerB, 'POST', `/api/v1/purchasing/orders/${orderId}/approve`).expect(201);

    const r1 = await receive({
      supplierRef: 'DN-1001',
      charges: [{ description: 'Freight', amount: '28.00' }],
      lines: [
        { itemId: flour, qty: '6', unit: 'kg' },
        { itemId: oil, qty: '8', unit: 'bottle' },
      ],
    }).expect(201);
    receipt1 = r1.body;
    // Order prices: flour 0.02/g → 120.00, oil 0.06/ml → 360.00; freight 28.00 split by value 7.00 / 21.00.
    const lines = r1.body.lines as { itemId: string; goodsValue: string; chargesValue: string }[];
    expect(lines.find((l) => l.itemId === flour)).toMatchObject({ goodsValue: '120', chargesValue: '7' });
    expect(lines.find((l) => l.itemId === oil)).toMatchObject({ goodsValue: '360', chargesValue: '21' });
    expect(await balance(flour)).toEqual(['6000', '127.00']);
    expect(await balance(oil)).toEqual(['6000', '381.00']);
    expect(await journal(r1.body.journalEntryId)).toEqual([
      ['1200', '508.00', '0.00'],
      ['2110', '0.00', '480.00'],
      ['2120', '0.00', '28.00'],
    ]);
    expect((await ownerB.agent.get(`/api/v1/purchasing/orders/${orderId}`).expect(200)).body.status).toBe(
      'partially_received',
    );

    const over = await receive({ lines: [{ itemId: flour, qty: '5', unit: 'kg' }] }).expect(400);
    expect(over.body.code).toBe('receipts.overReceived');
    const offOrder = await receive({ lines: [{ itemId: fx.itemB.id, qty: '1', unit: 'kg' }] }).expect(400);
    expect(offOrder.body.code).toBe('receipts.notOnOrder');

    receipt2 = (await receive({ lines: [{ itemId: flour, qty: '4000', unit: 'g' }] }).expect(201)).body;
    expect(await balance(flour)).toEqual(['10000', '207.00']);
    expect((await ownerB.agent.get(`/api/v1/purchasing/orders/${orderId}`).expect(200)).body.status).toBe('received');
    await call(ownerB, 'POST', `/api/v1/purchasing/orders/${orderId}/cancel`).expect(400);
  });

  it('matches a supplier invoice to receipts: GRNI at received value, price variance, input VAT', async () => {
    const freight = await accountId('2120');
    const body = (total: string, extra: object = {}) => ({
      supplierId,
      supplierInvoiceNo: 'INV-77',
      invoiceDate: today,
      total,
      lines: [
        { receiptLineId: line(receipt1, flour), qty: '6', unit: 'kg', amount: '126.00', taxAmount: '17.64' },
        { receiptLineId: line(receipt1, oil), qty: '8', unit: 'bottle', amount: '360.00', taxAmount: '50.40' },
        { accountId: freight, description: 'Freight', amount: '28.00', taxAmount: '3.92' },
      ],
      ...extra,
    });
    const wrong = await call(ownerB, 'POST', '/api/v1/purchasing/invoices').send(body('580.00')).expect(400);
    expect(wrong.body).toMatchObject({ code: 'invoices.totalMismatch', details: { computed: '585.96' } });
    const control = await call(ownerB, 'POST', '/api/v1/purchasing/invoices')
      .send({
        ...body('10.00'),
        lines: [{ accountId: await accountId('2100'), amount: '10.00', taxAmount: '0' }],
      })
      .expect(400);
    expect(control.body.code).toBe('invoices.invalidAccount');

    const inv = await call(ownerB, 'POST', '/api/v1/purchasing/invoices').send(body('585.96')).expect(201);
    bigInvoice = inv.body.id;
    expect(inv.body).toMatchObject({ subtotal: '514', taxTotal: '71.96', total: '585.96', status: 'open' });
    expect(inv.body.dueDate.slice(0, 10)).toBe(
      new Date(new Date(`${today}T00:00:00Z`).getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
    );
    expect(await journal(inv.body.journalEntryId)).toEqual([
      ['1300', '71.96', '0.00'],
      ['2100', '0.00', '585.96'],
      ['2110', '480.00', '0.00'],
      ['2120', '28.00', '0.00'],
      ['5400', '6.00', '0.00'],
    ]);

    const dup = await call(ownerB, 'POST', '/api/v1/purchasing/invoices').send(body('585.96')).expect(409);
    expect(dup.body.code).toBe('invoices.duplicate');
    const again = await call(ownerB, 'POST', '/api/v1/purchasing/invoices')
      .send({
        supplierId,
        supplierInvoiceNo: 'INV-78',
        invoiceDate: today,
        total: '1.00',
        lines: [{ receiptLineId: line(receipt1, flour), qty: '1', unit: 'g', amount: '1.00' }],
      })
      .expect(400);
    expect(again.body.code).toBe('invoices.overInvoiced');

    const st = await ownerB.agent.get(`/api/v1/purchasing/suppliers/${supplierId}/statement`).expect(200);
    expect([st.body.balance, st.body.uninvoicedValue]).toEqual(['585.96', '80.00']);
  });

  it('returns uninvoiced goods at received value, the weighted-average difference to price variance', async () => {
    const flourLine2 = line(receipt2, flour);
    const tooMuch = await call(ownerB, 'POST', '/api/v1/purchasing/returns')
      .send({
        receiptId: receipt1.id,
        reason: 'Damaged',
        lines: [{ receiptLineId: line(receipt1, flour), qty: '1', unit: 'g' }],
      })
      .expect(400);
    expect(tooMuch.body.code).toBe('returns.exceedsUninvoiced');
    const foreign = await call(ownerB, 'POST', '/api/v1/purchasing/returns')
      .send({ receiptId: receipt1.id, reason: 'Damaged', lines: [{ receiptLineId: flourLine2, qty: '1', unit: 'g' }] })
      .expect(400);
    expect(foreign.body.code).toBe('returns.unknownLine');

    const ret = await call(ownerB, 'POST', '/api/v1/purchasing/returns')
      .send({
        receiptId: receipt2.id,
        reason: 'Damp sacks',
        lines: [{ receiptLineId: flourLine2, qty: '1', unit: 'kg' }],
      })
      .expect(201);
    // GRNI cleared at the received 0.02/g (20.00); stock leaves at the weighted average 0.0207/g (20.70).
    expect(ret.body.lines[0]).toMatchObject({ grniValue: '20', stockValue: '20.7' });
    expect(await journal(ret.body.journalEntryId)).toEqual([
      ['1200', '0.00', '20.70'],
      ['2110', '20.00', '0.00'],
      ['5400', '0.70', '0.00'],
    ]);
    expect(await balance(flour)).toEqual(['9000', '186.30']);

    // The rest of the line is invoiced: the remaining received value clears exactly, no variance.
    const inv = await call(ownerB, 'POST', '/api/v1/purchasing/invoices')
      .send({
        supplierId,
        supplierInvoiceNo: 'INV-79',
        invoiceDate: today,
        total: '68.40',
        lines: [{ receiptLineId: flourLine2, qty: '3', unit: 'kg', amount: '60.00', taxAmount: '8.40' }],
      })
      .expect(201);
    smallInvoice = inv.body.id;
    expect(inv.body.lines[0]).toMatchObject({ grniCleared: '60', priceVariance: '0' });
    const rl = await owner.goodsReceiptLine.findUniqueOrThrow({ where: { id: flourLine2 } });
    expect([rl.qtyInvoicedBase.toString(), rl.qtyReturnedBase.toString(), rl.valueCleared.toFixed(2)]).toEqual([
      '3000',
      '1000',
      '80.00',
    ]);
  });

  it('pays invoices by allocation and never beyond their open amount', async () => {
    const pay = (body: object) =>
      call(ownerB, 'POST', '/api/v1/purchasing/payments').send({ supplierId, method: 'bank', ...body });
    const mismatch = await pay({ amount: '100.00', allocations: [{ invoiceId: bigInvoice, amount: '90.00' }] }).expect(
      400,
    );
    expect(mismatch.body.code).toBe('payments.allocationMismatch');
    const over = await pay({ amount: '100.00', allocations: [{ invoiceId: smallInvoice, amount: '100.00' }] }).expect(
      400,
    );
    expect(over.body).toMatchObject({ code: 'payments.overpaid', details: { open: '68.40' } });
    const other = await pay({
      amount: '1.00',
      allocations: [{ invoiceId: fx.supplierInvoiceB.id, amount: '1.00' }],
    }).expect(404);
    expect(other.body.code).toBe('supplier_invoices.notFound');

    const first = await pay({
      amount: '300.00',
      reference: 'TRX-1',
      allocations: [{ invoiceId: bigInvoice, amount: '300.00' }],
    }).expect(201);
    expect(await journal(first.body.journalEntryId)).toEqual([
      ['1150', '0.00', '300.00'],
      ['2100', '300.00', '0.00'],
    ]);
    const second = await pay({
      method: 'cash',
      amount: '354.36',
      allocations: [
        { invoiceId: bigInvoice, amount: '285.96' },
        { invoiceId: smallInvoice, amount: '68.40' },
      ],
    }).expect(201);
    expect(await journal(second.body.journalEntryId)).toEqual([
      ['1140', '0.00', '354.36'],
      ['2100', '354.36', '0.00'],
    ]);
    const invoices = await owner.supplierInvoice.findMany({ where: { id: { in: [bigInvoice, smallInvoice] } } });
    expect(invoices.map((i) => i.status)).toEqual(['paid', 'paid']);
    await pay({ amount: '0.01', allocations: [{ invoiceId: smallInvoice, amount: '0.01' }] }).expect(400);

    const st = await ownerB.agent.get(`/api/v1/purchasing/suppliers/${supplierId}/statement`).expect(200);
    expect([st.body.balance, st.body.uninvoicedValue, st.body.payments.length]).toEqual(['0.00', '0.00', 2]);
  });

  it('keeps payables, GRNI and stock reconciled to the general ledger', async () => {
    const p = (await ownerB.agent.get('/api/v1/purchasing/reconciliation').expect(200)).body;
    expect(p).toMatchObject({ payablesMatch: true, goodsReceivedMatch: true, accruedPurchaseCharges: '0.00' });
    // Tenant B's fixture purchase: 100.00 of its invoice is unpaid and 0.5 kg rice (15.00) is not invoiced yet.
    expect([p.openPayables, p.uninvoicedReceipts]).toEqual(['100.00', '15.00']);
    const inv = (await ownerB.agent.get('/api/v1/inventory/reconciliation').expect(200)).body;
    expect(inv).toMatchObject({ ledgerMatchesBalances: true, glMatchesStock: true });
    const tb = await ownerB.agent.get('/api/v1/accounting/trial-balance').expect(200);
    expect(tb.body.balanced).toBe(true);
  });

  it('protects posted purchasing documents in the database', async () => {
    const run = (sql: string) => prisma.withTenant(fx.tenantB.id, (tx) => tx.$executeRawUnsafe(sql));
    await expect(run(`UPDATE goods_receipt_lines SET goods_value = 1`)).rejects.toThrow(/immutable/);
    await expect(run(`UPDATE supplier_invoice_lines SET amount = 1`)).rejects.toThrow(/immutable/);
    await expect(run(`UPDATE supplier_payment_allocations SET amount = 1`)).rejects.toThrow(/immutable/);
    await expect(run(`DELETE FROM supplier_invoices`)).rejects.toThrow(/permission denied/i);
    // Running totals may change, but never past what was received or invoiced.
    await expect(run(`UPDATE goods_receipt_lines SET qty_invoiced_base = qty_base + 1`)).rejects.toThrow(
      /check constraint/i,
    );
    await expect(run(`UPDATE supplier_invoices SET amount_paid = total + 1`)).rejects.toThrow(/check constraint/i);
  });

  it('confines branch managers and refuses other tenants’ documents', async () => {
    const supplierA = (
      await call(ownerA, 'POST', '/api/v1/purchasing/suppliers')
        .send({ code: 'A-SUP', nameAr: 'مورد', nameEn: 'Supplier A' })
        .expect(201)
    ).body.id;
    const main2 = (await owner.warehouse.findFirstOrThrow({ where: { tenantId: fx.tenantA.id, code: 'A2-MAIN' } })).id;
    const item = (await owner.inventoryItem.findFirstOrThrow({ where: { tenantId: fx.tenantA.id, code: 'TEA-LEAF' } }))
      .id;
    const poA2 = (
      await call(ownerA, 'POST', '/api/v1/purchasing/orders')
        .send({
          supplierId: supplierA,
          warehouseId: main2,
          lines: [{ itemId: item, qty: '1', unit: 'kg', unitPrice: '400' }],
        })
        .expect(201)
    ).body.id;

    const visible = (await managerA.agent.get('/api/v1/purchasing/orders').expect(200)).body as { id: string }[];
    expect(visible.map((o) => o.id)).not.toContain(poA2);
    await managerA.agent.get(`/api/v1/purchasing/orders/${poA2}`).expect(404);
    await call(managerA, 'POST', `/api/v1/purchasing/orders/${poA2}/approve`).expect(403);
    await call(managerA, 'POST', '/api/v1/purchasing/receipts')
      .send({
        supplierId: supplierA,
        warehouseId: main2,
        lines: [{ itemId: item, qty: '1', unit: 'kg', unitPrice: '400' }],
      })
      .expect(404);
    await managerA.agent.get('/api/v1/purchasing/invoices').expect(403);
    await managerA.agent.get('/api/v1/purchasing/reconciliation').expect(403);

    // Tenant B ids in tenant A request bodies are simply not found.
    await call(ownerA, 'POST', '/api/v1/purchasing/receipts')
      .send({ orderId: fx.orderB.id, lines: [{ itemId: item, qty: '1', unit: 'kg' }] })
      .expect(404);
    await call(ownerA, 'POST', '/api/v1/purchasing/invoices')
      .send({
        supplierId: fx.supplierB.id,
        supplierInvoiceNo: 'X-1',
        invoiceDate: today,
        total: '1.00',
        lines: [{ accountId: await accountId('5200'), amount: '1.00' }],
      })
      .expect(404);
    await call(ownerA, 'POST', '/api/v1/purchasing/returns')
      .send({
        receiptId: fx.receiptB.id,
        reason: 'Probe',
        lines: [{ receiptLineId: fx.receiptB.id, qty: '1', unit: 'g' }],
      })
      .expect(404);
    await call(ownerA, 'POST', `/api/v1/purchasing/orders/${poA2}/cancel`).expect(201);
  });
});
