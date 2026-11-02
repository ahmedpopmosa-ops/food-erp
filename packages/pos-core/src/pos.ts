import type {
  Approval,
  LicenseLease,
  RefundIssuedV1,
  SaleFinalizedV1,
  SaleFinalizedV3,
  SyncOperation,
} from '@ros/contracts';
import {
  childId,
  computeOrderTotals,
  Money,
  refundLineAmounts,
  selectPrice,
  uuidv7,
  verifyPin,
  type Channel,
  type DiscountSpec,
  type OrderTotals,
} from '@ros/domain';
import { one, type SqlDriver, type SqlValue, type Statement } from './driver';
import { normaliseRate, ReferenceStore } from './catalog';
import { renderReceipt, toEscPos, type Printer, type ReceiptLocale } from './receipt';
import { verifyLease } from './lease';

export interface Operator {
  employeeId: string;
  employeeNo: string;
  name: string;
  permissions: string[];
}

export interface CashSessionSummary {
  id: string;
  openedAt: string;
  openingFloat: string;
  cashSales: string;
  cashRefunds: string;
  payIns: string;
  payOuts: string;
  expectedCash: string;
}

const PIN_LOCKOUT_FAILURES = 5;
const PIN_LOCKOUT_MS = 5 * 60_000;

export interface DeviceIdentity {
  tenantId: string;
  branchId: string;
  deviceId: string;
  branchCode: string;
  deviceCode: string;
}

export interface SellableItem {
  variantId: string;
  productId: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  price: string;
  taxCategoryId: string;
  modifierGroups: {
    id: string;
    nameAr: string;
    nameEn: string;
    minSelect: number;
    maxSelect: number;
    modifiers: { id: string; nameAr: string; nameEn: string; priceDelta: string }[];
  }[];
}

export interface PaymentInput {
  paymentMethodId: string;
  /** Cash handed over (cash only); change is computed. */
  tendered?: string;
  /** Amount applied for non-cash methods; defaults to the remaining balance. */
  amount?: string;
}

export class PosError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface FinalizeResult {
  invoiceId: string;
  number: string;
  total: string;
  changeGiven: string;
  receipt: string;
  printed: boolean;
  operationId: string;
}

const now = () => new Date().toISOString();

/** Quantities have at most 6 decimals: summed exactly as integer millionths. */
const toMicro = (q: string) => {
  const [w, f = ''] = q.split('.');
  return BigInt(w!) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6));
};
const fromMicro = (m: bigint) => {
  const frac = String(m % 1_000_000n)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return `${m / 1_000_000n}${frac ? `.${frac}` : ''}`;
};

/**
 * Selling on the device. Everything a sale needs is local: pulled reference data, the order in SQLite, and
 * one atomic batch that writes the invoice, payments, outbox operation and print job together. The sale is
 * complete when that batch commits — printing and sync happen afterwards from the committed record.
 */
export class PosCore {
  readonly refs: ReferenceStore;
  private queue: Promise<unknown> = Promise.resolve();
  private operator: Operator | null = null;

  constructor(
    private readonly db: SqlDriver,
    private readonly printer: Printer,
    private readonly clock: () => string = now,
    private readonly opts: { receiptLocale?: ReceiptLocale } = {},
  ) {
    this.refs = new ReferenceStore(db);
  }

  /** Serialises writers in this process (sequence guards also protect against any other writer). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async identity(): Promise<DeviceIdentity> {
    const rows = await this.db.all<{ key: string; value: string }>(
      "SELECT key, value FROM meta WHERE key LIKE 'device.%'",
    );
    const m = Object.fromEntries(rows.map((r) => [r.key.slice(7), r.value]));
    if (!m.deviceId) throw new PosError('not_paired', 'This POS is not paired with a branch yet');
    return m as unknown as DeviceIdentity;
  }

  // ── Operators & approvals ──────────────────────────────────────────────────

  /**
   * Signs an employee in with their PIN, verified offline against the pulled hash. Five wrong PINs lock that
   * employee out on this device for five minutes (the lock survives restarts: it is stored locally).
   */
  async login(employeeNo: string, pin: string): Promise<Operator> {
    const op = await this.checkPin(employeeNo, pin);
    this.operator = op;
    return op;
  }

  logout() {
    this.operator = null;
  }

  currentOperator(): Operator | null {
    return this.operator;
  }

  /** A manager authorises one action with their PIN; the approval travels inside the operation it permits. */
  async approve(action: string, employeeNo: string, pin: string): Promise<Approval> {
    const approver = await this.checkPin(employeeNo, pin);
    if (!approver.permissions.includes(action))
      throw new PosError('approval_not_permitted', 'This employee cannot approve that action');
    return { id: uuidv7(), action, approverEmployeeId: approver.employeeId, occurredAt: this.clock() };
  }

  private async checkPin(employeeNo: string, pin: string): Promise<Operator> {
    const key = `lockout.${employeeNo}`;
    const lock = JSON.parse(
      (await one<{ value: string }>(this.db, 'SELECT value FROM meta WHERE key = ?', [key]))?.value ??
        '{"fails":0,"until":0}',
    ) as { fails: number; until: number };
    if (lock.until > Date.parse(this.clock()))
      throw new PosError('pin_locked', 'Too many wrong PINs; try again in a few minutes');
    const employees = await this.refs.list<{
      id: string;
      employeeNo: string;
      fullNameEn: string;
      roleId: string;
      pinHash: string;
    }>('employee');
    const e = employees.find((x) => x.employeeNo === employeeNo);
    const ok = e ? await verifyPin(pin, e.pinHash) : false;
    const save = (v: { fails: number; until: number }) =>
      this.db.batch([
        {
          sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          params: [key, JSON.stringify(v)],
        },
      ]);
    if (!e || !ok) {
      const fails = lock.fails + 1;
      await save(
        fails >= PIN_LOCKOUT_FAILURES
          ? { fails: 0, until: Date.parse(this.clock()) + PIN_LOCKOUT_MS }
          : { fails, until: 0 },
      );
      throw new PosError('invalid_pin', 'Wrong employee number or PIN');
    }
    if (lock.fails) await save({ fails: 0, until: 0 });
    const role = await this.refs.get<{ permissions: string[] }>('role', e.roleId);
    return { employeeId: e.id, employeeNo: e.employeeNo, name: e.fullNameEn, permissions: role?.permissions ?? [] };
  }

  private requireOperator(permission: string): Operator {
    if (!this.operator) throw new PosError('not_signed_in', 'An employee must sign in first');
    if (!this.operator.permissions.includes(permission)) throw new PosError('not_permitted', `Requires ${permission}`);
    return this.operator;
  }

  // ── Licence lease ──────────────────────────────────────────────────────────

  /** Whether this device may record new sales: a valid, unexpired lease signed by the server. */
  async leaseStatus(): Promise<{ valid: boolean; validUntil: string | null }> {
    const id = await this.identity();
    const rows = await this.db.all<{ key: string; value: string }>(
      "SELECT key, value FROM meta WHERE key IN ('lease.public_key', 'lease.value')",
    );
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const key = get('lease.public_key');
    const value = get('lease.value');
    if (!key || !value) return { valid: false, validUntil: null };
    const claims = await verifyLease(key, JSON.parse(value) as LicenseLease, id.deviceId);
    if (!claims) return { valid: false, validUntil: null };
    return { valid: Date.parse(claims.valid_until) > Date.parse(this.clock()), validUntil: claims.valid_until };
  }

  private async assertLease() {
    if (!(await this.leaseStatus()).valid) {
      throw new PosError(
        'lease_expired',
        'This POS has not synced for too long; connect to the internet to continue selling',
      );
    }
  }

  // ── Cash drawer ────────────────────────────────────────────────────────────

