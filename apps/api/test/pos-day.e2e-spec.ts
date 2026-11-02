import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { MemoryCredentialStore, migrate, PosCore, SyncClient, type FetchLike } from '@ros/pos-core';
import { NodeSqliteDriver } from '@ros/pos-core/node';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';

const offline: FetchLike = () => Promise.reject(new TypeError('network down'));
const silentPrinter = { print: async () => undefined };

/**
 * Phase 4a end to end (doc 08 P4-2, P4-3 approvals, P4-4, P4-5, P4-8, P4-10): staff and PINs set in the
 * dashboard, two POS devices in one branch working offline, a refund and a pay-out approved by a manager's
 * PIN, a drawer closed short — then everything syncs and the ledger balances.
 */
describe('a POS day on two offline devices', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerB: Session;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();
  const dir = mkdtempSync(join(tmpdir(), 'ros-day-'));

  interface Till {
    db: NodeSqliteDriver;
    pos: PosCore;
    online: SyncClient;
    offline: SyncClient;
  }
  const tills: Till[] = [];
  let variantId: string;
  let cashId: string;
  let cardId: string;
  let cashierId: string;
  let firstSaleId: string;

  async function pairTill(code: string): Promise<Till> {
    const device = await call(ownerB, 'POST', '/api/v1/devices')
      .send({ branchId: fx.branchB1.id, code, name: `Till ${code}` })
      .expect(201);
    const db = new NodeSqliteDriver(join(dir, `${code}.db`));
    await migrate(db);
    const creds = new MemoryCredentialStore();
    const online = new SyncClient(db, baseUrl, creds, undefined, () => Date.now() + 3_600_000); // backoff elapsed
    await online.pair(device.body.pairingCode);
    await online.pull();
    return { db, pos: new PosCore(db, silentPrinter), online, offline: new SyncClient(db, baseUrl, creds, offline) };
  }

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

  it('sets up staff with PINs in the dashboard (PIN hashes never returned)', async () => {
    const roles = (await ownerB.agent.get('/api/v1/roles').expect(200)).body as { id: string; templateKey: string }[];
    const role = (k: string) => roles.find((r) => r.templateKey === k)!.id;
    const cashier = await call(ownerB, 'POST', '/api/v1/employees')
      .send({
        employeeNo: 'K7',
        fullNameAr: 'أمل',
        fullNameEn: 'Amal',
        roleId: role('cashier'),
        branchIds: [fx.branchB1.id],
      })
      .expect(201);
    const manager = await call(ownerB, 'POST', '/api/v1/employees')
      .send({
        employeeNo: 'G7',
        fullNameAr: 'حسن',
        fullNameEn: 'Hassan',
        roleId: role('manager'),
        branchIds: [fx.branchB1.id],
      })
      .expect(201);
    cashierId = cashier.body.id;
    await call(ownerB, 'POST', `/api/v1/employees/${cashier.body.id}/pin`).send({ pin: '4711' }).expect(200);
    await call(ownerB, 'POST', `/api/v1/employees/${manager.body.id}/pin`).send({ pin: '8080' }).expect(200);
    const list = await ownerB.agent.get('/api/v1/employees').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('pbkdf2');
    expect(list.body.find((e: { employeeNo: string }) => e.employeeNo === 'K7')).toMatchObject({ hasPin: true });

    const products = (await ownerB.agent.get('/api/v1/catalog/products').expect(200)).body as {
      nameEn: string;
      variants: { id: string }[];
    }[];
    variantId = products.find((p) => p.nameEn === 'Koshary')!.variants[0]!.id; // fixture product, 60.00 incl. VAT
    const methods = (await ownerB.agent.get('/api/v1/catalog/payment-methods').expect(200)).body as {
      id: string;
      code: string;
    }[];
    cashId = methods.find((m) => m.code === 'CASH')!.id;
    cardId = methods.find((m) => m.code === 'CARD')!.id;
  });

  it('two tills pair and receive staff, roles and a signed lease', async () => {
    tills.push(await pairTill('T1'), await pairTill('T2'));
    for (const t of tills) {
      expect((await t.pos.leaseStatus()).valid).toBe(true);
      await expect(t.pos.login('K7', '4711')).resolves.toMatchObject({ name: 'Amal' });
    }
  });

  it('both tills sell offline at the same time; refund and pay-out need a manager PIN', async () => {
    const [t1, t2] = tills as [Till, Till];
    for (const t of tills) await t.pos.openCashSession('300');
    const sell = async (t: Till, qty: string, pay: Parameters<PosCore['finalize']>[1]) => {
      const order = await t.pos.openOrder();
      await t.pos.addItem(order, variantId, qty);
      return t.pos.finalize(order, pay);
    };
    const [a, b] = await Promise.all([
      sell(t1, '2', [{ paymentMethodId: cashId, tendered: '200' }]),
      sell(t2, '1', [{ paymentMethodId: cashId, tendered: '60' }]),
    ]);
    firstSaleId = a.invoiceId;
    expect([a.number, b.number]).toEqual(['B1-T1-000001', 'B1-T2-000001']);
    await sell(t1, '1', [{ paymentMethodId: cardId }]);

    // Cashier alone cannot refund; the manager's PIN approval travels with the refund.
    await expect(t1.pos.approve('sales.refund', 'K7', '4711')).rejects.toMatchObject({
      code: 'approval_not_permitted',
    });
    const refund = await t1.pos.refund(a.invoiceId, [{ lineNo: 1, qty: '1' }], {
      reason: 'Wrong order',
      approval: await t1.pos.approve('sales.refund', 'G7', '8080'),
      paymentMethodId: cashId,
    });
    expect(refund.total).toBe('60.00');
    await t1.pos.cashMovement('pay_out', '25', 'Ice delivery', await t1.pos.approve('pos.cash_movement', 'G7', '8080'));

    // Till 1: 300 float + 120 cash sale − 60 refund − 25 pay-out = 335 expected; 330 counted (short 5).
    expect(await t1.pos.closeCashSession('330')).toEqual({ expectedCash: '335.00', variance: '-5.00' });
    expect((await t1.offline.push()).state).toBe('offline');
    expect((await t2.offline.push()).state).toBe('offline');
  });

  it('syncs both tills: every operation accepted exactly once, cash variance and refund posted', async () => {
    const [r1, r2] = await Promise.all(tills.map((t) => t.online.push()));
    // Till 1: session open, cash sale, card sale, refund, pay-out, session close.
    expect(r1).toMatchObject({ state: 'idle', sent: 6, acked: 6, rejected: 0 });
    expect(r2).toMatchObject({ state: 'idle', sent: 2, acked: 2, rejected: 0 });

    const session = await owner.cashSession.findFirstOrThrow({
      where: { tenantId: fx.tenantB.id, status: 'closed', countedCash: 330 },
    });
    expect(session).toMatchObject({ status: 'closed' });
    expect(session.expectedCash?.toFixed(2)).toBe('335.00');
    expect(session.deviceExpectedCash?.toFixed(2)).toBe('335.00');
    expect(session.variance?.toFixed(2)).toBe('-5.00');
    const variance = await owner.journalEntry.findUniqueOrThrow({
      where: { id: session.journalEntryId! },
      include: { lines: true },
    });
    const codes = await owner.account.findMany({ where: { tenantId: fx.tenantB.id } });
    const code = (id: string) => codes.find((a) => a.id === id)!.code;
    expect(variance.lines.map((l) => [code(l.accountId), l.debit.toFixed(2), l.credit.toFixed(2)])).toEqual([
      ['5900', '5.00', '0.00'],
      ['1110', '0.00', '5.00'],
    ]);

    const invoice = await ownerB.agent.get(`/api/v1/sales/invoices/${firstSaleId}`).expect(200);
    expect(invoice.body).toMatchObject({ status: 'partially_refunded', refundedTotal: '60', employeeId: cashierId });
    const refund = await owner.refund.findFirstOrThrow({ where: { invoiceId: firstSaleId }, include: { lines: true } });
    expect(refund.total.toFixed(2)).toBe('60.00');
    const approval = await owner.approval.findUniqueOrThrow({ where: { id: refund.approvalId } });
    expect(approval).toMatchObject({ action: 'sales.refund', authorised: true });

    const tb = await ownerB.agent.get('/api/v1/accounting/trial-balance').expect(200);
    expect(tb.body.balanced).toBe(true);
    for (const t of tills) expect((await t.pos.leaseStatus()).valid).toBe(true); // renewed by the push
  });

  it('removing an employee from the branch removes their PIN from the tills on the next pull', async () => {
    const employees = (await ownerB.agent.get('/api/v1/employees').expect(200)).body as {
      id: string;
      employeeNo: string;
      rowVersion: number;
    }[];
    const k7 = employees.find((e) => e.employeeNo === 'K7')!;
    const other = await call(ownerB, 'POST', '/api/v1/branches')
      .send({ code: 'B9', nameAr: 'فرع ٩', nameEn: 'Branch 9' })
      .expect(201);
    await call(ownerB, 'PATCH', `/api/v1/employees/${k7.id}`)
      .send({ branchIds: [other.body.id], rowVersion: k7.rowVersion })
      .expect(200);
    const t = tills[0]!;
    await t.online.pull();
    t.pos.logout();
    await expect(t.pos.login('K7', '4711')).rejects.toMatchObject({ code: 'invalid_pin' });
  });
});
