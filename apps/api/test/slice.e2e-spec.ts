import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { MemoryCredentialStore, migrate, PosCore, SyncClient, type FetchLike } from '@ros/pos-core';
import { FilePrinter, NodeSqliteDriver } from '@ros/pos-core/node';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';

/**
 * Phase 3 vertical slice (doc 08 P3-1…P3-7), all real components: dashboard API → pull to a POS SQLite file
 * → sale with the network down → receipt from local data → restart → sync → server records and ledger.
 */
describe('vertical slice: product → offline sale → receipt → sync → ledger', () => {
  let app: INestApplication;
  let ownerB: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  let baseUrl: string;
  const owner = ownerClient();
  const dir = mkdtempSync(join(tmpdir(), 'ros-slice-'));
  const dbPath = join(dir, 'pos.db');
  const printerDir = join(dir, 'printer');
  const credentials = new MemoryCredentialStore();
  const offline: FetchLike = () => Promise.reject(new TypeError('fetch failed: network down'));

  let db: NodeSqliteDriver;
  let pos: PosCore;
  let variantId: string;
  let invoiceId: string;
  let invoiceNumber: string;

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api`.replace('[::1]', '127.0.0.1');
    fx = await loadFixtures();
    ownerB = await login(app, EMAILS.ownerB);
    db = new NodeSqliteDriver(dbPath);
    await migrate(db);
    pos = new PosCore(db, new FilePrinter(printerDir));
  });
  afterAll(async () => {
    await db.close();
    await owner.$disconnect();
    await app.close();
  });

  it('P3-1: a manager creates a product in the dashboard and the paired POS receives it', async () => {
    const taxCats = await ownerB.agent.get('/api/v1/catalog/tax-categories').expect(200);
    const standard = taxCats.body.find((c: { code: string }) => c.code === 'STANDARD');
    const category = await call(ownerB, 'POST', '/api/v1/catalog/categories')
      .send({ nameAr: 'سندوتشات', nameEn: 'Sandwiches' })
      .expect(201);
    // Category picture: only image data URLs are accepted; it travels to the till with the catalog.
    const picture = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;
    await call(ownerB, 'PATCH', `/api/v1/catalog/categories/${category.body.id}`)
      .send({ image: 'https://example.com/x.png', rowVersion: 1 })
      .expect(400);
    await call(ownerB, 'PATCH', `/api/v1/catalog/categories/${category.body.id}`)
      .send({ image: picture, rowVersion: 1 })
      .expect(200);
    await call(ownerB, 'PATCH', `/api/v1/catalog/categories/${category.body.id}`)
      .send({ image: null, rowVersion: 1 })
      .expect(409);
    const product = await call(ownerB, 'POST', '/api/v1/catalog/products')
      .send({
        nameAr: 'فلافل',
        nameEn: 'Falafel',
        categoryId: category.body.id,
        taxCategoryId: standard.id,
        price: '22.80',
      })
      .expect(201);
    variantId = product.body.variants[0].id;

    // Phase 4: selling needs a signed-in employee (PIN) and cash needs an open drawer.
    const roles = (await ownerB.agent.get('/api/v1/roles').expect(200)).body as { id: string; templateKey: string }[];
    const employee = await call(ownerB, 'POST', '/api/v1/employees')
      .send({
        employeeNo: 'S1',
        fullNameAr: 'منى',
        fullNameEn: 'Mona',
        roleId: roles.find((r) => r.templateKey === 'cashier')!.id,
        branchIds: [fx.branchB1.id],
      })
      .expect(201);
    await call(ownerB, 'POST', `/api/v1/employees/${employee.body.id}/pin`).send({ pin: '5150' }).expect(200);

    const device = await call(ownerB, 'POST', '/api/v1/devices')
      .send({ branchId: fx.branchB1.id, code: 'S1', name: 'Slice POS' })
      .expect(201);
    const sync = new SyncClient(db, baseUrl, credentials);
    await sync.pair(device.body.pairingCode);
    expect((await sync.pull()).state).toBe('idle');
    const menu = await pos.menu();
    expect(menu.find((m) => m.variantId === variantId)).toMatchObject({ nameEn: 'Falafel', price: '22.80' });
    expect((await pos.categories()).find((c) => c.id === category.body.id)?.image).toBe(picture);
  });

  it('P3-2/P3-3: sells with the network down, commits locally and prints the receipt', async () => {
    await pos.login('S1', '5150');
    await pos.openCashSession('200');
    const order = await pos.openOrder('takeaway');
    await pos.addItem(order, variantId, '2');
    const cash = (await pos.refs.list<{ id: string; code: string }>('payment_method')).find((m) => m.code === 'CASH')!;
    const sale = await pos.finalize(order, [{ paymentMethodId: cash.id, tendered: '50' }]);
    expect(sale).toMatchObject({ number: 'B1-S1-000001', total: '45.60', changeGiven: '4.40', printed: true });
    invoiceId = sale.invoiceId;
    invoiceNumber = sale.number;

    const offlineSync = new SyncClient(db, baseUrl, credentials, offline);
    const attempt = await offlineSync.push();
    expect(attempt).toMatchObject({ state: 'offline', sent: 2, acked: 0, retrying: 2 }); // session open + sale
    expect((await offlineSync.status()).pending).toBe(2);
    expect(await owner.invoice.count({ where: { id: invoiceId } })).toBe(0);

    const receipt = readdirSync(printerDir).find((f) => f.startsWith(invoiceNumber) && f.endsWith('.txt'))!;
    const text = readFileSync(join(printerDir, receipt), 'utf8');
    expect(text).toMatch(/TOTAL EGP\s+45\.60/);
    expect(text).toMatch(/Change\s+4\.40/);
  });

  it('survives an application restart with the sale still queued', async () => {
    await db.close();
    db = new NodeSqliteDriver(dbPath);
    await migrate(db);
    pos = new PosCore(db, new FilePrinter(printerDir));
    expect((await pos.history()).map((h) => [h.number, h.sync_status])).toEqual([[invoiceNumber, 'pending']]);
  });

  it('P3-4: on reconnect the outbox drains into exactly one invoice with a balanced journal entry', async () => {
    const sync = new SyncClient(db, baseUrl, credentials, undefined, () => Date.now() + 10 * 60_000); // backoff elapsed
    const res = await sync.push();
    expect(res).toMatchObject({ state: 'idle', sent: 2, acked: 2, rejected: 0 });
    expect(await sync.status()).toMatchObject({ pending: 0, acked: 2 });

    const invoice = await ownerB.agent.get(`/api/v1/sales/invoices/${invoiceId}`).expect(200);
    expect(invoice.body).toMatchObject({
      number: invoiceNumber,
      total: '45.6',
      subtotal: '40',
      taxTotal: '5.6',
      paymentStatus: 'paid',
      discrepancies: [],
    });
    expect(invoice.body.payments[0]).toMatchObject({ amount: '45.6', tendered: '50', changeGiven: '4.4' });
    const debit = invoice.body.journal.lines.reduce((s: number, l: { debit: string }) => s + Number(l.debit), 0);
    const credit = invoice.body.journal.lines.reduce((s: number, l: { credit: string }) => s + Number(l.credit), 0);
    expect(debit.toFixed(2)).toBe('45.60');
    expect(credit.toFixed(2)).toBe('45.60');
  });

  it('P3-5: a lost acknowledgement is resent and answered as already processed, never duplicated', async () => {
    await db.batch([{ sql: "UPDATE outbox SET status = 'pending', next_attempt_at = NULL WHERE status = 'acked'" }]);
    const res = await new SyncClient(db, baseUrl, credentials).push();
    expect(res).toMatchObject({ sent: 2, acked: 2 });
    expect(await owner.invoice.count({ where: { id: invoiceId } })).toBe(1);
    expect(await owner.journalEntry.count({ where: { sourceId: invoiceId } })).toBe(1);
  });

  it('P3-7: the tenant trial balance balances after the slice', async () => {
    const tb = await ownerB.agent.get('/api/v1/accounting/trial-balance').expect(200);
    expect(tb.body.balanced).toBe(true);
    expect(tb.body.totalDebit).toBe(tb.body.totalCredit);
  });
});