  openCashSession(openingFloat: string): Promise<string> {
    return this.exclusive(async () => {
      const op = this.requireOperator('pos.cash_session');
      await this.assertLease();
      if (await this.currentSession())
        throw new PosError('session_open', 'A cash session is already open on this device');
      const { currency } = await this.settings();
      const id = uuidv7();
      const at = this.clock();
      const float = Money.of(openingFloat, currency).round().toString(true);
      const seq = await this.peek('outbox');
      const env = await this.envelope(
        'cash_session.opened',
        1,
        seq,
        { id, employeeId: op.employeeId, openedAt: at, openingFloat: float },
        [],
      );
      await this.db.batch([
        this.bump('outbox', seq),
        {
          sql: `INSERT INTO cash_sessions (id, employee_id, status, opened_at, opening_float, open_operation_id) VALUES (?, ?, 'open', ?, ?, ?)`,
          params: [id, op.employeeId, at, float, env.operation_id],
        },
        this.outboxInsert(env),
      ]);
      return id;
    });
  }

  /** Pay-in or pay-out. Needs `pos.cash_movement`, held by the operator or given by a manager's approval. */
  cashMovement(
    kind: 'pay_in' | 'pay_out',
    amount: string,
    reason: string,
    approval: Approval | null = null,
  ): Promise<string> {
    return this.exclusive(async () => {
      const op = this.requireOperator('pos.cash_session');
      if (!op.permissions.includes('pos.cash_movement') && approval?.action !== 'pos.cash_movement') {
        throw new PosError('approval_required', 'A manager must approve this cash movement');
      }
      const session = await this.requireSession();
      const { currency } = await this.settings();
      const value = Money.of(amount, currency).round();
      if (value.compare(Money.zero(currency)) <= 0) throw new PosError('invalid_amount', 'Amount must be positive');
      if (
        kind === 'pay_out' &&
        value.compare(Money.of((await this.sessionSummary(session.id)).expectedCash, currency)) > 0
      ) {
        throw new PosError('insufficient_cash', 'The drawer does not hold that much cash');
      }
      const id = uuidv7();
      const at = this.clock();
      const seq = await this.peek('outbox');
      const env = await this.envelope(
        'cash_movement.recorded',
        1,
        seq,
        {
          id,
          cashSessionId: session.id,
          kind,
          amount: value.toString(true),
          reason,
          employeeId: op.employeeId,
          approval,
          occurredAt: at,
        },
        [session.open_operation_id],
      );
      await this.db.batch([
        this.bump('outbox', seq),
        {
          sql: 'INSERT INTO cash_movements (id, cash_session_id, kind, amount, reason, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
          params: [id, session.id, kind, value.toString(true), reason, at],
        },
        this.outboxInsert(env),
      ]);
      return id;
    });
  }

  /** Expected drawer cash = float + cash taken − cash refunded + pay-ins − pay-outs. */
  async sessionSummary(sessionId?: string): Promise<CashSessionSummary> {
    const session = sessionId
      ? await one<{ id: string; opened_at: string; opening_float: string }>(
          this.db,
          'SELECT * FROM cash_sessions WHERE id = ?',
          [sessionId],
        )
      : await this.requireSession();
    if (!session) throw new PosError('not_found', 'Cash session not found');
    const { currency } = await this.settings();
    const cashIds = (await this.refs.list<{ id: string; kind: string }>('payment_method'))
      .filter((m) => m.kind === 'cash')
      .map((m) => m.id);
    const sum = (values: { v: string }[]) =>
      Money.sum(
        values.map((r) => Money.of(r.v, currency)),
        currency,
      );
    const marks = cashIds.map(() => '?').join(',') || "''";
    const sales = sum(
      await this.db.all<{ v: string }>(
        `SELECT amount AS v FROM payments WHERE cash_session_id = ? AND payment_method_id IN (${marks})`,
        [session.id, ...cashIds],
      ),
    );
    const refunds = sum(
      (await this.db.all<{ payload: string }>('SELECT payload FROM refunds WHERE cash_session_id = ?', [session.id]))
        .map((r) => JSON.parse(r.payload) as RefundIssuedV1)
        .filter((r) => cashIds.includes(r.payment.paymentMethodId))
        .map((r) => ({ v: r.payment.amount })),
    );
    const moves = (kind: string) =>
      this.db.all<{ v: string }>('SELECT amount AS v FROM cash_movements WHERE cash_session_id = ? AND kind = ?', [
        session.id,
        kind,
      ]);
    const payIns = sum(await moves('pay_in'));
    const payOuts = sum(await moves('pay_out'));
    const expected = Money.of(session.opening_float, currency).add(sales).sub(refunds).add(payIns).sub(payOuts);
    return {
      id: session.id,
      openedAt: session.opened_at,
      openingFloat: session.opening_float,
      cashSales: sales.toString(true),
      cashRefunds: refunds.toString(true),
      payIns: payIns.toString(true),
      payOuts: payOuts.toString(true),
      expectedCash: expected.toString(true),
    };
  }

  /** Blind count: the operator enters what is in the drawer; the variance is computed and posted by the server. */
  closeCashSession(
    countedCash: string,
    breakdown: Record<string, number> = {},
  ): Promise<{ expectedCash: string; variance: string }> {
    return this.exclusive(async () => {
      const op = this.requireOperator('pos.cash_session');
      const session = await this.requireSession();
      const { currency } = await this.settings();
      const summary = await this.sessionSummary(session.id);
      const counted = Money.of(countedCash, currency).round();
      const at = this.clock();
      const seq = await this.peek('outbox');
      const env = await this.envelope(
        'cash_session.closed',
        1,
        seq,
        {
          id: session.id,
          employeeId: op.employeeId,
          closedAt: at,
          countedCash: counted.toString(true),
          expectedCash: summary.expectedCash,
          countedBreakdown: breakdown,
        },
        [session.open_operation_id],
      );
      await this.db.batch([
        this.bump('outbox', seq),
        {
          sql: `UPDATE cash_sessions SET status = 'closed', closed_at = ?, counted_cash = ?, expected_cash = ? WHERE id = ? AND status = 'open'`,
          params: [at, counted.toString(true), summary.expectedCash, session.id],
          expectChanges: 1,
        },
        this.outboxInsert(env),
      ]);
      return {
        expectedCash: summary.expectedCash,
        variance: counted.sub(Money.of(summary.expectedCash, currency)).toString(true),
      };
    });
  }

  private currentSession() {
    return one<{ id: string; opened_at: string; opening_float: string; open_operation_id: string }>(
      this.db,
      "SELECT * FROM cash_sessions WHERE status = 'open'",
    );
  }

