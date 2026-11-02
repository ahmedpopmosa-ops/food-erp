import type { SqlDriver, Statement } from './driver';

/**
 * Local schema migrations, applied in order inside one transaction each together with
 * `PRAGMA user_version` (docs/02 §6). Never edit a released migration — append a new one.
 */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE ref_entities (
       entity_type TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
       PRIMARY KEY (entity_type, id))`,
    `CREATE TABLE sequences (doc_type TEXT PRIMARY KEY, next_value INTEGER NOT NULL CHECK (next_value >= 1))`,
    `INSERT INTO sequences (doc_type, next_value) VALUES ('invoice', 1), ('order', 1), ('outbox', 1)`,
    `CREATE TABLE orders (
       id TEXT PRIMARY KEY, local_number TEXT UNIQUE, channel TEXT NOT NULL,
       status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'cancelled')),
       opened_at TEXT NOT NULL, closed_at TEXT)`,
    `CREATE TABLE order_items (
       id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders (id), line_no INTEGER NOT NULL,
       variant_id TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, qty TEXT NOT NULL,
       unit_price TEXT NOT NULL, tax_category_id TEXT NOT NULL, UNIQUE (order_id, line_no))`,
    `CREATE TABLE invoices (
       id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders (id), number TEXT NOT NULL UNIQUE,
       issued_at TEXT NOT NULL, total TEXT NOT NULL, change_given TEXT, payload TEXT NOT NULL)`,
    `CREATE TABLE payments (
       id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices (id), payment_method_id TEXT NOT NULL,
       amount TEXT NOT NULL, tendered TEXT, change_given TEXT)`,
    `CREATE TABLE outbox (
       local_seq INTEGER PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, operation_type TEXT NOT NULL,
       envelope TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acked', 'rejected', 'blocked')),
       attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error TEXT, server_refs TEXT,
       created_at TEXT NOT NULL)`,
    `CREATE TABLE print_jobs (
       id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices (id), kind TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printed', 'failed')),
       attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL)`,
    // Finalized documents are immutable locally too.
    `CREATE TRIGGER invoices_immutable BEFORE UPDATE ON invoices BEGIN SELECT RAISE(ABORT, 'invoices are immutable'); END`,
    `CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices BEGIN SELECT RAISE(ABORT, 'invoices cannot be deleted'); END`,
    `CREATE TRIGGER payments_immutable BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT, 'payments are immutable'); END`,
    `CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT, 'payments cannot be deleted'); END`,
    `CREATE TRIGGER outbox_envelope_immutable BEFORE UPDATE OF envelope, operation_id ON outbox
       BEGIN SELECT RAISE(ABORT, 'outbox operations are immutable'); END`,
    `CREATE TRIGGER outbox_no_delete BEFORE DELETE ON outbox WHEN OLD.status <> 'acked'
       BEGIN SELECT RAISE(ABORT, 'unsynced operations cannot be deleted'); END`,
  ],
  // v2 (Phase 4a): cash drawer sessions, refunds; payments carry their cash session.
  [
    `CREATE TABLE cash_sessions (
       id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
       opened_at TEXT NOT NULL, opening_float TEXT NOT NULL, closed_at TEXT, counted_cash TEXT, expected_cash TEXT,
       open_operation_id TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX cash_sessions_one_open ON cash_sessions (status) WHERE status = 'open'`,
    `CREATE TABLE cash_movements (
       id TEXT PRIMARY KEY, cash_session_id TEXT NOT NULL REFERENCES cash_sessions (id),
       kind TEXT NOT NULL CHECK (kind IN ('pay_in', 'pay_out')), amount TEXT NOT NULL, reason TEXT NOT NULL,
       occurred_at TEXT NOT NULL)`,
    `CREATE TABLE refunds (
       id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices (id), number TEXT NOT NULL UNIQUE,
       issued_at TEXT NOT NULL, total TEXT NOT NULL, cash_session_id TEXT, payload TEXT NOT NULL)`,
    `CREATE TABLE refund_lines (
       id TEXT PRIMARY KEY, refund_id TEXT NOT NULL REFERENCES refunds (id), invoice_line_id TEXT NOT NULL,
       qty TEXT NOT NULL, net_amount TEXT NOT NULL, tax_amount TEXT NOT NULL, taxes TEXT NOT NULL)`,
    `ALTER TABLE payments ADD COLUMN cash_session_id TEXT`,
    `INSERT INTO sequences (doc_type, next_value) VALUES ('refund', 1)`,
    `CREATE TRIGGER refunds_immutable BEFORE UPDATE ON refunds BEGIN SELECT RAISE(ABORT, 'refunds are immutable'); END`,
    `CREATE TRIGGER refunds_no_delete BEFORE DELETE ON refunds BEGIN SELECT RAISE(ABORT, 'refunds cannot be deleted'); END`,
    `CREATE TRIGGER cash_movements_immutable BEFORE UPDATE ON cash_movements BEGIN SELECT RAISE(ABORT, 'cash movements are immutable'); END`,
  ],
  // v3 (Phase 4b): tables, discounts, approvals on orders; modifiers, kitchen status and voids on items.
  [
    `ALTER TABLE orders ADD COLUMN table_id TEXT`,
    `ALTER TABLE orders ADD COLUMN guests INTEGER`,
    `ALTER TABLE orders ADD COLUMN discount TEXT`,
    `ALTER TABLE orders ADD COLUMN discount_reason TEXT`,
    `ALTER TABLE orders ADD COLUMN approvals TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE orders ADD COLUMN merged_into TEXT`,
    `ALTER TABLE orders ADD COLUMN cancel_reason TEXT`,
    `ALTER TABLE order_items ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE order_items ADD COLUMN modifiers TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE order_items ADD COLUMN discount TEXT`,
    `ALTER TABLE order_items ADD COLUMN void_reason TEXT`,
    `ALTER TABLE order_items ADD COLUMN void_approval TEXT`,
    `CREATE INDEX orders_open_by_table ON orders (table_id) WHERE status = 'open'`,
  ],
];

export const LOCAL_SCHEMA_VERSION = MIGRATIONS.length;

/** Brings the local database to the current schema version. Safe to call on every start. */
export async function migrate(driver: SqlDriver): Promise<number> {
  const [{ user_version: current } = { user_version: 0 }] = await driver.all<{ user_version: number }>(
    'PRAGMA user_version',
  );
  if (current > LOCAL_SCHEMA_VERSION) {
    throw new Error(
      `Local database schema ${current} is newer than this app (${LOCAL_SCHEMA_VERSION}); refusing to start`,
    );
  }
  for (let v = current; v < LOCAL_SCHEMA_VERSION; v++) {
    const statements: Statement[] = MIGRATIONS[v]!.map((sql) => ({ sql }));
    statements.push({ sql: `PRAGMA user_version = ${v + 1}` });
    await driver.batch(statements);
  }
  return LOCAL_SCHEMA_VERSION;
}
