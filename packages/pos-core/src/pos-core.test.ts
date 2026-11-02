import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BatchGuardError, type SqlDriver, type Statement } from './driver';
import { FilePrinter, NodeSqliteDriver } from './node';
import { migrate, LOCAL_SCHEMA_VERSION, MIGRATIONS } from './schema';
import { PosCore, PosError } from './pos';
import { backoffDelay } from './sync-client';
import type { Printer } from './receipt';
import { IDS, NOW, seedPos, TEST_PIN } from './test-support';

/** Wraps a driver and makes matching batches fail mid-way (after half of their statements ran). */
class FailingDriver implements SqlDriver {
  failWhen: ((statements: Statement[]) => boolean) | null = null;
  constructor(private readonly inner: SqlDriver) {}
  all<T>(sql: string, params?: (string | number | null)[]) {
    return this.inner.all<T>(sql, params);
  }
  async batch(statements: Statement[]) {
    if (this.failWhen?.(statements)) {
      this.failWhen = null;
      return this.inner.batch([
        ...statements.slice(0, Math.ceil(statements.length / 2)),
        { sql: 'INSERT INTO no_such_table VALUES (1)' },
      ]);
    }
    return this.inner.batch(statements);
  }
  close() {
    return this.inner.close();
  }
}

describe('POS core', () => {
  let dir: string;
  let path: string;
  let db: FailingDriver;
  let printer: FilePrinter;
  let pos: PosCore;
  let clock = NOW;

  const open = async () => {
    db = new FailingDriver(new NodeSqliteDriver(path));
    await migrate(db);
    pos = new PosCore(db, printer, () => clock);
  };
  /** Signed-in cashier with an open drawer (500.00 float): the normal state for selling. */
  const ready = async () => {
    await pos.login('C1', TEST_PIN);
    await pos.openCashSession('500');
  };
  const sell = async (
    qty = '1',
    payments = [{ paymentMethodId: IDS.cash, tendered: '57' }] as Parameters<PosCore['finalize']>[1],
  ) => {
    const order = await pos.openOrder();
    await pos.addItem(order, IDS.variant, qty);
    return pos.finalize(order, payments);
  };
  const count = async (table: string) => (await db.all<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0]!.n;

  beforeEach(async () => {
    clock = NOW;
    dir = mkdtempSync(join(tmpdir(), 'ros-pos-'));
    path = join(dir, 'pos.db');
    printer = new FilePrinter(join(dir, 'printer'));
    await open();
    await seedPos(db);
  });
  afterEach(async () => db.close());

  it('migrates idempotently and refuses a newer schema', async () => {
    expect(await migrate(db)).toBe(LOCAL_SCHEMA_VERSION);
    await db.batch([{ sql: `PRAGMA user_version = ${LOCAL_SCHEMA_VERSION + 1}` }]);
    await expect(migrate(db)).rejects.toThrow(/newer than this app/);
    await db.batch([{ sql: `PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}` }]);
  });

  it('sells offline: totals, change, receipt and one outbox operation in one commit', async () => {
    await ready();
    const order = await pos.openOrder('takeaway');
    await pos.addItem(order, IDS.variant, '2');
    expect(await pos.quote(order)).toMatchObject({ subtotal: '100.00', taxTotal: '14.00', total: '114.00' });
    const result = await pos.finalize(order, [{ paymentMethodId: IDS.cash, tendered: '200' }]);
    expect(result).toMatchObject({ number: 'NC1-D2-000001', total: '114.00', changeGiven: '86.00', printed: true });

    const ops = (await db.all<{ envelope: string }>('SELECT envelope FROM outbox ORDER BY local_seq')).map((r) =>
      JSON.parse(r.envelope),
    );
    expect(ops.map((o) => o.operation_type)).toEqual(['cash_session.opened', 'sale.finalized']);
    const sale = ops[1];
    expect(sale).toMatchObject({ schema_version: 3, local_seq: 2, depends_on: [ops[0].operation_id] });
    expect(sale.payload).toMatchObject({ employeeId: IDS.cashier, cashSessionId: ops[0].payload.id });
    expect(sale.payload.payments[0]).toMatchObject({ amount: '114.00', tendered: '200.00', changeGiven: '86.00' });

    const printed = readdirSync(join(dir, 'printer')).filter((f) => f.endsWith('.txt'));
    const text = readFileSync(join(dir, 'printer', printed[0]!), 'utf8');
    expect(text).toMatch(/TOTAL EGP\s+114\.00/);
    expect(text).toMatch(/Change\s+86\.00/);
    await expect(pos.addItem(order, IDS.variant)).rejects.toMatchObject({ code: 'order_closed' });
  });

  it('adds a repeat tap to the open line, but starts a new line for other options, sent or discounted lines', async () => {
    await ready();
    const order = await pos.openOrder('takeaway');
    expect(await pos.addItem(order, IDS.variant)).toBe(1);
    expect(await pos.addItem(order, IDS.variant, '1.5')).toBe(1);
    expect(await pos.addItem(order, IDS.variant, '1', { modifierIds: [IDS.large] })).toBe(2);
    expect(await pos.addItem(order, IDS.variant, '1', { modifierIds: [IDS.large] })).toBe(2);
    await pos.setLineDiscount(order, 2, { kind: 'percent', value: '0.1' }, null);
    expect(await pos.addItem(order, IDS.variant, '1', { modifierIds: [IDS.large] })).toBe(3);
    await pos.sendToKitchen(order);
    expect(await pos.addItem(order, IDS.variant)).toBe(4);
    expect((await pos.order(order)).lines.map((l) => [l.lineNo, l.qty, l.status])).toEqual([
      [1, '2.5', 'sent'],
      [2, '2', 'sent'],
      [3, '1', 'sent'],
      [4, '1', 'pending'],
    ]);
  });

  it('prints an Arabic receipt in branch local time when asked to', async () => {
    pos = new PosCore(db, printer, () => clock, { receiptLocale: 'ar' });
    await ready();
    const { receipt } = await sell();
    expect(receipt).toContain('كشري');
    expect(receipt).toMatch(/الإجمالي EGP\s+57\.00/);
    // 10:00 UTC on 30 Oct 2026 is 12:00 in Cairo (summer time ended on 29 Oct).
    expect(receipt).toMatch(/التاريخ\s+2026-10-30 12:00/);
    expect(receipt).not.toContain('UTC');
  });

  it('numbers receipts sequentially and refuses incomplete or non-cash over-payment', async () => {
    await ready();
    const a = await pos.openOrder();
    await pos.addItem(a, IDS.variant);
    await expect(pos.finalize(a, [{ paymentMethodId: IDS.cash, tendered: '10' }])).rejects.toMatchObject({
      code: 'payment_incomplete',
    });
    await expect(pos.finalize(a, [{ paymentMethodId: IDS.card, amount: '100' }])).rejects.toMatchObject({
      code: 'overpayment',
    });
    await pos.finalize(a, [
      { paymentMethodId: IDS.card, amount: '20' },
      { paymentMethodId: IDS.cash, tendered: '50' },
    ]);
    expect((await sell('1', [{ paymentMethodId: IDS.card }])).number).toBe('NC1-D2-000002');
  });

  it('a failure inside the finalize batch leaves no partial sale (atomicity)', async () => {
    await ready();
    const order = await pos.openOrder();
    await pos.addItem(order, IDS.variant);
    const outboxBefore = await count('outbox');
    db.failWhen = (stmts) => stmts.some((s) => s.sql.startsWith('INSERT INTO invoices'));
    await expect(pos.finalize(order, [{ paymentMethodId: IDS.cash, tendered: '57' }])).rejects.toThrow(/no such table/);
    for (const table of ['invoices', 'payments', 'print_jobs']) expect(await count(table)).toBe(0);
    expect(await count('outbox')).toBe(outboxBefore);
    expect((await db.all<{ status: string }>('SELECT status FROM orders WHERE id = ?', [order]))[0]!.status).toBe(
      'open',
    );
    expect(
      (await db.all<{ next_value: number }>("SELECT next_value FROM sequences WHERE doc_type = 'invoice'"))[0]!
        .next_value,
    ).toBe(1);
    expect((await pos.finalize(order, [{ paymentMethodId: IDS.cash, tendered: '57' }])).number).toBe('NC1-D2-000001');
  });

  it('a consumed sequence number makes the batch roll back instead of reusing it', async () => {
    const guarded = new NodeSqliteDriver(join(dir, 'other.db'));
    await migrate(guarded);
    await expect(
      guarded.batch([
        { sql: "UPDATE sequences SET next_value = 9 WHERE doc_type = 'invoice' AND next_value = 5", expectChanges: 1 },
      ]),
    ).rejects.toBeInstanceOf(BatchGuardError);
    await guarded.close();
  });

  it('keeps sales and pending operations across a restart, and reprints unprinted receipts', async () => {
    const failing: Printer = { print: async () => Promise.reject(new Error('paper out')) };
    pos = new PosCore(db, failing, () => clock);
    await ready();
    expect((await sell()).printed).toBe(false); // the sale is complete even though printing failed
    await db.close();
    await open(); // "restart"
    expect(await pos.recoverPrintJobs()).toBe(1);
    expect((await pos.history()).map((h) => [h.number, h.sync_status])).toEqual([['NC1-D2-000001', 'pending']]);
  });

  it('finalized invoices, refunds and unsynced operations cannot be altered locally', async () => {
    await ready();
    await sell();
    await expect(db.batch([{ sql: "UPDATE invoices SET total = '1'" }])).rejects.toThrow(/immutable/);
    await expect(db.batch([{ sql: 'DELETE FROM outbox' }])).rejects.toThrow(/cannot be deleted/);
    await expect(db.batch([{ sql: "UPDATE outbox SET envelope = '{}'" }])).rejects.toThrow(/immutable/);
  });

  describe('operators and approvals', () => {
    it('requires a signed-in employee with the right permission', async () => {
      const order = await pos.openOrder();
      await pos.addItem(order, IDS.variant);
      await expect(pos.finalize(order, [{ paymentMethodId: IDS.card }])).rejects.toMatchObject({
        code: 'not_signed_in',
      });
      await pos.login('C1', TEST_PIN);
      expect(pos.currentOperator()).toMatchObject({ employeeId: IDS.cashier });
      expect(pos.currentOperator()!.permissions).not.toContain('sales.refund');
      await expect(pos.finalize(order, [{ paymentMethodId: IDS.cash, tendered: '57' }])).rejects.toMatchObject({
        code: 'no_cash_session',
      });
      expect((await pos.finalize(order, [{ paymentMethodId: IDS.card }])).number).toBe('NC1-D2-000001'); // card needs no drawer
    });

    it('locks an employee out after five wrong PINs, persisting across restarts', async () => {
      for (let i = 0; i < 5; i++) await expect(pos.login('C1', '0000')).rejects.toMatchObject({ code: 'invalid_pin' });
      await db.close();
      await open();
      await expect(pos.login('C1', TEST_PIN)).rejects.toMatchObject({ code: 'pin_locked' });
      clock = new Date(Date.parse(NOW) + 6 * 60_000).toISOString();
      await expect(pos.login('C1', TEST_PIN)).resolves.toMatchObject({ employeeNo: 'C1' });
    });

    it('only an employee holding the permission can approve', async () => {
      await expect(pos.approve('sales.refund', 'C1', TEST_PIN)).rejects.toMatchObject({
        code: 'approval_not_permitted',
      });
      await expect(pos.approve('sales.refund', 'M1', '9999')).rejects.toMatchObject({ code: 'invalid_pin' });
      expect(await pos.approve('sales.refund', 'M1', TEST_PIN)).toMatchObject({
        action: 'sales.refund',
        approverEmployeeId: IDS.manager,
      });
    });
  });

  describe('cash drawer', () => {
    it('tracks expected cash through sales, pay-outs and refunds, and closes with a variance', async () => {
      await ready();
      await expect(pos.openCashSession('100')).rejects.toMatchObject({ code: 'session_open' });
      await sell('2', [{ paymentMethodId: IDS.cash, tendered: '200' }]); // +114.00
      await sell('1', [{ paymentMethodId: IDS.card }]); // card: not in the drawer
      await expect(pos.cashMovement('pay_out', '50', 'Supplier')).rejects.toMatchObject({ code: 'approval_required' });
      await pos.cashMovement('pay_out', '50', 'Supplier', await pos.approve('pos.cash_movement', 'M1', TEST_PIN));
      await expect(
        pos.cashMovement('pay_out', '9999', 'Too much', await pos.approve('pos.cash_movement', 'M1', TEST_PIN)),
      ).rejects.toMatchObject({ code: 'insufficient_cash' });
      expect(await pos.sessionSummary()).toMatchObject({
        openingFloat: '500.00',
        cashSales: '114.00',
        payOuts: '50.00',
        expectedCash: '564.00',
      });

      const closed = await pos.closeCashSession('560');
      expect(closed).toEqual({ expectedCash: '564.00', variance: '-4.00' });
      const ops = (await db.all<{ envelope: string }>('SELECT envelope FROM outbox ORDER BY local_seq')).map((r) =>
        JSON.parse(r.envelope),
      );
      expect(ops.map((o) => o.operation_type)).toEqual([
        'cash_session.opened',
        'sale.finalized',
        'sale.finalized',
        'cash_movement.recorded',
        'cash_session.closed',
      ]);
      expect(ops[4].payload).toMatchObject({ countedCash: '560.00', expectedCash: '564.00' });
      await expect(sell()).rejects.toMatchObject({ code: 'no_cash_session' });
    });
  });

  describe('refunds', () => {
    it('refunds with approval, caps quantities and splits amounts exactly', async () => {
      await ready();
      const sale = await sell('3', [{ paymentMethodId: IDS.cash, tendered: '171' }]); // 3 × 57.00 = 171.00
      const approval = () => pos.approve('sales.refund', 'M1', TEST_PIN);
      const first = await pos.refund(sale.invoiceId, [{ lineNo: 1, qty: '1' }], {
        reason: 'Cold',
        approval: await approval(),
        paymentMethodId: IDS.cash,
      });
      expect(first).toMatchObject({ number: 'NC1-D2-R00001', total: '57.00', printed: true });
      await pos.refund(sale.invoiceId, [{ lineNo: 1, qty: '2' }], {
        reason: 'Cold',
        approval: await approval(),
        paymentMethodId: IDS.cash,
      });
      await expect(
        pos.refund(sale.invoiceId, [{ lineNo: 1, qty: '1' }], {
          reason: 'Again',
          approval: await approval(),
          paymentMethodId: IDS.cash,
        }),
      ).rejects.toMatchObject({ code: 'refund_exceeds_sale' });

      const lines = await db.all<{ net_amount: string; tax_amount: string }>(
        'SELECT net_amount, tax_amount FROM refund_lines',
      );
      const sum = (k: 'net_amount' | 'tax_amount') => lines.reduce((s, l) => s + Math.round(Number(l[k]) * 100), 0);
      expect([sum('net_amount'), sum('tax_amount')]).toEqual([15000, 2100]); // exactly the sale's 150.00 + 21.00
      expect((await pos.sessionSummary()).cashRefunds).toBe('171.00');

      const refundOp = JSON.parse(
        (
          await db.all<{ envelope: string }>(
            "SELECT envelope FROM outbox WHERE operation_type = 'refund.issued' LIMIT 1",
          )
        )[0]!.envelope,
      );
      const saleOp = (
        await db.all<{ operation_id: string }>(
          "SELECT operation_id FROM outbox WHERE operation_type = 'sale.finalized'",
        )
      )[0]!;
      expect(refundOp.depends_on).toEqual([saleOp.operation_id]);
      await expect(
        pos.refund(sale.invoiceId, [{ lineNo: 1, qty: '1' }], {
          reason: 'x',
          approval: { ...(await approval()), action: 'pos.discount' },
          paymentMethodId: IDS.cash,
        }),
      ).rejects.toMatchObject({ code: 'approval_required' });
    });
  });

  describe('licence lease', () => {
    it('refuses new sales once the lease has expired, but keeps everything recorded', async () => {
      await ready();
      await sell();
      clock = '2026-11-07T00:00:00.000Z'; // lease valid until 2026-11-06T10:00Z
      expect(await pos.leaseStatus()).toEqual({ valid: false, validUntil: '2026-11-06T10:00:00.000Z' });
      await expect(sell()).rejects.toMatchObject({ code: 'lease_expired' });
      expect(await count('invoices')).toBe(1);
      expect(JSON.parse(await pos.exportPending()).operations).toHaveLength(2);
    });

    it('rejects a lease with a forged signature', async () => {
      const value = JSON.parse(
        (await db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'lease.value'"))[0]!.value,
      );
      const tampered = {
        ...value,
        payload: Buffer.from(JSON.stringify({ device_id: IDS.device, valid_until: '2099-01-01T00:00:00Z' })).toString(
          'base64url',
        ),
      };
      await db.batch([
        { sql: "UPDATE meta SET value = ? WHERE key = 'lease.value'", params: [JSON.stringify(tampered)] },
      ]);
      expect((await pos.leaseStatus()).valid).toBe(false);
    });
  });

  it('upgrades a v1 database with unsynced operations without losing them (P4-11)', async () => {
    const legacyPath = join(dir, 'legacy.db');
    const raw = new DatabaseSync(legacyPath);
    raw.exec('BEGIN');
    for (const sql of MIGRATIONS[0]!) raw.exec(sql);
    raw.exec('PRAGMA user_version = 1');
    raw.exec(
      `INSERT INTO outbox (local_seq, operation_id, operation_type, envelope, created_at) VALUES
       (1, 'op-1', 'sale.finalized', '{"operation_id":"op-1","schema_version":1}', '${NOW}'),
       (2, 'op-2', 'sale.finalized', '{"operation_id":"op-2","schema_version":1}', '${NOW}')`,
    );
    raw.exec('COMMIT');
    raw.close();

    const upgraded = new NodeSqliteDriver(legacyPath);
    expect(await migrate(upgraded)).toBe(LOCAL_SCHEMA_VERSION);
    const ops = await upgraded.all<{ operation_id: string; status: string; envelope: string }>(
      'SELECT operation_id, status, envelope FROM outbox ORDER BY local_seq',
    );
    expect(ops).toEqual([
      { operation_id: 'op-1', status: 'pending', envelope: '{"operation_id":"op-1","schema_version":1}' },
      { operation_id: 'op-2', status: 'pending', envelope: '{"operation_id":"op-2","schema_version":1}' },
    ]);
    expect((await upgraded.all<{ integrity_check: string }>('PRAGMA integrity_check'))[0]!.integrity_check).toBe('ok');
    await upgraded.close();
  });

  it('refuses to sell before pairing', async () => {
    await db.batch([{ sql: "DELETE FROM meta WHERE key LIKE 'device.%'" }]);
    await expect(pos.openOrder().then((o) => pos.addItem(o, IDS.variant))).rejects.toBeInstanceOf(PosError);
  });
});

describe('backoffDelay', () => {
  it('uses full jitter with an exponential cap', () => {
    expect(backoffDelay(0, () => 0.999)).toBeLessThan(2000);
    expect(backoffDelay(3, () => 0.5)).toBe(8000);
    expect(backoffDelay(30, () => 0.999)).toBeLessThan(300_000);
    expect(backoffDelay(5, () => 0)).toBe(0);
  });
});