  private async requireSession() {
    const s = await this.currentSession();
    if (!s) throw new PosError('no_cash_session', 'Open a cash session first');
    return s;
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  /**
   * Refunds units of lines of a local invoice (doc 07 §3.2). Requires a manager's `sales.refund` approval;
   * quantities are capped by what was sold minus earlier refunds on this device, amounts are exact
   * (`refundLineAmounts`). Cash refunds come out of the open drawer.
   */
  refund(
    invoiceId: string,
    lines: { lineNo: number; qty: string }[],
    input: { reason: string; approval: Approval; paymentMethodId: string },
  ): Promise<{ refundId: string; number: string; total: string; printed: boolean }> {
    return this.exclusive(async () => {
      const op = this.requireOperator('pos.sell');
      await this.assertLease();
      if (input.approval.action !== 'sales.refund')
        throw new PosError('approval_required', 'A manager must approve the refund');
      const row = await one<{ payload: string }>(this.db, 'SELECT payload FROM invoices WHERE id = ?', [invoiceId]);
      if (!row) throw new PosError('not_found', 'Invoice not found on this device');
      const sale = JSON.parse(row.payload) as SaleFinalizedV1;
      const currency = sale.invoice.currency;
      const methods = await this.refs.list<{ id: string; kind: string }>('payment_method');
      const method = methods.find((m) => m.id === input.paymentMethodId);
      if (!method) throw new PosError('unknown_payment_method', 'Payment method not available');
      const session = method.kind === 'cash' ? await this.requireSession() : await this.currentSession();

      const refundId = uuidv7();
      const computed = [];
      for (const [i, req] of lines.entries()) {
        const line = sale.lines.find((l) => l.lineNo === req.lineNo);
        if (!line) throw new PosError('not_found', `Line ${req.lineNo} is not on this invoice`);
        const prior = await this.db.all<{ qty: string; net_amount: string; taxes: string }>(
          'SELECT qty, net_amount, taxes FROM refund_lines WHERE invoice_line_id = ?',
          [line.id],
        );
        const priorTaxes = new Map<string, Money>();
        for (const p of prior)
          for (const t of JSON.parse(p.taxes) as { taxRateId: string; amount: string }[])
            priorTaxes.set(
              t.taxRateId,
              (priorTaxes.get(t.taxRateId) ?? Money.zero(currency)).add(Money.of(t.amount, currency)),
            );
        let amounts;
        try {
          amounts = refundLineAmounts(
            { qty: line.qty, netAmount: line.netAmount, taxes: line.taxes },
            {
              // Quantities summed with the exact decimal type (the currency only labels it; no rounding happens).
              qty: prior.reduce((s, p) => Money.of(s, currency).add(Money.of(p.qty, currency)).toString(), '0'),
              netAmount: Money.sum(
                prior.map((p) => Money.of(p.net_amount, currency)),
                currency,
              ).toString(true),
              taxes: [...priorTaxes].map(([taxRateId, a]) => ({ taxRateId, amount: a.toString(true) })),
            },
            req.qty,
            currency,
          );
        } catch (err) {
          throw new PosError('refund_exceeds_sale', (err as Error).message);
        }
        computed.push({ id: childId(refundId, `line:${i + 1}`), invoiceLineId: line.id, qty: req.qty, ...amounts });
      }
      const total = Money.sum(
        computed.map((c) => Money.of(c.grossAmount, currency)),
        currency,
      ).toString(true);
      const id = await this.identity();
      const at = this.clock();
      const [refSeq, outSeq] = await Promise.all([this.peek('refund'), this.peek('outbox')]);
      const number = `${id.branchCode}-${id.deviceCode}-R${String(refSeq).padStart(5, '0')}`;
      const payload: RefundIssuedV1 = {
        id: refundId,
        number,
        invoiceId,
        issuedAt: at,
        reason: input.reason,
        employeeId: op.employeeId,
        cashSessionId: session?.id ?? null,
        approval: input.approval,
        lines: computed,
        payment: { id: childId(refundId, 'payment'), paymentMethodId: method.id, amount: total },
      };
      const saleOp = await one<{ operation_id: string }>(
        this.db,
        "SELECT operation_id FROM outbox WHERE json_extract(envelope, '$.payload.invoice.id') = ?",
        [invoiceId],
      );
      const env = await this.envelope('refund.issued', 1, outSeq, payload, saleOp ? [saleOp.operation_id] : []);
      await this.db.batch([
        this.bump('refund', refSeq),
        this.bump('outbox', outSeq),
        {
          sql: 'INSERT INTO refunds (id, invoice_id, number, issued_at, total, cash_session_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
          params: [refundId, invoiceId, number, at, total, session?.id ?? null, JSON.stringify(payload)],
        },
        ...computed.map((c) => ({
          sql: 'INSERT INTO refund_lines (id, refund_id, invoice_line_id, qty, net_amount, tax_amount, taxes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          params: [c.id, refundId, c.invoiceLineId, c.qty, c.netAmount, c.taxAmount, JSON.stringify(c.taxes)],
        })),
        this.outboxInsert(env),
      ]);
      const slip = [
        `REFUND ${number}`,
        `Original ${sale.invoice.number}`,
        `Reason: ${input.reason}`,
        `TOTAL ${currency} -${total}`,
        '',
      ].join('\n');
      let printed = true;
      try {
        await this.printer.print({ id: `${refundId}:slip`, invoiceNumber: number, text: slip, escpos: toEscPos(slip) });
      } catch {
        printed = false;
      }
      return { refundId, number, total, printed };
    });
  }

  /**
   * Operations the server has not accepted, as a JSON document a manager can hand to support (for a disabled
   * device, or ones rejected for follow-up). Nothing is removed from the device.
   */
  async exportPending(): Promise<string> {
    const rows = await this.db.all<{ local_seq: number; status: string; last_error: string | null; envelope: string }>(
      "SELECT local_seq, status, last_error, envelope FROM outbox WHERE status <> 'acked' ORDER BY local_seq",
    );
    return JSON.stringify(
      {
        exportedAt: this.clock(),
        device: await this.identity(),
        operations: rows.map((r) => ({ ...r, envelope: JSON.parse(r.envelope) })),
      },
      null,
      2,
    );
  }

  private async envelope(
    type: string,
    version: number,
    seq: number,
    payload: unknown,
    dependsOn: string[],
  ): Promise<SyncOperation> {
    const id = await this.identity();
    const at = this.clock();
    const cursor = Number(
      (await one<{ value: string }>(this.db, "SELECT value FROM meta WHERE key = 'sync.pull_cursor'"))?.value ?? 0,
    );
    return {
      operation_id: uuidv7(Date.parse(at)),
      tenant_id: id.tenantId,
      branch_id: id.branchId,
      device_id: id.deviceId,
      operation_type: type,
      schema_version: version,
      occurred_at: at,
      local_seq: seq,
      depends_on: dependsOn,
      refs: { catalog_version: cursor },
      payload,
    };
  }

  private outboxInsert(env: SyncOperation): Statement {
    return {
      sql: 'INSERT INTO outbox (local_seq, operation_id, operation_type, envelope, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [env.local_seq, env.operation_id, env.operation_type, JSON.stringify(env), env.occurred_at],
    };
  }

  /** Active products of this branch with their current price for the channel. */
  async menu(channel: Channel = 'takeaway'): Promise<SellableItem[]> {
    const id = await this.identity();
    const { currency } = await this.settings();
    const products = (
      await this.refs.list<{
        id: string;
        nameAr: string;
        nameEn: string;
        categoryId: string;
        taxCategoryId: string;
        archivedAt: string | null;
      }>('product')
    ).filter((p) => !p.archivedAt);
    const variants = (
      await this.refs.list<{ id: string; productId: string; isDefault: boolean; archivedAt: string | null }>(
        'product_variant',
      )
    ).filter((v) => !v.archivedAt);
    const links = await this.refs.list<{ productId: string; groupId: string; sort: number }>('product_modifier_group');
    const groups = (
      await this.refs.list<{
        id: string;
        nameAr: string;
        nameEn: string;
        minSelect: number;
        maxSelect: number;
        archivedAt: string | null;
      }>('modifier_group')
    ).filter((g) => !g.archivedAt);
    const mods = (
      await this.refs.list<{
        id: string;
        groupId: string;
        nameAr: string;
        nameEn: string;
        priceDelta: string;
        sort: number;
        archivedAt: string | null;
      }>('modifier')
    ).filter((x) => !x.archivedAt);
    const items: SellableItem[] = [];
    for (const p of products) {
      const v = variants.find((x) => x.productId === p.id && x.isDefault);
      if (!v) continue;
      const price = selectPrice(await this.refs.prices(v.id), {
        variantId: v.id,
        branchId: id.branchId,
        channel,
        at: this.clock(),
      });
      if (!price) continue;
      items.push({
        variantId: v.id,
        productId: p.id,
        categoryId: p.categoryId,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        price: Money.of(String(price.price), currency).toString(true),
        taxCategoryId: p.taxCategoryId,
        modifierGroups: links
          .filter((l) => l.productId === p.id)
          .sort((a, b) => a.sort - b.sort)
          .flatMap((l) => groups.filter((g) => g.id === l.groupId))
          .map((g) => ({
            id: g.id,
            nameAr: g.nameAr,
            nameEn: g.nameEn,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            modifiers: mods
              .filter((x) => x.groupId === g.id)
              .sort((a, b) => a.sort - b.sort)
              .map((x) => ({
                id: x.id,
                nameAr: x.nameAr,
                nameEn: x.nameEn,
                priceDelta: Money.of(String(x.priceDelta), currency).toString(true),
              })),
          })),
      });
    }
    return items.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }

  /** Active menu categories, in their configured order (the till's tabs). */
  async categories() {
    const rows = await this.refs.list<{
      id: string;
      nameAr: string;
      nameEn: string;
      sort: number;
      image?: string | null;
      archivedAt: string | null;
    }>('category');
    return rows
      .filter((c) => !c.archivedAt)
      .sort((a, b) => a.sort - b.sort || a.nameEn.localeCompare(b.nameEn))
      .map((c) => ({ ...c, image: c.image ?? null }));
  }

  /** Active payment methods, in their configured order. */
  async paymentMethods() {
    const rows = await this.refs.list<{
      id: string;
      code: string;
      nameAr: string;
      nameEn: string;
      kind: string;
      allowsChange: boolean;
      isActive: boolean;
      sort: number;
    }>('payment_method');
    return rows.filter((m) => m.isActive).sort((a, b) => a.sort - b.sort);
  }

  /** An order and its lines as the till shows them (voided lines included, flagged). */
  async order(orderId: string) {
    const order = await one<{
      id: string;
      channel: Channel;
      status: string;
      opened_at: string;
      table_id: string | null;
      guests: number | null;
      discount: string | null;
    }>(this.db, 'SELECT id, channel, status, opened_at, table_id, guests, discount FROM orders WHERE id = ?', [
      orderId,
    ]);
    if (!order) throw new PosError('not_found', 'Order not found');
    const lines = await this.db.all<{
      line_no: number;
      variant_id: string;
      name_ar: string;
      name_en: string;
      qty: string;
      unit_price: string;
      status: string;
      modifiers: string;
      discount: string | null;
      void_reason: string | null;
    }>('SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no', [orderId]);
    return {
      id: order.id,
      channel: order.channel,
      status: order.status,
      openedAt: order.opened_at,
      tableId: order.table_id,
      guests: order.guests,
      discount: order.discount ? (JSON.parse(order.discount) as DiscountSpec) : null,
      lines: lines.map((l) => ({
        lineNo: l.line_no,
        variantId: l.variant_id,
        nameAr: l.name_ar,
        nameEn: l.name_en,
        qty: l.qty,
        unitPrice: l.unit_price,
        status: l.status as 'pending' | 'sent' | 'voided',
        modifiers: JSON.parse(l.modifiers) as {
          modifierId: string;
          nameAr: string;
          nameEn: string;
          priceDelta: string;
        }[],
        discount: l.discount ? (JSON.parse(l.discount) as DiscountSpec) : null,
        voidReason: l.void_reason,
      })),
    };
  }

  /** Open orders on this till (parked takeaway and delivery orders, and dine-in orders at tables). */
  openOrders() {
    return this.db.all<{ id: string; channel: Channel; opened_at: string; table_id: string | null; items: number }>(
      `SELECT o.id, o.channel, o.opened_at, o.table_id,
              (SELECT count(*) FROM order_items i WHERE i.order_id = o.id AND i.status <> 'voided') AS items
       FROM orders o WHERE o.status = 'open' ORDER BY o.opened_at`,
    );
  }

  /** Opens an order; a dine-in order may take a free table of this branch. */
  openOrder(channel: Channel = 'takeaway', opts: { tableId?: string; guests?: number } = {}): Promise<string> {
    return this.exclusive(async () => {
      if (opts.tableId) await this.assertTableFree(opts.tableId);
      const id = uuidv7();
      await this.db.batch([
        {
          sql: `INSERT INTO orders (id, channel, status, opened_at, table_id, guests) VALUES (?, ?, 'open', ?, ?, ?)`,
          params: [id, channel, this.clock(), opts.tableId ?? null, opts.guests ?? null],
        },
      ]);
      return id;
    });
  }

  /** Adds a product, with chosen modifiers (validated against the product's groups); price = base + deltas. */
  addItem(orderId: string, variantId: string, qty = '1', opts: { modifierIds?: string[] } = {}): Promise<number> {
    return this.exclusive(async () => {
      const order = await this.openOrderRow(orderId);
      const item = (await this.menu(order.channel as Channel)).find((i) => i.variantId === variantId);
      if (!item) throw new PosError('item_unavailable', 'This item is not available');
      const chosen = opts.modifierIds ?? [];
      if (new Set(chosen).size !== chosen.length)
        throw new PosError('modifiers_invalid', 'A modifier was chosen twice');
      const selected = [];
      for (const g of item.modifierGroups) {
        const picks = g.modifiers.filter((mo) => chosen.includes(mo.id));
        if (picks.length < g.minSelect || picks.length > g.maxSelect) {
          throw new PosError('modifiers_invalid', `Choose ${g.minSelect}-${g.maxSelect} from ${g.nameEn}`);
        }
        selected.push(...picks);
      }
      if (selected.length !== new Set(chosen).size)
        throw new PosError('modifiers_invalid', 'Modifier not offered with this item');
      const { currency } = await this.settings();
      const unit = selected
        .reduce((s, mo) => s.add(Money.of(mo.priceDelta, currency)), Money.of(item.price, currency))
        .round();
      if (unit.isNegative()) throw new PosError('modifiers_invalid', 'Price cannot be negative');
      // Tapping the same item again raises the quantity of its line while that line is still unsent and
      // undiscounted with the same options and price; anything else (sent, discounted, other options) is a new line.
      const key = (ids: string[]) => [...ids].sort().join(',');
      const same = (
        await this.db.all<{ line_no: number; qty: string; unit_price: string; modifiers: string }>(
          `SELECT line_no, qty, unit_price, modifiers FROM order_items
           WHERE order_id = ? AND variant_id = ? AND status = 'pending' AND discount IS NULL ORDER BY line_no DESC`,
          [orderId, variantId],
        )
      ).find(
        (l) =>
          l.unit_price === unit.toString(true) &&
          key((JSON.parse(l.modifiers) as { modifierId: string }[]).map((m) => m.modifierId)) === key(chosen),
      );
      if (same) {
        await this.db.batch([
          {
            sql: `UPDATE order_items SET qty = ? WHERE order_id = ? AND line_no = ? AND status = 'pending'`,
            params: [fromMicro(toMicro(same.qty) + toMicro(qty)), orderId, same.line_no],
            expectChanges: 1,
          },
        ]);
        return same.line_no;
      }
      const next = await this.nextLine(orderId);
      await this.db.batch([
        {
          sql: `INSERT INTO order_items (id, order_id, line_no, variant_id, name_ar, name_en, qty, unit_price, tax_category_id, modifiers)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            childId(orderId, `item:${next}`),
            orderId,
            next,
            variantId,
            item.nameAr,
            item.nameEn,
            qty,
            unit.toString(true),
            item.taxCategoryId,
            JSON.stringify(
              selected.map((mo) => ({
                modifierId: mo.id,
                nameAr: mo.nameAr,
                nameEn: mo.nameEn,
                priceDelta: mo.priceDelta,
              })),
            ),
          ],
        },
      ]);
      return next;
    });
  }

  /** Totals with discounts and (dine-in) service charge — the same calculation the server re-verifies. */
  async quote(orderId: string): Promise<OrderTotals> {
    const order = await one<{ channel: string; discount: string | null }>(
      this.db,
      'SELECT channel, discount FROM orders WHERE id = ?',
      [orderId],
    );
    if (!order) throw new PosError('not_found', 'Order not found');
    const items = await this.items(orderId);
    if (items.length === 0) throw new PosError('empty_order', 'The order has no items');
    const settings = await this.settings();
    const at = this.clock();
    return computeOrderTotals({
      currency: settings.currency,
      pricesIncludeTax: settings.priceIncludesTax,
      lines: await Promise.all(
        items.map(async (i) => ({
          lineKey: String(i.line_no),
          qty: i.qty,
          unitPrice: i.unit_price,
          taxes: await this.refs.taxRates(i.tax_category_id, at),
          discount: i.discount ? (JSON.parse(i.discount) as DiscountSpec) : null,
        })),
      ),
      orderDiscount: order.discount ? (JSON.parse(order.discount) as DiscountSpec) : null,
      serviceCharge:
        order.channel === 'dine_in' && settings.serviceChargeRate !== '0'
          ? {
              rate: settings.serviceChargeRate,
              taxes: settings.serviceChargeTaxCategoryId
                ? await this.refs.taxRates(settings.serviceChargeTaxCategoryId, at)
                : [],
            }
          : null,
    });
  }

  // ── Discounts, kitchen, voids ──────────────────────────────────────────────

  /**
   * Line discount (null removes it). Needs `pos.discount`; beyond the tenant's limit (`maxDiscountPct`) it
   * also needs a manager approval for `pos.discount_over_limit`, which is kept with the order.
   */
  setLineDiscount(
    orderId: string,
    lineNo: number,
    discount: DiscountSpec | null,
    approval: Approval | null = null,
  ): Promise<void> {
    return this.exclusive(async () => {
      this.requireOperator('pos.discount');
      await this.openOrderRow(orderId);
      const item = await one<{ qty: string; unit_price: string; status: string }>(
        this.db,
        'SELECT qty, unit_price, status FROM order_items WHERE order_id = ? AND line_no = ?',
        [orderId, lineNo],
      );
      if (!item || item.status === 'voided') throw new PosError('not_found', `Line ${lineNo} not found`);
      const statements = await this.discountGuard(orderId, discount, approval, async (currency) =>
        Money.of(item.unit_price, currency).mul(item.qty).round(),
      );
      await this.db.batch([
        ...statements,
        {
          sql: 'UPDATE order_items SET discount = ? WHERE order_id = ? AND line_no = ?',
          params: [discount ? JSON.stringify(discount) : null, orderId, lineNo],
        },
      ]);
    });
  }

  setOrderDiscount(
    orderId: string,
    discount: DiscountSpec | null,
    reason: string | null,
    approval: Approval | null = null,
  ): Promise<void> {
    return this.exclusive(async () => {
      this.requireOperator('pos.discount');
      await this.openOrderRow(orderId);
      const { currency } = await this.settings();
      const listed = Money.sum(
        (await this.items(orderId)).map((i) => Money.of(i.unit_price, currency).mul(i.qty).round()),
        currency,
      );
      const statements = await this.discountGuard(orderId, discount, approval, async () => listed);
      await this.db.batch([
        ...statements,
        {
          sql: 'UPDATE orders SET discount = ?, discount_reason = ? WHERE id = ?',
          params: [discount ? JSON.stringify(discount) : null, reason, orderId],
        },
      ]);
    });
  }

  private async discountGuard(
    orderId: string,
    discount: DiscountSpec | null,
    approval: Approval | null,
    base: (currency: string) => Promise<Money>,
  ): Promise<Statement[]> {
    if (!discount) return [];
    const { currency, maxDiscountPct } = await this.settings();
    const listed = await base(currency);
    const fraction =
      discount.kind === 'percent'
        ? Number(discount.value)
        : listed.isZero()
          ? 1
          : Number(discount.value) / Number(listed.toString());
    if (fraction <= Number(maxDiscountPct)) return [];
    if (approval?.action !== 'pos.discount_over_limit')
      throw new PosError('approval_required', 'A manager must approve a discount above the limit');
    return [this.addApproval(orderId, approval)];
  }

  private addApproval(orderId: string, approval: Approval): Statement {
    return {
      sql: `UPDATE orders SET approvals = json_insert(approvals, '$[#]', json(?)) WHERE id = ?`,
      params: [JSON.stringify(approval), orderId],
    };
  }

  /**
   * Marks pending items as sent, queues a `kitchen.fired` operation for the kitchen display (one atomic batch)
   * and prints a kitchen ticket (works offline).
   */
  sendToKitchen(orderId: string): Promise<number> {
    return this.exclusive(async () => {
      const op = this.requireOperator('pos.sell');
      const order = await this.openOrderRow(orderId);
      const pending = await this.db.all<{
        id: string;
        line_no: number;
        variant_id: string;
        name_ar: string;
        name_en: string;
        qty: string;
        modifiers: string;
      }>(
        "SELECT id, line_no, variant_id, name_ar, name_en, qty, modifiers FROM order_items WHERE order_id = ? AND status = 'pending' ORDER BY line_no",
        [orderId],
      );
      if (pending.length === 0) return 0;
      const table = order.table_id ? await this.refs.get<{ label: string }>('dining_table', order.table_id) : undefined;
      const outSeq = await this.peek('outbox');
      const env = await this.envelope(
        'kitchen.fired',
        1,
        outSeq,
        {
          fireId: uuidv7(Date.parse(this.clock())),
          orderId,
          label: table ? table.label : `${order.channel} #${orderId.slice(-4).toUpperCase()}`,
          channel: order.channel,
          tableId: order.table_id,
          employeeId: op.employeeId,
          firedAt: this.clock(),
          items: pending.map((p) => ({
            orderItemId: p.id,
            variantId: p.variant_id,
            nameAr: p.name_ar,
            nameEn: p.name_en,
            qty: p.qty,
            modifiers: (JSON.parse(p.modifiers) as { nameAr?: string; nameEn: string }[]).map((mo) => ({
              nameAr: mo.nameAr ?? mo.nameEn,
              nameEn: mo.nameEn,
            })),
          })),
        },
        [],
      );
      await this.db.batch([
        { sql: "UPDATE order_items SET status = 'sent' WHERE order_id = ? AND status = 'pending'", params: [orderId] },
        this.bump('outbox', outSeq),
        this.outboxInsert(env),
      ]);
      const text = [
        `KITCHEN ${table ? `Table ${table.label}` : order.channel.toUpperCase()}`,
        new Date(this.clock()).toISOString().slice(11, 16),
        ...pending.flatMap((p) => [
          `${p.qty} x ${p.name_en}`,
          ...(JSON.parse(p.modifiers) as { nameEn: string }[]).map((mo) => `   + ${mo.nameEn}`),
        ]),
        '',
      ].join('\n');
      try {
        await this.printer.print({
          id: `${orderId}:kitchen:${Date.now()}`,
          invoiceNumber: `kitchen-${orderId.slice(-6)}`,
          text,
          escpos: toEscPos(text),
        });
      } catch {
        // The items are marked sent either way; the ticket can be reprinted (kitchen display comes later).
      }
      return pending.length;
    });
  }

  /** Voids a line of an open order: unsent needs `pos.void_item`; sent to the kitchen needs a manager approval. */
  voidItem(orderId: string, lineNo: number, reason: string, approval: Approval | null = null): Promise<void> {
    return this.exclusive(async () => {
      const op = this.requireOperator('pos.sell');
      await this.openOrderRow(orderId);
      const item = await one<{ id: string; status: string }>(
        this.db,
        'SELECT id, status FROM order_items WHERE order_id = ? AND line_no = ?',
        [orderId, lineNo],
      );
      if (!item || item.status === 'voided') throw new PosError('not_found', `Line ${lineNo} not found`);
      if (item.status === 'sent' && approval?.action !== 'pos.void_sent_item')
        throw new PosError('approval_required', 'A manager must approve voiding an item already sent to the kitchen');
      if (
        item.status === 'pending' &&
        !op.permissions.includes('pos.void_item') &&
        approval?.action !== 'pos.void_item'
      ) {
        throw new PosError('approval_required', 'A manager must approve this void');
      }
      const update: Statement = {
        sql: `UPDATE order_items SET status = 'voided', void_reason = ?, void_approval = ? WHERE order_id = ? AND line_no = ?`,
        params: [
          reason,
          approval
            ? JSON.stringify({ ...approval, wasSent: item.status === 'sent' })
            : JSON.stringify({ wasSent: item.status === 'sent' }),
          orderId,
          lineNo,
        ],
      };
      if (item.status !== 'sent') {
        await this.db.batch([update]);
        return;
      }
      // Already in the kitchen: tell the kitchen display (the void itself travels with the sale or cancellation).
      const outSeq = await this.peek('outbox');
      const env = await this.envelope(
        'kitchen.voided',
        1,
        outSeq,
        { orderId, orderItemId: item.id, reason, voidedAt: this.clock() },
        [],
      );
      await this.db.batch([update, this.bump('outbox', outSeq), this.outboxInsert(env)]);
    });
  }

  // ── Tables: transfer, merge, split, cancel ─────────────────────────────────

  /**
   * Floor plan of this branch with the open order (if any) at each table. A deactivated table is left out,
   * unless it still has an open order (it stays until that order is paid or moved); empty areas are left out.
   */
  async tables() {
    const areas = await this.refs.list<{ id: string; nameAr: string; nameEn: string; sort: number }>('service_area');
    const open = await this.db.all<{ id: string; table_id: string; opened_at: string }>(
      "SELECT id, table_id, opened_at FROM orders WHERE status = 'open' AND table_id IS NOT NULL",
    );
    const tables = (
      await this.refs.list<{ id: string; serviceAreaId: string; label: string; seats: number; isActive: boolean }>(
        'dining_table',
      )
    ).filter((t) => t.isActive || open.some((o) => o.table_id === t.id));
    return areas
      .filter((a) => tables.some((t) => t.serviceAreaId === a.id))
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({
        ...a,
        tables: tables
          .filter((t) => t.serviceAreaId === a.id)
          .sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }))
          .map((t) => ({
            ...t,
            openOrders: open.filter((o) => o.table_id === t.id).map((o) => ({ orderId: o.id, openedAt: o.opened_at })),
          })),
      }));
  }

  transferTable(orderId: string, tableId: string): Promise<void> {
    return this.exclusive(async () => {
      this.requireOperator('pos.sell');
      await this.openOrderRow(orderId);
      await this.assertTableFree(tableId);
      await this.db.batch([
        {
          sql: "UPDATE orders SET table_id = ?, channel = 'dine_in' WHERE id = ? AND status = 'open'",
          params: [tableId, orderId],
          expectChanges: 1,
        },
      ]);
    });
  }

  /** Moves every item (and approvals) of `sourceId` into `targetId`; the source order is closed as merged. */
  mergeOrders(targetId: string, sourceId: string): Promise<void> {
    return this.exclusive(async () => {
      this.requireOperator('pos.sell');
      if (targetId === sourceId) throw new PosError('invalid_merge', 'Cannot merge an order into itself');
      await this.openOrderRow(targetId);
      await this.openOrderRow(sourceId);
      const items = await this.db.all<Record<string, string | number | null>>(
        'SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no',
        [sourceId],
      );
      const source = (await one<{ approvals: string }>(this.db, 'SELECT approvals FROM orders WHERE id = ?', [
        sourceId,
      ]))!;
      let next = await this.nextLine(targetId);
      await this.db.batch([
        ...this.moveItems(items, targetId, () => next++),
        ...(JSON.parse(source.approvals) as Approval[]).map((a) => this.addApproval(targetId, a)),
        {
          sql: "UPDATE orders SET status = 'cancelled', merged_into = ?, cancel_reason = 'merged', closed_at = ? WHERE id = ? AND status = 'open'",
          params: [targetId, this.clock(), sourceId],
          expectChanges: 1,
        },
      ]);
    });
  }

  /** Splits the given lines into a new order on the same table, to be paid separately. */
  splitOrder(orderId: string, lineNos: number[]): Promise<string> {
    return this.exclusive(async () => {
      this.requireOperator('pos.sell');
      const order = await this.openOrderRow(orderId);
      const items = (
        await this.db.all<Record<string, string | number | null>>(
          "SELECT * FROM order_items WHERE order_id = ? AND status <> 'voided' ORDER BY line_no",
          [orderId],
        )
      ).filter((i) => lineNos.includes(Number(i.line_no)));
      if (items.length !== new Set(lineNos).size || items.length === 0)
        throw new PosError('not_found', 'Choose existing lines to split');
      const remaining = (await this.items(orderId)).length - items.length;
      if (remaining <= 0) throw new PosError('invalid_split', 'Leave at least one item on the original order');
      const newId = uuidv7();
      let next = 1;
      await this.db.batch([
        {
          sql: `INSERT INTO orders (id, channel, status, opened_at, table_id) VALUES (?, ?, 'open', ?, ?)`,
          params: [newId, order.channel, order.opened_at, order.table_id],
        },
        ...this.moveItems(items, newId, () => next++),
      ]);
      return newId;
    });
  }

  /**
   * Cancels an open order. With nothing sent to the kitchen it simply disappears locally; once items were sent,
   * a manager approval is required and an `order.cancelled` operation records the waste.
   */
  cancelOrder(orderId: string, reason: string, approval: Approval | null = null): Promise<void> {
    return this.exclusive(async () => {
      const op = this.requireOperator('pos.sell');
      const order = await this.openOrderRow(orderId);
      const items = await this.db.all<{
        id: string;
        variant_id: string;
        name_en: string;
        qty: string;
        unit_price: string;
        status: string;
        void_approval: string | null;
      }>('SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no', [orderId]);
      const sent = items.some(
        (i) => i.status === 'sent' || (i.status === 'voided' && JSON.parse(i.void_approval ?? '{}').wasSent),
      );
      const close: Statement = {
        sql: "UPDATE orders SET status = 'cancelled', cancel_reason = ?, closed_at = ? WHERE id = ? AND status = 'open'",
        params: [reason, this.clock(), orderId],
        expectChanges: 1,
      };
      if (!sent) {
        await this.db.batch([close]);
        return;
      }
      if (approval?.action !== 'pos.void_sent_item')
        throw new PosError(
          'approval_required',
          'A manager must approve cancelling an order already sent to the kitchen',
        );
      const id = await this.identity();
      const [ordSeq, outSeq] = await Promise.all([this.peek('order'), this.peek('outbox')]);
      const localNumber = `${id.branchCode}-${id.deviceCode}-X${String(ordSeq).padStart(5, '0')}`;
      const env = await this.envelope(
        'order.cancelled',
        1,
        outSeq,
        {
          orderId,
          localNumber,
          channel: order.channel,
          tableId: order.table_id,
          employeeId: op.employeeId,
          openedAt: order.opened_at,
          cancelledAt: this.clock(),
          reason,
          approval,
          items: items.map((i) => ({
            orderItemId: i.id,
            variantId: i.variant_id,
            productNameEn: i.name_en,
            qty: i.qty,
            unitPrice: i.unit_price,
            wasSentToKitchen: i.status === 'sent' || JSON.parse(i.void_approval ?? '{}').wasSent === true,
          })),
        },
        [],
      );
      await this.db.batch([
        this.bump('order', ordSeq),
        this.bump('outbox', outSeq),
        {
          ...close,
          sql: close.sql.replace('cancel_reason = ?', 'cancel_reason = ?, local_number = ?'),
          params: [reason, localNumber, this.clock(), orderId],
        },
        this.outboxInsert(env),
      ]);
    });
  }

  private moveItems(items: Record<string, SqlValue>[], targetId: string, nextLine: () => number): Statement[] {
    return items.flatMap((i): Statement[] => {
      const lineNo = nextLine();
      const col = (k: string) => i[k] ?? null;
      return [
        { sql: 'DELETE FROM order_items WHERE id = ?', params: [i.id as string] },
        {
          sql: `INSERT INTO order_items (id, order_id, line_no, variant_id, name_ar, name_en, qty, unit_price, tax_category_id, status, modifiers, discount, void_reason, void_approval)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            childId(targetId, `item:${lineNo}`),
            targetId,
            lineNo,
            ...[
              'variant_id',
              'name_ar',
              'name_en',
              'qty',
              'unit_price',
              'tax_category_id',
              'status',
              'modifiers',
              'discount',
              'void_reason',
              'void_approval',
            ].map(col),
          ],
        },
      ];
    });
  }

  private async nextLine(orderId: string) {
    return (await one<{ n: number }>(
      this.db,
      'SELECT coalesce(max(line_no), 0) + 1 AS n FROM order_items WHERE order_id = ?',
      [orderId],
    ))!.n;
  }

  private async assertTableFree(tableId: string) {
    const table = await this.refs.get<{ isActive?: boolean }>('dining_table', tableId);
    if (!table || table.isActive === false) throw new PosError('not_found', 'Table not found');
    if (await one(this.db, "SELECT id FROM orders WHERE status = 'open' AND table_id = ?", [tableId]))
      throw new PosError('table_occupied', 'This table already has an open order');
  }

  /** Completes the sale. Requires full payment; cash may be over-tendered (change is computed). */
  finalize(orderId: string, payments: PaymentInput[]): Promise<FinalizeResult> {
    return this.exclusive(async () => {
      const operator = this.requireOperator('pos.sell');
      await this.assertLease();
      const order = await this.openOrderRow(orderId);
      const id = await this.identity();
      const totals = await this.quote(orderId);
      const items = await this.items(orderId);
      const methods = await this.refs.list<{
        id: string;
        kind: string;
        allowsChange: boolean;
        isActive: boolean;
        nameEn: string;
      }>('payment_method');
      const currency = totals.currency;
      const total = Money.of(totals.total, currency);

      let remaining = total;
      let change = Money.zero(currency);
      const paid = payments.map((p, i) => {
        const method = methods.find((m) => m.id === p.paymentMethodId && m.isActive);
        if (!method) throw new PosError('unknown_payment_method', 'Payment method not available');
        const offered = Money.of(p.tendered ?? p.amount ?? remaining.toString(true), currency);
        if (offered.isNegative() || offered.isZero()) throw new PosError('invalid_amount', 'Amount must be positive');
        const applied = offered.compare(remaining) > 0 ? remaining : offered;
        const excess = offered.sub(applied);
        if (!excess.isZero()) {
          if (!method.allowsChange || p.tendered === undefined)
            throw new PosError('overpayment', 'Only cash can be over-tendered');
          change = change.add(excess);
        }
        remaining = remaining.sub(applied);
        return { index: i + 1, method, applied, tendered: p.tendered ?? null, excess };
      });
      if (!remaining.isZero())
        throw new PosError('payment_incomplete', `Remaining balance ${remaining.toString(true)}`);
      const session = await this.currentSession();
      if (!session && paid.some((p) => p.method.kind === 'cash'))
        throw new PosError('no_cash_session', 'Open a cash session to take cash');

      const at = this.clock();
      const invoiceId = uuidv7(Date.parse(at));
      const [invSeq, outSeq] = await Promise.all([this.peek('invoice'), this.peek('outbox')]);
      const number = `${id.branchCode}-${id.deviceCode}-${String(invSeq).padStart(6, '0')}`;
      const voided = await this.db.all<{
        id: string;
        variant_id: string;
        name_en: string;
        qty: string;
        unit_price: string;
        void_reason: string;
        void_approval: string | null;
      }>("SELECT * FROM order_items WHERE order_id = ? AND status = 'voided' ORDER BY line_no", [orderId]);
      const voidApprovals = voided.map(
        (v) => JSON.parse(v.void_approval ?? '{}') as Partial<Approval> & { wasSent?: boolean },
      );
      const approvals = [
        ...(JSON.parse(order.approvals) as Approval[]),
        ...voidApprovals.filter((a): a is Approval & { wasSent?: boolean } => !!a.id).map(({ wasSent: _w, ...a }) => a),
      ];
      const sale: SaleFinalizedV3 = {
        employeeId: operator.employeeId,
        cashSessionId: session?.id ?? null,
        approvals,
        order: {
          id: orderId,
          localNumber: number,
          channel: order.channel as Channel,
          tableId: order.table_id,
          guests: order.guests,
          openedAt: order.opened_at,
          closedAt: at,
          discount: order.discount ? (JSON.parse(order.discount) as DiscountSpec) : null,
          discountReason: order.discount_reason,
        },
        invoice: {
          id: invoiceId,
          number,
          issuedAt: at,
          currency,
          pricesIncludeTax: (await this.settings()).priceIncludesTax,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          serviceChargeTotal: totals.serviceChargeTotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
        },
        serviceCharge: totals.serviceCharge,
        lines: items.map((it, i) => {
          const t = totals.lines[i]!;
          return {
            id: childId(invoiceId, `line:${it.line_no}`),
            lineNo: it.line_no,
            variantId: it.variant_id,
            productNameAr: it.name_ar,
            productNameEn: it.name_en,
            qty: it.qty,
            unitPrice: it.unit_price,
            modifiers: JSON.parse(it.modifiers),
            taxCategoryId: it.tax_category_id,
            discount: it.discount ? (JSON.parse(it.discount) as DiscountSpec) : null,
            netBeforeDiscount: t.netBeforeDiscount,
            discountAmount: t.discountAmount,
            netAmount: t.netAmount,
            taxAmount: t.taxAmount,
            grossAmount: t.grossAmount,
            taxes: t.taxes,
          };
        }),
        voids: voided.map((v, i) => ({
          orderItemId: v.id,
          variantId: v.variant_id,
          productNameEn: v.name_en,
          qty: v.qty,
          unitPrice: v.unit_price,
          wasSentToKitchen: voidApprovals[i]!.wasSent === true,
          reason: v.void_reason,
          approvalId: voidApprovals[i]!.id ?? null,
        })),
        payments: paid.map((p) => ({
          id: childId(invoiceId, `payment:${p.index}`),
          paymentMethodId: p.method.id,
          amount: p.applied.toString(true),
          tendered: p.tendered === null ? null : Money.of(p.tendered, currency).toString(true),
          changeGiven: p.excess.isZero() ? null : p.excess.toString(true),
          reference: null,
        })),
      };
      const operation = await this.envelope(
        'sale.finalized',
        3,
        outSeq,
        sale,
        session ? [session.open_operation_id] : [],
      );
      const printJobId = childId(invoiceId, 'print:receipt');

      // One atomic batch: the sale either exists completely (with its outbox op) or not at all.
      const statements: Statement[] = [
        this.bump('invoice', invSeq),
        this.bump('outbox', outSeq),
        {
          sql: `UPDATE orders SET status = 'closed', local_number = ?, closed_at = ? WHERE id = ? AND status = 'open'`,
          params: [number, at, orderId],
          expectChanges: 1,
        },
        {
          sql: `INSERT INTO invoices (id, order_id, number, issued_at, total, change_given, payload) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [invoiceId, orderId, number, at, totals.total, change.toString(true), JSON.stringify(sale)],
        },
        ...sale.payments.map((p) => ({
          sql: `INSERT INTO payments (id, invoice_id, payment_method_id, amount, tendered, change_given, cash_session_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [p.id, invoiceId, p.paymentMethodId, p.amount, p.tendered, p.changeGiven, session?.id ?? null],
        })),
        this.outboxInsert(operation),
        {
          sql: `INSERT INTO print_jobs (id, invoice_id, kind, created_at) VALUES (?, ?, 'receipt', ?)`,
          params: [printJobId, invoiceId, at],
        },
      ];
      await this.db.batch(statements);

      const receipt = await this.receiptText(sale);
      const printed = await this.printJob(printJobId, number, receipt);
      return {
        invoiceId,
        number,
        total: totals.total,
        changeGiven: change.toString(true),
        receipt,
        printed,
        operationId: operation.operation_id,
      };
    });
  }

  /** Re-runs receipt jobs left pending by a crash or printer failure (call on start-up). */
  async recoverPrintJobs(): Promise<number> {
    const jobs = await this.db.all<{ id: string; payload: string; number: string }>(
      `SELECT j.id, i.payload, i.number FROM print_jobs j JOIN invoices i ON i.id = j.invoice_id WHERE j.status <> 'printed' ORDER BY j.created_at`,
    );
    let printed = 0;
    for (const j of jobs)
      if (await this.printJob(j.id, j.number, await this.receiptText(JSON.parse(j.payload) as SaleFinalizedV1)))
        printed++;
    return printed;
  }

  /** Reprint of a committed receipt (marked as a copy). */
  async reprint(invoiceId: string): Promise<string> {
    const row = await one<{ payload: string; number: string }>(
      this.db,
      'SELECT payload, number FROM invoices WHERE id = ?',
      [invoiceId],
    );
    if (!row) throw new PosError('not_found', 'Invoice not found');
    const text =
      (this.opts.receiptLocale === 'ar' ? '*** نسخة ***\n' : '*** COPY ***\n') +
      (await this.receiptText(JSON.parse(row.payload) as SaleFinalizedV1));
    await this.printer.print({
      id: `${invoiceId}:copy:${Date.now()}`,
      invoiceNumber: row.number,
      text,
      escpos: toEscPos(text),
    });
    return text;
  }

  /** A local invoice's lines with the quantity already refunded on this device (for the refund screen). */
  async invoice(invoiceId: string) {
    const row = await one<{ payload: string; number: string; issued_at: string; total: string }>(
      this.db,
      'SELECT payload, number, issued_at, total FROM invoices WHERE id = ?',
      [invoiceId],
    );
    if (!row) throw new PosError('not_found', 'Invoice not found on this device');
    const sale = JSON.parse(row.payload) as SaleFinalizedV1;
    const refunded = await this.db.all<{ invoice_line_id: string; qty: string }>(
      'SELECT invoice_line_id, qty FROM refund_lines WHERE invoice_line_id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(sale.lines.map((l) => l.id))],
    );
    return {
      id: invoiceId,
      number: row.number,
      issuedAt: row.issued_at,
      total: row.total,
      lines: sale.lines.map((l) => ({
        lineNo: l.lineNo,
        nameAr: l.productNameAr,
        nameEn: l.productNameEn,
        qty: l.qty,
        grossAmount: l.grossAmount,
        refundedQty: fromMicro(
          refunded.filter((r) => r.invoice_line_id === l.id).reduce((s, r) => s + toMicro(r.qty), 0n),
        ),
      })),
    };
  }

  history(limit = 50) {
    return this.db.all<{ id: string; number: string; issued_at: string; total: string; sync_status: string }>(
      `SELECT i.id, i.number, i.issued_at, i.total, coalesce(o.status, 'pending') AS sync_status
       FROM invoices i LEFT JOIN outbox o ON json_extract(o.envelope, '$.payload.invoice.id') = i.id
       ORDER BY i.issued_at DESC LIMIT ?`,
      [limit],
    );
  }

  private async printJob(id: string, number: string, text: string): Promise<boolean> {
    try {
      await this.printer.print({ id, invoiceNumber: number, text, escpos: toEscPos(text) });
      await this.db.batch([
        {
          sql: `UPDATE print_jobs SET status = 'printed', attempts = attempts + 1, last_error = NULL WHERE id = ?`,
          params: [id],
        },
      ]);
      return true;
    } catch (err) {
      await this.db.batch([
        {
          sql: `UPDATE print_jobs SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?`,
          params: [String(err instanceof Error ? err.message : err), id],
        },
      ]);
      return false;
    }
  }

  private async receiptText(sale: SaleFinalizedV1) {
    const id = await this.identity();
    const branch = await this.refs.get<{
      nameAr: string;
      nameEn: string;
      timezone?: string;
      address: string | null;
      taxRegistrationNo: string | null;
    }>('branch', id.branchId);
    const methods = await this.refs.list<{ id: string; nameAr: string; nameEn: string }>('payment_method');
    const ar = this.opts.receiptLocale === 'ar';
    return renderReceipt(sale, {
      locale: this.opts.receiptLocale,
      timeZone: branch?.timezone,
      branchName: (ar ? branch?.nameAr : branch?.nameEn) ?? id.branchCode,
      branchAddress: branch?.address,
      taxRegistrationNo: branch?.taxRegistrationNo,
      paymentMethodNames: Object.fromEntries(methods.map((m) => [m.id, ar ? m.nameAr : m.nameEn])),
      footer: ar ? 'شكراً لزيارتكم' : 'Thank you',
    });
  }

  private async settings() {
    const id = await this.identity();
    const s = await this.refs.get<{
      priceIncludesTax: boolean;
      serviceChargeRate?: string;
      serviceChargeTaxCategoryId?: string | null;
      maxDiscountPct?: string;
    }>('tenant_settings', id.tenantId);
    const branch = await this.refs.get<{ currencyCode: string }>('branch', id.branchId);
    if (!s || !branch) throw new PosError('not_synced', 'Catalog has not been downloaded yet');
    return {
      priceIncludesTax: s.priceIncludesTax,
      currency: branch.currencyCode,
      serviceChargeRate: normaliseRate(String(s.serviceChargeRate ?? '0')),
      serviceChargeTaxCategoryId: s.serviceChargeTaxCategoryId ?? null,
      maxDiscountPct: String(s.maxDiscountPct ?? '0.2'),
    };
  }

  private async openOrderRow(orderId: string) {
    const order = await one<{
      id: string;
      channel: string;
      status: string;
      opened_at: string;
      table_id: string | null;
      guests: number | null;
      discount: string | null;
      discount_reason: string | null;
      approvals: string;
    }>(this.db, 'SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) throw new PosError('not_found', 'Order not found');
    if (order.status !== 'open') throw new PosError('order_closed', 'This order is already closed');
    return order;
  }

  /** Items that count towards the bill (voided ones excluded). */
  private items(orderId: string) {
    return this.db.all<{
      line_no: number;
      variant_id: string;
      name_ar: string;
      name_en: string;
      qty: string;
      unit_price: string;
      tax_category_id: string;
      modifiers: string;
      discount: string | null;
      status: string;
    }>("SELECT * FROM order_items WHERE order_id = ? AND status <> 'voided' ORDER BY line_no", [orderId]);
  }

  private async peek(docType: string): Promise<number> {
    return (await one<{ next_value: number }>(this.db, 'SELECT next_value FROM sequences WHERE doc_type = ?', [
      docType,
    ]))!.next_value;
  }

  /** Optimistic sequence increment: fails the batch if another writer consumed the number. */
  private bump(docType: string, current: number): Statement {
    return {
      sql: 'UPDATE sequences SET next_value = ? WHERE doc_type = ? AND next_value = ?',
      params: [current + 1, docType, current],
      expectChanges: 1,
    };
  }
}
