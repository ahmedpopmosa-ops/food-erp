import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import type { PaymentInput, SellableItem } from '@ros/pos-core';
import type { Channel, DiscountSpec } from '@ros/domain';
import { useI18n } from './i18n';
import type { Runtime } from './runtime';
import { Button, Field, Input, Keypad, Modal, Num, useUi } from './ui';
import { cents, fromCents, isMoney, percentToFraction } from './money';

type Order = Awaited<ReturnType<Runtime['pos']['order']>>;
type Line = Order['lines'][number];
type Totals = Awaited<ReturnType<Runtime['pos']['quote']>>;
type Method = Awaited<ReturnType<Runtime['pos']['paymentMethods']>>[number];

export function SellScreen({
  runtime,
  orderId,
  setOrderId,
  afterSale,
  goTables,
}: {
  runtime: Runtime;
  orderId: string | null;
  setOrderId: (id: string | null) => void;
  afterSale: () => void;
  goTables: () => void;
}) {
  const { t, name, money } = useI18n();
  const ui = useUi();
  const pos = runtime.pos;
  const [channel, setChannel] = useState<Channel>('takeaway');
  const [menu, setMenu] = useState<SellableItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; nameAr: string; nameEn: string; image: string | null }[]>(
    [],
  );
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const [picking, setPicking] = useState<SellableItem | null>(null);
  const [lineMenu, setLineMenu] = useState<Line | null>(null);
  const [paying, setPaying] = useState(false);
  const [askReason, setAskReason] = useState<{ title: string; run: (reason: string) => Promise<void> } | null>(null);
  const [discountFor, setDiscountFor] = useState<{ line: Line | null } | null>(null);

  const activeChannel = order?.channel ?? channel;
  useEffect(() => {
    void Promise.all([pos.menu(activeChannel), pos.categories()]).then(([m, c]) => {
      setMenu(m);
      setCategories(c.filter((x) => m.some((i) => i.categoryId === x.id)));
    }, ui.fail);
  }, [pos, activeChannel, ui]);

  const reload = useCallback(async () => {
    if (!orderId) {
      setOrder(null);
      setTotals(null);
      setTable(null);
      return;
    }
    const o = await pos.order(orderId);
    if (o.status !== 'open') {
      setOrderId(null);
      return;
    }
    setOrder(o);
    setTotals(o.lines.some((l) => l.status !== 'voided') ? await pos.quote(orderId) : null);
    setTable(o.tableId ? ((await pos.refs.get<{ label: string }>('dining_table', o.tableId))?.label ?? null) : null);
  }, [pos, orderId, setOrderId]);
  useEffect(() => {
    reload().catch(ui.fail);
  }, [reload, ui]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      ui.fail(err);
    }
    await reload().catch(ui.fail);
  };

  const ensureOrder = async () => {
    if (orderId) return orderId;
    if (channel === 'dine_in') {
      goTables();
      return null;
    }
    const id = await pos.openOrder(channel);
    setOrderId(id);
    return id;
  };

  const add = (item: SellableItem, modifierIds: string[] = []) =>
    run(async () => {
      const id = await ensureOrder();
      if (id) await pos.addItem(id, item.variantId, '1', { modifierIds });
    });

  const tap = (item: SellableItem) => (item.modifierGroups.length ? setPicking(item) : void add(item));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Menu order: by category (its configured order), then by name.
    const rank = new Map(categories.map((c, i) => [c.id, i]));
    return menu
      .filter(
        (i) =>
          (!category || i.categoryId === category) &&
          (!q || i.nameAr.toLowerCase().includes(q) || i.nameEn.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) => (rank.get(a.categoryId) ?? 1e9) - (rank.get(b.categoryId) ?? 1e9) || name(a).localeCompare(name(b)),
      );
  }, [menu, categories, category, search, name]);

  const live = order?.lines.filter((l) => l.status !== 'voided') ?? [];
  const pending = order?.lines.some((l) => l.status === 'pending');
  const lineTotal = (l: Line) => totals?.lines.find((x) => x.lineKey === String(l.lineNo));

  const tone = (categoryId: string | null) =>
    TONES[
      Math.max(
        0,
        categories.findIndex((c) => c.id === categoryId),
      ) % TONES.length
    ]!;
  const count = live.reduce((s, l) => s + Number(l.qty), 0);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Menu (min-w-0: the scrolling category row must not widen the column) */}
      <section className="flex min-h-0 min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-48 flex-1">
            <Icon
              name="search"
              size={20}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              className="ps-11"
              placeholder={t.sell.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {!order && (
            <div role="radiogroup" className="flex rounded-xl border border-line bg-white p-1">
              {(['takeaway', 'dine_in', 'delivery'] as Channel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={channel === c}
                  onClick={() => setChannel(c)}
                  className={`min-h-10 rounded-lg px-4 text-sm font-medium transition ${
                    channel === c ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t.channels[c]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: '', label: t.sell.all, dot: 'bg-ink' },
            ...categories.map((c) => ({ id: c.id, label: name(c), dot: tone(c.id).dot })),
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition ${
                category === c.id ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-muted'
              }`}
            >
              <span className={`size-2.5 rounded-full ${c.dot}`} />
              {c.label}
            </button>
          ))}
        </div>
        {menu.length === 0 ? (
          <p className="p-6 text-center text-muted">{t.sell.empty}</p>
        ) : (
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visible.map((i) => {
              const c = tone(i.categoryId);
              const image = categories.find((x) => x.id === i.categoryId)?.image;
              const inCart = live.filter((l) => l.variantId === i.variantId).reduce((s, l) => s + Number(l.qty), 0);
              return (
                <button
                  key={i.variantId}
                  type="button"
                  onClick={() => tap(i)}
                  className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white text-start shadow-xs transition hover:shadow-md active:scale-[0.97]"
                >
                  {image ? (
                    <img src={image} alt="" draggable={false} className="h-24 w-full object-cover" />
                  ) : (
                    <span className={`grid h-24 place-items-center text-3xl font-bold ${c.tile}`}>
                      {name(i).trim().charAt(0)}
                    </span>
                  )}
                  <span className="flex flex-1 flex-col justify-between gap-2 p-3">
                    <span className="line-clamp-2 leading-snug font-semibold">{name(i)}</span>
                    <span className="flex items-center justify-between">
                      <Num className="font-bold text-brand-700">{money(i.price)}</Num>
                      {i.modifierGroups.length > 0 && <Icon name="plus" size={16} className="text-muted" />}
                    </span>
                  </span>
                  {inCart > 0 && (
                    <span className="num absolute end-2 top-2 grid min-w-7 place-items-center rounded-full bg-brand-600 px-1.5 py-0.5 text-sm font-bold text-white shadow">
                      {inCart}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Cart */}
      <aside className="flex min-h-0 flex-col border-line bg-white lg:border-s">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <p className="font-semibold">{t.sell.current}</p>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-ink">
                {t.channels[activeChannel]}
              </span>
              {table && (
                <span>
                  {t.sell.table} <Num>{table}</Num>
                </span>
              )}
              {count > 0 && <span>· {t.sell.items(count)}</span>}
            </p>
          </div>
          {order && (
            <Button variant="secondary" onClick={() => setOrderId(null)}>
              <Icon name="pause" size={18} />
              {t.sell.park}
            </Button>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          {!order || order.lines.length === 0 ? (
            <li className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted">
              <Icon name="sell" size={40} className="opacity-40" />
              {t.sell.cartEmpty}
            </li>
          ) : (
            order.lines.map((l) => (
              <li key={l.lineNo}>
                <button
                  type="button"
                  disabled={l.status === 'voided'}
                  onClick={() => setLineMenu(l)}
                  className={`flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start ${l.status === 'voided' ? 'text-muted line-through opacity-60' : 'hover:bg-surface'}`}
                >
                  <span className="num grid size-8 shrink-0 place-items-center rounded-lg bg-surface font-bold">
                    {Number(l.qty)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{name(l)}</span>
                    {l.modifiers.length > 0 && (
                      <span className="block text-sm text-muted">{l.modifiers.map((m) => name(m)).join('، ')}</span>
                    )}
                    <span className="mt-1 flex gap-1">
                      <span className={`rounded-full px-2 text-xs ${STATUS_TONE[l.status] ?? 'bg-surface text-muted'}`}>
                        {t.sell.status[l.status]}
                      </span>
                      {l.discount && (
                        <span className="rounded-full bg-amber-50 px-2 text-xs text-warning">{t.sell.discount}</span>
                      )}
                    </span>
                  </span>
                  <Num className="font-semibold">{lineTotal(l) ? money(lineTotal(l)!.grossAmount) : ''}</Num>
                </button>
              </li>
            ))
          )}
        </ul>
        {totals && (
          <dl className="mx-3 grid grid-cols-2 gap-y-1 rounded-xl bg-surface px-4 py-3 text-sm">
            <dt className="text-muted">{t.sell.subtotal}</dt>
            <dd className="text-end">
              <Num>{money(totals.subtotal)}</Num>
            </dd>
            {cents(totals.discountTotal) > 0n && (
              <>
                <dt className="text-muted">{t.sell.discount}</dt>
                <dd className="text-end">
                  <Num>−{money(totals.discountTotal)}</Num>
                </dd>
              </>
            )}
            {cents(totals.serviceChargeTotal) > 0n && (
              <>
                <dt className="text-muted">{t.sell.service}</dt>
                <dd className="text-end">
                  <Num>{money(totals.serviceChargeTotal)}</Num>
                </dd>
              </>
            )}
            <dt className="text-muted">{t.sell.tax}</dt>
            <dd className="text-end">
              <Num>{money(totals.taxTotal)}</Num>
            </dd>
            <dt className="mt-1 border-t border-line pt-2 text-lg font-bold">{t.sell.total}</dt>
            <dd className="mt-1 border-t border-line pt-2 text-end text-lg font-bold">
              <Num>{money(totals.total)}</Num>
            </dd>
          </dl>
        )}
        <div className="flex flex-col gap-2 p-3">
          <div className="grid grid-cols-3 gap-2">
            <ActionButton icon="kitchen" disabled={!pending} onClick={() => run(() => pos.sendToKitchen(orderId!))}>
              {t.sell.kitchen}
            </ActionButton>
            <ActionButton icon="percent" disabled={!live.length} onClick={() => setDiscountFor({ line: null })}>
              {t.sell.orderDiscount}
            </ActionButton>
            <ActionButton
              icon="trash"
              danger
              disabled={!order}
              onClick={() =>
                setAskReason({
                  title: t.sell.cancelOrder,
                  run: async (reason) => {
                    await ui.withApproval('pos.void_sent_item', (a) => pos.cancelOrder(orderId!, reason, a));
                    setOrderId(null);
                  },
                })
              }
            >
              {t.sell.cancelOrder}
            </ActionButton>
          </div>
          <button
            type="button"
            disabled={!totals}
            onClick={() => setPaying(true)}
            className="flex min-h-16 items-center justify-between rounded-xl bg-brand-600 px-5 text-xl font-bold text-white transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-40"
          >
            <span>{t.sell.pay}</span>
            <Num>{totals ? money(totals.total) : ''}</Num>
          </button>
        </div>
      </aside>

      {picking && (
        <ModifierModal
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(ids) => {
            setPicking(null);
            void add(picking, ids);
          }}
        />
      )}
      {lineMenu && order && (
        <Modal title={`${Number(lineMenu.qty)} × ${name(lineMenu)}`} onClose={() => setLineMenu(null)}>
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setDiscountFor({ line: lineMenu });
                setLineMenu(null);
              }}
            >
              {t.sell.lineDiscount}
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                const l = lineMenu;
                setLineMenu(null);
                setAskReason({
                  title: t.sell.void,
                  run: async (reason) => {
                    await ui.withApproval(l.status === 'sent' ? 'pos.void_sent_item' : 'pos.void_item', (a) =>
                      pos.voidItem(orderId!, l.lineNo, reason, a),
                    );
                  },
                });
              }}
            >
              {t.sell.void}
            </Button>
          </div>
        </Modal>
      )}
      {discountFor && orderId && (
        <DiscountModal
          title={discountFor.line ? t.sell.lineDiscount : t.sell.orderDiscount}
          onClose={() => setDiscountFor(null)}
          onApply={(spec) => {
            const target = discountFor.line;
            setDiscountFor(null);
            void run(() =>
              ui.withApproval('pos.discount_over_limit', (a) =>
                target
                  ? pos.setLineDiscount(orderId, target.lineNo, spec, a)
                  : pos.setOrderDiscount(orderId, spec, spec ? 'Discount at the till' : null, a),
              ),
            );
          }}
        />
      )}
      {askReason && (
        <ReasonModal
          title={askReason.title}
          onClose={() => setAskReason(null)}
          onSubmit={(reason) => {
            const job = askReason;
            setAskReason(null);
            void run(() => job.run(reason));
          }}
        />
      )}
      {paying && totals && orderId && (
        <PaymentModal
          runtime={runtime}
          total={totals.total}
          onClose={() => setPaying(false)}
          onPay={async (payments) => {
            await pos.finalize(orderId, payments);
            setPaying(false);
            setOrderId(null);
            afterSale();
          }}
        />
      )}
    </div>
  );
}

/** Category colours for menu tiles (assigned by category order, so a category keeps its colour). */
const TONES = [
  { tile: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  { tile: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  { tile: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  { tile: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  { tile: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  { tile: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  { tile: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' },
  { tile: 'bg-lime-50 text-lime-700', dot: 'bg-lime-500' },
];

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-warning',
  sent: 'bg-sky-50 text-sky-700',
  voided: 'bg-surface text-muted',
};

function ActionButton({
  icon,
  danger,
  children,
  ...props
}: { icon: IconName; danger?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-medium transition active:scale-[0.97] disabled:opacity-40 ${
        danger ? 'border-red-200 text-danger hover:bg-red-50' : 'border-line text-ink hover:bg-surface'
      }`}
    >
      <Icon name={icon} size={22} />
      {children}
    </button>
  );
}

function ModifierModal({
  item,
  onClose,
  onAdd,
}: {
  item: SellableItem;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const { t, name, money } = useI18n();
  const [chosen, setChosen] = useState<string[]>([]);
  const valid = item.modifierGroups.every((g) => {
    const n = g.modifiers.filter((m) => chosen.includes(m.id)).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
  const toggle = (groupId: string, id: string) => {
    const g = item.modifierGroups.find((x) => x.id === groupId)!;
    if (chosen.includes(id)) return setChosen(chosen.filter((x) => x !== id));
    const inGroup = g.modifiers.filter((m) => chosen.includes(m.id)).map((m) => m.id);
    // A single-choice group swaps its choice; a multi-choice group stops at its maximum.
    if (g.maxSelect === 1) return setChosen([...chosen.filter((x) => !inGroup.includes(x)), id]);
    if (inGroup.length < g.maxSelect) setChosen([...chosen, id]);
  };
  return (
    <Modal title={name(item)} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {item.modifierGroups.map((g) => (
          <fieldset key={g.id} className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">
              {name(g)} <span className="text-sm text-muted">· {t.sell.choose(g.minSelect, g.maxSelect)}</span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {g.modifiers.map((m) => (
                <Button
                  key={m.id}
                  variant={chosen.includes(m.id) ? 'primary' : 'secondary'}
                  onClick={() => toggle(g.id, m.id)}
                >
                  {name(m)}
                  {cents(m.priceDelta) !== 0n && <Num className="text-sm opacity-80">+{money(m.priceDelta)}</Num>}
                </Button>
              ))}
            </div>
          </fieldset>
        ))}
        <Button size="lg" disabled={!valid} onClick={() => onAdd(chosen)}>
          {t.sell.add}
        </Button>
      </div>
    </Modal>
  );
}

function DiscountModal({
  title,
  onClose,
  onApply,
}: {
  title: string;
  onClose: () => void;
  onApply: (d: DiscountSpec | null) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const spec: DiscountSpec | null =
    kind === 'percent'
      ? (() => {
          const f = percentToFraction(value);
          return f ? { kind: 'percent', value: f } : null;
        })()
      : isMoney(value) && cents(value) > 0n
        ? { kind: 'amount', value: fromCents(cents(value)) }
        : null;
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={kind === 'percent' ? 'primary' : 'secondary'} onClick={() => setKind('percent')}>
            {t.sell.percent}
          </Button>
          <Button variant={kind === 'amount' ? 'primary' : 'secondary'} onClick={() => setKind('amount')}>
            {t.sell.amount}
          </Button>
        </div>
        <Input dir="ltr" readOnly className="text-center text-2xl" value={value} />
        <Keypad value={value} onChange={setValue} decimal />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" onClick={() => onApply(null)}>
            {t.sell.removeDiscount}
          </Button>
          <Button disabled={!spec} onClick={() => onApply(spec)}>
            {t.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReasonModal({
  title,
  onClose,
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label={t.sales.reason}>
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button size="lg" disabled={reason.trim().length < 2} onClick={() => onSubmit(reason.trim())}>
          {t.confirm}
        </Button>
      </div>
    </Modal>
  );
}

/** Likely notes handed over: the amount rounded up to the next 10, 50, 100 and 200 (in cents, distinct, above it). */
function quickCash(remaining: bigint) {
  const up = (step: bigint) => ((remaining + step - 1n) / step) * step;
  const out = [1_000n, 5_000n, 10_000n, 20_000n].map(up).filter((v) => v > remaining);
  return [...new Set(out)].slice(0, 3);
}

/** Split tender: payments are added until nothing remains; cash may be over-tendered (change). */
function PaymentModal({
  runtime,
  total,
  onClose,
  onPay,
}: {
  runtime: Runtime;
  total: string;
  onClose: () => void;
  onPay: (payments: PaymentInput[]) => Promise<void>;
}) {
  const { t, name, money } = useI18n();
  const ui = useUi();
  const [methods, setMethods] = useState<Method[]>([]);
  const [payments, setPayments] = useState<(PaymentInput & { label: string; applied: bigint })[]>([]);
  const [method, setMethod] = useState<Method | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void runtime.pos.paymentMethods().then((m) => {
      setMethods(m);
      setMethod(m[0] ?? null);
    }, ui.fail);
  }, [runtime, ui]);
  const remaining = cents(total) - payments.reduce((s, p) => s + p.applied, 0n);
  const isCash = method?.kind === 'cash';
  const entered = isMoney(value) ? cents(value) : 0n;
  // Change still to hand back: from cash already taken, plus what the amount being typed would leave over.
  const owed = payments.reduce((s, p) => s + (p.tendered ? cents(p.tendered) - p.applied : 0n), 0n);
  const change = owed + (isCash && entered > remaining && remaining > 0n ? entered - remaining : 0n);
  const canAdd =
    !!method && remaining > 0n && (isCash ? entered > 0n : entered === 0n || (entered > 0n && entered <= remaining));

  const addPayment = () => {
    if (!method) return;
    const applied = isCash ? (entered > remaining ? remaining : entered) : entered > 0n ? entered : remaining;
    setPayments([
      ...payments,
      {
        paymentMethodId: method.id,
        label: name(method),
        applied,
        ...(isCash ? { tendered: fromCents(entered) } : { amount: fromCents(applied) }),
      },
    ]);
    setValue('');
  };

  const finish = async () => {
    setBusy(true);
    try {
      await onPay(payments.map(({ paymentMethodId, tendered, amount }) => ({ paymentMethodId, tendered, amount })));
    } catch (err) {
      ui.fail(err);
      setBusy(false);
    }
  };

  return (
    <Modal title={t.pay.title} onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-3xl font-bold">
            <Num>{money(fromCents(remaining > 0n ? remaining : 0n))}</Num>
            <span className="ms-2 text-sm font-normal text-muted">{t.pay.remaining}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <Button key={m.id} variant={method?.id === m.id ? 'primary' : 'secondary'} onClick={() => setMethod(m)}>
                {name(m)}
              </Button>
            ))}
          </div>
          {payments.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg bg-surface p-3 text-sm">
              {payments.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span>{p.label}</span>
                  <Num>{money(fromCents(p.applied))}</Num>
                </li>
              ))}
            </ul>
          )}
          {change > 0n && (
            <p className="flex items-center justify-between rounded-xl bg-brand-50 p-4 text-2xl font-bold text-brand-700">
              <span className="text-base">{t.pay.change}</span>
              <Num>{money(fromCents(change))}</Num>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Field label={isCash ? t.pay.tendered : t.sell.amount}>
            <Input
              dir="ltr"
              readOnly
              className="text-center text-2xl"
              value={value}
              placeholder={isCash ? '' : fromCents(remaining)}
            />
          </Field>
          <Keypad value={value} onChange={setValue} decimal />
          {isCash && remaining > 0n && (
            <div className="grid grid-cols-2 gap-2" aria-label={t.pay.quick}>
              <Button variant="secondary" onClick={() => setValue(fromCents(remaining))}>
                {t.pay.exact}
              </Button>
              {quickCash(remaining).map((v) => (
                <Button key={String(v)} variant="secondary" onClick={() => setValue(fromCents(v))}>
                  <Num>{money(fromCents(v))}</Num>
                </Button>
              ))}
            </div>
          )}
          {remaining > 0n ? (
            <Button size="lg" disabled={!canAdd} onClick={addPayment}>
              {t.pay.addPayment}
            </Button>
          ) : (
            <Button size="lg" disabled={busy} onClick={finish}>
              ✓ {t.pay.finish}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
