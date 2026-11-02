import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeSqliteDriver } from './node';
import { migrate } from './schema';
import { IDS, seedPos, TEST_PIN } from './test-support';

const ROUNDS = 25;
const child = resolve(__dirname, '../crash/child.cjs');

/** Runs the worker until it has started selling, then kills it hard after a random delay. */
function runAndKill(dbPath: string, afterMs: number): Promise<void> {
  return new Promise((done, fail) => {
    const proc = spawn(process.execPath, ['--no-warnings', child, dbPath, TEST_PIN, IDS.cash], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.stdout.on('data', (d) => {
      if (String(d).includes('ready')) setTimeout(() => proc.kill('SIGKILL'), afterMs);
    });
    proc.on('exit', (code, signal) =>
      signal || code === null ? done() : fail(new Error(`worker exited ${code}: ${stderr}`)),
    );
  });
}

/**
 * P4-6: kill the POS process at random points while it is selling, many times, against one database file.
 * After every kill the database must be intact and every committed sale complete — never partial, never
 * duplicated, sequences gap-free.
 */
describe('crash recovery (fault injection)', () => {
  it(`survives ${ROUNDS} hard kills during sales with every invariant intact`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ros-crash-'));
    const dbPath = join(dir, 'pos.db');
    const setup = new NodeSqliteDriver(dbPath);
    await migrate(setup);
    await seedPos(setup, { leaseValidUntil: new Date(Date.now() + 86_400_000).toISOString() });
    await setup.close();

    let lastInvoices = 0;
    for (let round = 0; round < ROUNDS; round++) {
      await runAndKill(dbPath, 20 + Math.floor(Math.random() * 180));

      const db = new NodeSqliteDriver(dbPath);
      const q = async <T>(sql: string) => (await db.all<T>(sql))[0]!;
      expect((await q<{ integrity_check: string }>('PRAGMA integrity_check')).integrity_check).toBe('ok');
      const invoices = (await q<{ n: number }>('SELECT count(*) AS n FROM invoices')).n;
      // Every closed order has exactly one invoice and vice versa.
      expect((await q<{ n: number }>("SELECT count(*) AS n FROM orders WHERE status = 'closed'")).n).toBe(invoices);
      expect(
        (
          await q<{ n: number }>(
            "SELECT count(*) AS n FROM invoices i LEFT JOIN orders o ON o.id = i.order_id WHERE o.status IS NOT 'closed'",
          )
        ).n,
      ).toBe(0);
      // Every invoice has exactly one outbox operation and fully covering payments.
      expect(
        (await q<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE operation_type = 'sale.finalized'")).n,
      ).toBe(invoices);
      expect(
        (
          await q<{ n: number }>(
            `SELECT count(*) AS n FROM invoices i WHERE (SELECT count(*) FROM outbox o WHERE json_extract(o.envelope, '$.payload.invoice.id') = i.id) <> 1
             OR abs((SELECT sum(CAST(amount AS REAL)) FROM payments p WHERE p.invoice_id = i.id) - CAST(i.total AS REAL)) > 0.001`,
          )
        ).n,
      ).toBe(0);
      // Sequences are gap-free and match what was committed.
      const seq = (doc: string) =>
        q<{ next_value: number }>(`SELECT next_value FROM sequences WHERE doc_type = '${doc}'`);
      expect((await seq('invoice')).next_value - 1).toBe(invoices);
      const outbox = await q<{ n: number; max: number | null }>(
        'SELECT count(*) AS n, max(local_seq) AS max FROM outbox',
      );
      expect((await seq('outbox')).next_value - 1).toBe(outbox.n);
      expect(outbox.max ?? 0).toBe(outbox.n);
      expect(invoices).toBeGreaterThanOrEqual(lastInvoices); // committed sales are never lost
      lastInvoices = invoices;
      await db.close();
    }
    expect(lastInvoices).toBeGreaterThan(0);
  }, 180_000);
});
