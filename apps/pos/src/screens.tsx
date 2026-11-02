import { useCallback, useEffect, useState } from 'react';
import type { CashSessionSummary } from '@ros/pos-core';
import { useI18n } from './i18n';
import type { Runtime } from './runtime';
import { Button, Field, Input, Keypad, Modal, Num, useUi } from './ui';
import { cents, fromCents, isMoney } from './money';

type Open = (orderId: string | null) => void;

/** Floor plan: free tables open a new dine-in order, occupied ones resume theirs; orders can move tables. */
export function TablesScreen({ runtime, open }: { runtime: Runtime; open: Open }) {
  const { t, name } = useI18n();
  const ui = useUi();
  const [plan, setPlan] = useState<Awaited<ReturnType<Runtime['pos']['tables']>>>([]);
  const [moving, setMoving] = useState<string | null>(null);
  const load = useCallback(() => runtime.pos.tables().then(setPlan, ui.fail), [runtime, ui]);
  useEffect(() => void load(), [load]);
  const tap = async (tableId: string, orders: { orderId: string }[]) => {
    try {
      if (moving) {
        await runtime.pos.transferTable(moving, tableId);
        setMoving(null);
        return void load();
      }
      if (orders.length) return open(orders[0]!.orderId);
      open(await runtime.pos.openOrder('dine_in', { tableId }));
    } catch (err) {
      ui.fail(err);
    }
  };
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {moving && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3 text-warning">
          <span>{t.tables.transferTo}…</span>
          <Button variant="secondary" onClick={() => setMoving(null)}>
            {t.cancel}
          </Button>
        </div>
      )}
      {plan.map((area) => (
        <section key={area.id} className="flex flex-col gap-2">
          <h2 className="font-semibold">{name(area)}</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {area.tables.map((tb) => {
              const busy = tb.openOrders.length > 0;
              return (
                <div key={tb.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => void tap(tb.id, tb.openOrders)}
                    disabled={!!moving && busy}
                    className={`flex aspect-square flex-col items-center justify-center rounded-xl border-2 text-lg font-bold transition active:scale-[0.97] disabled:opacity-40 ${
                      busy ? 'border-warning bg-amber-50 text-warning' : 'border-brand-600 bg-white text-brand-700'
                    }`}
                  >
                    <Num>{tb.label}</Num>
                    <span className="text-xs font-normal">{busy ? t.tables.occupied : t.tables.free}</span>
                  </button>
                  {busy && !moving && (
                    <Button variant="ghost" className="text-xs" onClick={() => setMoving(tb.openOrders[0]!.orderId)}>
                      {t.tables.transfer}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function OrdersScreen({ runtime, open }: { runtime: Runtime; open: Open }) {
  const { t, time } = useI18n();
  const ui = useUi();
  const [orders, setOrders] = useState<Awaited<ReturnType<Runtime['pos']['openOrders']>>>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    void runtime.pos.openOrders().then(async (o) => {
      setOrders(o);
      const tables = await runtime.pos.refs.list<{ id: string; label: string }>('dining_table');
      setLabels(Object.fromEntries(tables.map((x) => [x.id, x.label])));
    }, ui.fail);
  }, [runtime, ui]);
  if (orders.length === 0) return <p className="p-8 text-center text-muted">{t.orders.empty}</p>;
  return (
    <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            onClick={() => open(o.id)}
            className="flex w-full flex-col gap-1 rounded-xl border border-line bg-white p-4 text-start hover:border-brand-600"
          >
            <span className="font-semibold">
              {t.channels[o.channel]} {o.table_id && <Num>· {labels[o.table_id] ?? ''}</Num>}
            </span>
            <span className="text-sm text-muted">
              {time(o.opened_at)} · <Num>{o.items}</Num> {t.orders.items}
            </span>
            <span className="text-sm text-brand-700">{t.orders.resume} →</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type Invoice = Awaited<ReturnType<Runtime['pos']['invoice']>>;

export function SalesScreen({ runtime, afterRefund }: { runtime: Runtime; afterRefund: () => void }) {
  const { t, money, time } = useI18n();
  const ui = useUi();
  const [rows, setRows] = useState<Awaited<ReturnType<Runtime['pos']['history']>>>([]);
  const [refunding, setRefunding] = useState<Invoice | null>(null);
  const load = useCallback(() => runtime.pos.history(100).then(setRows, ui.fail), [runtime, ui]);
  useEffect(() => void load(), [load]);
  if (rows.length === 0) return <p className="p-8 text-center text-muted">{t.sales.empty}</p>;
  return (
    <div className="h-full overflow-y-auto p-4">
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <Num className="font-semibold">{r.number}</Num>
            <span className="text-sm text-muted">{time(r.issued_at)}</span>
            <span
              className={`rounded-full px-2 text-xs ${r.sync_status === 'acked' ? 'bg-brand-50 text-brand-700' : r.sync_status === 'rejected' ? 'bg-red-50 text-danger' : 'bg-amber-50 text-warning'}`}
            >
              {t.sales.sync[r.sync_status] ?? r.sync_status}
            </span>
            <Num className="ms-auto font-semibold">{money(r.total)}</Num>
            <Button variant="secondary" onClick={() => void runtime.pos.reprint(r.id).catch(ui.fail)}>
              {t.sales.reprint}
            </Button>
            <Button variant="secondary" onClick={() => void runtime.pos.invoice(r.id).then(setRefunding, ui.fail)}>
              {t.sales.refund}
            </Button>
          </li>
        ))}
      </ul>
      {refunding && (
        <RefundModal
          runtime={runtime}
          invoice={refunding}
          onClose={() => setRefunding(null)}
          done={() => {
            setRefunding(null);
            afterRefund();
            void load();
          }}
        />
      )}
    </div>
  );
}

function RefundModal({
  runtime,
  invoice,
  onClose,
  done,
}: {
  runtime: Runtime;
  invoice: Invoice;
  onClose: () => void;
  done: () => void;
}) {
  const { t, name, money } = useI18n();
  const ui = useUi();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [methods, setMethods] = useState<Awaited<ReturnType<Runtime['pos']['paymentMethods']>>>([]);
  const [methodId, setMethodId] = useState('');
  useEffect(() => {
    void runtime.pos.paymentMethods().then((m) => {
      setMethods(m);
      setMethodId(m[0]?.id ?? '');
    }, ui.fail);
  }, [runtime, ui]);
  const lines = Object.entries(qty)
    .filter(([, q]) => /^\d+(\.\d+)?$/.test(q) && Number(q) > 0)
    .map(([lineNo, q]) => ({ lineNo: Number(lineNo), qty: q }));
  const submit = async () => {
    try {
      const res = await ui.withApproval('sales.refund', async (approval) => {
        if (!approval) throw Object.assign(new Error('approval'), { code: 'approval_required' });
        return runtime.pos.refund(invoice.id, lines, { reason: reason.trim(), approval, paymentMethodId: methodId });
      });
      if (res) {
        ui.toast(`${t.sales.refund} ${res.number}: ${money(res.total)}`);
        done();
      }
    } catch (err) {
      ui.fail(err);
    }
  };
  return (
    <Modal title={`${t.sales.refundTitle} ${invoice.number}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-line">
          {invoice.lines.map((l) => (
            <li key={l.lineNo} className="flex flex-wrap items-center gap-3 py-2">
              <span className="flex-1">
                <Num>{Number(l.qty)}</Num> × {name(l)} · <Num>{money(l.grossAmount)}</Num>
                {Number(l.refundedQty) > 0 && (
                  <span className="ms-2 text-xs text-warning">
                    ↩ <Num>{l.refundedQty}</Num>
                  </span>
                )}
              </span>
              <Input
                aria-label={t.sales.refundQty}
                dir="ltr"
                inputMode="decimal"
                className="w-24"
                placeholder="0"
                value={qty[l.lineNo] ?? ''}
                onChange={(e) => setQty({ ...qty, [l.lineNo]: e.target.value })}
              />
            </li>
          ))}
        </ul>
        <Field label={t.sales.reason}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label={t.sales.method}>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <Button
                key={m.id}
                variant={methodId === m.id ? 'primary' : 'secondary'}
                onClick={() => setMethodId(m.id)}
              >
                {name(m)}
              </Button>
            ))}
          </div>
        </Field>
        <Button
          size="lg"
          disabled={!lines.length || reason.trim().length < 2 || !methodId}
          onClick={() => void submit()}
        >
          {t.sales.submit}
        </Button>
      </div>
    </Modal>
  );
}

/** Cash drawer: open with a float, pay-ins/outs (manager approval when needed), blind close. */
export function CashScreen({ runtime, afterChange }: { runtime: Runtime; afterChange: () => void }) {
  const { t, money, time } = useI18n();
  const ui = useUi();
  const [summary, setSummary] = useState<CashSessionSummary | null | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'open' | 'pay_in' | 'pay_out' | 'close' | null>(null);
  const [reason, setReason] = useState('');
  const load = useCallback(
    () =>
      runtime.pos
        .sessionSummary()
        .then(setSummary, (err: { code?: string }) =>
          err.code === 'no_cash_session' ? setSummary(null) : ui.fail(err),
        ),
    [runtime, ui],
  );
  useEffect(() => void load(), [load]);
  const finish = async (fn: () => Promise<unknown>) => {
    try {
      const res = await fn();
      if (res === undefined) return;
      setMode(null);
      setAmount('');
      setReason('');
      afterChange();
      await load();
    } catch (err) {
      ui.fail(err);
    }
  };
  const submit = () => {
    if (mode === 'open') return finish(() => runtime.pos.openCashSession(fromCents(cents(amount))));
    if (mode === 'close')
      return finish(async () => {
        const r = await runtime.pos.closeCashSession(fromCents(cents(amount)));
        ui.toast(`${t.cash.closedDone} · ${t.cash.variance}: ${money(r.variance)}`);
        return r;
      });
    const kind = mode!;
    return finish(() =>
      ui.withApproval('pos.cash_movement', (a) =>
        runtime.pos.cashMovement(kind, fromCents(cents(amount)), reason.trim(), a),
      ),
    );
  };
  if (summary === undefined) return null;
  const row = (label: string, v: string) => (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-end">
        <Num>{money(v)}</Num>
      </dd>
    </>
  );
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      {summary === null ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-white p-6 text-center">
          <p className="text-muted">{t.cash.closed}</p>
          <Button size="lg" onClick={() => setMode('open')}>
            {t.cash.open}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">
            {t.cash.session} ·{' '}
            <span className="text-sm font-normal text-muted">
              {t.cash.openedAt} {time(summary.openedAt)}
            </span>
          </h2>
          <dl className="grid grid-cols-2 gap-y-1">
            {row(t.cash.float, summary.openingFloat)}
            {row(t.cash.sales, summary.cashSales)}
            {row(t.cash.refunds, summary.cashRefunds)}
            {row(t.cash.payIns, summary.payIns)}
            {row(t.cash.payOuts, summary.payOuts)}
            <dt className="font-semibold">{t.cash.expected}</dt>
            <dd className="text-end font-semibold">
              <Num>{money(summary.expectedCash)}</Num>
            </dd>
          </dl>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => setMode('pay_in')}>
              {t.cash.payIn}
            </Button>
            <Button variant="secondary" onClick={() => setMode('pay_out')}>
              {t.cash.payOut}
            </Button>
            <Button variant="danger" onClick={() => setMode('close')}>
              {t.cash.close}
            </Button>
          </div>
        </div>
      )}
      {mode && (
        <Modal
          title={
            mode === 'open'
              ? t.cash.open
              : mode === 'close'
                ? t.cash.close
                : mode === 'pay_in'
                  ? t.cash.payIn
                  : t.cash.payOut
          }
          onClose={() => setMode(null)}
        >
          <div className="flex flex-col gap-4">
            <Field label={mode === 'open' ? t.cash.float : mode === 'close' ? t.cash.counted : t.cash.amount}>
              <Input dir="ltr" readOnly className="text-center text-2xl" value={amount} />
            </Field>
            <Keypad value={amount} onChange={setAmount} decimal />
            {(mode === 'pay_in' || mode === 'pay_out') && (
              <Field label={t.cash.reason}>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
            <Button
              size="lg"
              disabled={!isMoney(amount) || (mode !== 'open' && mode !== 'close' && reason.trim().length < 2)}
              onClick={() => void submit()}
            >
              {t.confirm}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
