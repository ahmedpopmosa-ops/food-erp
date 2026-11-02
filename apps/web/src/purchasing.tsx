import { useState, type ReactNode } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldErrors, useIdempotencyKey } from './api';
import { useI18n } from './i18n';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Input, Loading, Select, Table, Td } from './ui';
import {
  cents,
  emptyLine,
  FormError,
  fromCents,
  isMoney,
  isPositive,
  LinesEditor,
  Num,
  percentOf,
  StatusBadge,
  subtractQty,
  Tabs,
  useItems,
  useWarehouses,
  type Item,
  type LineDraft,
} from './stock-ui';

type Go = (path: string) => void;
type Can = (permission: string) => boolean;

interface Supplier {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  taxNumber: string | null;
  phone: string | null;
  email: string | null;
  paymentTermsDays: number;
}
interface OrderLine {
  id: string;
  itemId: string;
  qty: string;
  unit: string;
  qtyBase: string;
  unitPrice: string;
  qtyReceivedBase: string;
}
interface Order {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  status: string;
  expectedDate: string | null;
  total: string;
  createdAt: string;
  lines?: OrderLine[];
}
interface ReceiptLine {
  id: string;
  itemId: string;
  qty: string;
  unit: string;
  qtyBase: string;
  unitPrice: string;
  goodsValue: string;
  chargesValue: string;
  qtyInvoicedBase: string;
  qtyReturnedBase: string;
}
interface Receipt {
  id: string;
  number: string;
  supplierId: string;
  orderId: string | null;
  warehouseId: string;
  supplierRef: string | null;
  goodsTotal: string;
  chargesTotal: string;
  receivedAt: string;
  lines?: ReceiptLine[];
}
interface SupplierInvoice {
  id: string;
  number: string;
  supplierId: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  status: string;
  openAmount?: string;
  lines?: {
    id: string;
    receiptLineId: string | null;
    accountId: string | null;
    itemId: string | null;
    description: string | null;
    qtyBase: string | null;
    amount: string;
    taxAmount: string;
    grniCleared: string;
    priceVariance: string;
  }[];
}
interface Payment {
  id: string;
  number: string;
  supplierId: string;
  method: string;
  amount: string;
  reference: string | null;
  paidAt: string;
  allocations: { invoiceId: string; amount: string }[];
}
interface SupplierReturn {
  id: string;
  number: string;
  receiptId: string;
  warehouseId: string;
  reason: string;
  createdAt: string;
}
interface Statement {
  supplier: Supplier;
  invoices: (SupplierInvoice & { openAmount: string })[];
  payments: Payment[];
  balance: string;
  uninvoicedValue: string;
}
interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isPostable: boolean;
  isControl: boolean;
}

const useSuppliers = () =>
  useQuery({ queryKey: ['suppliers'], queryFn: () => api<Supplier[]>('/purchasing/suppliers') });
const today = () => new Date().toISOString().slice(0, 10);
const ymd = (iso: string) => iso.slice(0, 10);

export function PurchasingPage({ tab, id, go, can }: { tab?: string; id?: string; go: Go; can: Can }) {
  const { t } = useI18n();
  const current = tab || 'orders';
  const payables = can('suppliers.payments');
  const tabs = (Object.keys(t.purchasing.tabs) as (keyof typeof t.purchasing.tabs)[])
    .filter((k) => payables || (k !== 'invoices' && k !== 'payments'))
    .map((key) => ({ key, label: t.purchasing.tabs[key], href: `#/purchasing/${key}` }));
  const back = (to: string) => () => go(`/purchasing/${to}`);
  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} current={current} />
      {current === 'suppliers' ? (
        id ? (
          <SupplierStatement key={id} id={id} back={back('suppliers')} />
        ) : (
          <SuppliersTab go={go} can={can} />
        )
      ) : current === 'receipts' ? (
        id ? (
          <ReceiptDetail key={id} id={id} back={back('receipts')} can={can} />
        ) : (
          <ReceiptsTab go={go} can={can} />
        )
      ) : current === 'invoices' && payables ? (
        id ? (
          <InvoiceDetail key={id} id={id} back={back('invoices')} />
        ) : (
          <InvoicesTab go={go} can={can} />
        )
      ) : current === 'payments' && payables ? (
        <PaymentsTab can={can} />
      ) : current === 'returns' ? (
        <ReturnsTab go={go} />
      ) : id ? (
        <OrderDetail key={id} id={id} back={back('orders')} go={go} can={can} />
      ) : (
        <OrdersTab go={go} can={can} />
      )}
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  const { locale } = useI18n();
  return (
    <div>
      <Button variant="ghost" onClick={onClick}>
        {locale === 'ar' ? '→' : '←'} {label}
      </Button>
    </div>
  );
}

function DocLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="num font-medium text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

function List<T>({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: T[]; refetch: () => unknown };
  empty: string;
  children: (rows: T[]) => ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data?.length) return <Empty>{empty}</Empty>;
  return <>{children(query.data)}</>;
}

/** Freight / handling lines for a receipt. */
function ChargesEditor({
  charges,
  onChange,
}: {
  charges: { description: string; amount: string }[];
  onChange: (c: { description: string; amount: string }[]) => void;
}) {
  const { t } = useI18n();
  const set = (i: number, patch: Partial<{ description: string; amount: string }>) =>
    onChange(charges.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t.purchasing.receipts.charges}</legend>
      {charges.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t.purchasing.receipts.chargeDesc}
            placeholder={t.purchasing.receipts.chargeDesc}
            value={c.description}
            onChange={(e) => set(i, { description: e.target.value })}
          />
          <Input
            aria-label={t.purchasing.receipts.amount}
            placeholder="0.00"
            dir="ltr"
            inputMode="decimal"
            className="w-32"
            value={c.amount}
            onChange={(e) => set(i, { amount: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={t.common.remove}
            onClick={() => onChange(charges.filter((_, j) => j !== i))}
          >
            ✕
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...charges, { description: '', amount: '' }])}
        >
          + {t.purchasing.receipts.addCharge}
        </Button>
      </div>
    </fieldset>
  );
}
const filledCharges = (c: { description: string; amount: string }[]) =>
  c
    .filter((x) => x.description.trim() || x.amount.trim())
    .map((x) => ({ description: x.description.trim(), amount: x.amount.trim() }));

// ── Suppliers ────────────────────────────────────────────────────────────────

function SuppliersTab({ go, can }: { go: Go; can: Can }) {
  const { t, name } = useI18n();
  const qc = useQueryClient();
  const suppliers = useSuppliers();
  const blank = { code: '', nameAr: '', nameEn: '', taxNumber: '', phone: '', email: '', paymentTermsDays: '0' };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const create = useMutation({
    mutationFn: () =>
      api('/purchasing/suppliers', {
        method: 'POST',
        body: {
          ...form,
          email: form.email.trim() || undefined,
          paymentTermsDays: Number.parseInt(form.paymentTermsDays || '0', 10),
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setForm(blank);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
  const errs = fieldErrors(create.error);
  const text = (key: keyof typeof form, label: string, ltr = false) => (
    <Field label={label} error={errs[key]}>
      <Input
        dir={ltr ? 'ltr' : undefined}
        inputMode={key === 'paymentTermsDays' ? 'numeric' : undefined}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={!!errs[key]}
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      {open && (
        <Card title={t.purchasing.suppliers.add}>
          <form
            className="grid gap-4 sm:grid-cols-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            {text('code', t.common.code, true)}
            {text('nameAr', t.products.nameAr)}
            {text('nameEn', t.products.nameEn, true)}
            {text('taxNumber', t.purchasing.suppliers.taxNumber, true)}
            {text('phone', t.purchasing.suppliers.phone, true)}
            {text('email', t.purchasing.suppliers.email, true)}
            {text('paymentTermsDays', t.purchasing.suppliers.terms, true)}
            <div className="sm:col-span-3">
              <FormError error={create.error} />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>
                {t.save}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title={t.purchasing.suppliers.title}
        actions={
          !open &&
          can('purchasing.manage') && <Button onClick={() => setOpen(true)}>{t.purchasing.suppliers.add}</Button>
        }
      >
        <List query={suppliers} empty={t.purchasing.suppliers.empty}>
          {(rows) => (
            <Table head={[t.common.code, t.common.name, t.purchasing.suppliers.phone, t.purchasing.suppliers.terms]}>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className={can('suppliers.payments') ? 'cursor-pointer hover:bg-surface' : undefined}
                  onClick={() => can('suppliers.payments') && go(`/purchasing/suppliers/${s.id}`)}
                >
                  <Td>
                    {can('suppliers.payments') ? (
                      <DocLink href={`#/purchasing/suppliers/${s.id}`}>{s.code}</DocLink>
                    ) : (
                      <Num>{s.code}</Num>
                    )}
                  </Td>
                  <Td>{name(s)}</Td>
                  <Td>
                    <Num>{s.phone ?? '—'}</Num>
                  </Td>
                  <Td>
                    <Num>{s.paymentTermsDays}</Num>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </List>
      </Card>
    </div>
  );
}

function SupplierStatement({ id, back }: { id: string; back: () => void }) {
  const { t, name, money, date } = useI18n();
  const st = useQuery({
    queryKey: ['statement', id],
    queryFn: () => api<Statement>(`/purchasing/suppliers/${id}/statement`),
  });
  if (st.isPending) return <Loading />;
  if (st.isError) return <ErrorState error={st.error} onRetry={() => st.refetch()} />;
  const s = st.data;
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.purchasing.suppliers.back} />
      <Card title={`${s.supplier.code} — ${name(s.supplier)}`}>
        <dl className="grid max-w-md grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">{t.purchasing.suppliers.balance}</dt>
          <dd className="num text-end font-semibold">{money(s.balance)}</dd>
          <dt className="text-muted">{t.purchasing.suppliers.uninvoiced}</dt>
          <dd className="num text-end">{money(s.uninvoicedValue)}</dd>
          <dt className="text-muted">{t.purchasing.suppliers.terms}</dt>
          <dd className="num text-end">{s.supplier.paymentTermsDays}</dd>
        </dl>
      </Card>
      <Card title={t.purchasing.invoices.title}>
        {s.invoices.length === 0 ? (
          <Empty>{t.purchasing.invoices.empty}</Empty>
        ) : (
          <Table
            head={[
              t.common.number,
              t.purchasing.invoices.supplierNo,
              t.common.date,
              t.purchasing.suppliers.due,
              t.common.total,
              t.purchasing.suppliers.openAmount,
              t.common.status,
            ]}
          >
            {s.invoices.map((i) => (
              <tr key={i.id}>
                <Td>
                  <DocLink href={`#/purchasing/invoices/${i.id}`}>{i.number}</DocLink>
                </Td>
                <Td>
                  <Num>{i.supplierInvoiceNo}</Num>
                </Td>
                <Td>{date(ymd(i.invoiceDate))}</Td>
                <Td>
                  {date(ymd(i.dueDate))}{' '}
                  {i.status === 'open' && ymd(i.dueDate) < today() && (
                    <Badge tone="danger">{t.purchasing.suppliers.overdue}</Badge>
                  )}
                </Td>
                <Td>
                  <Num>{money(i.total)}</Num>
                </Td>
                <Td>
                  <Num>{money(i.openAmount)}</Num>
                </Td>
                <Td>
                  <StatusBadge status={i.status} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title={t.purchasing.payments.title}>
        {s.payments.length === 0 ? <Empty>{t.purchasing.payments.empty}</Empty> : <PaymentsTable rows={s.payments} />}
      </Card>
    </div>
  );
}

// ── Purchase orders ──────────────────────────────────────────────────────────

function OrdersTab({ go, can }: { go: Go; can: Can }) {
  const { t, name, money, date } = useI18n();
  const qc = useQueryClient();
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<Order[]>('/purchasing/orders') });
  const suppliers = useSuppliers();
  const warehouses = useWarehouses();
  const items = useItems();
  const stockWarehouses = (warehouses.data ?? []).filter((w) => w.kind !== 'transit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplierId: '', warehouseId: '', expectedDate: '', notes: '' });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const create = useMutation({
    mutationFn: () =>
      api<Order>('/purchasing/orders', {
        method: 'POST',
        body: {
          supplierId: form.supplierId,
          warehouseId: form.warehouseId || stockWarehouses[0]?.id,
          expectedDate: form.expectedDate || undefined,
          notes: form.notes,
          lines: lines
            .filter((l) => l.itemId && l.qty.trim())
            .map((l) => ({ itemId: l.itemId, qty: l.qty.trim(), unit: l.unit, unitPrice: l.extra.trim() })),
        },
      }),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      go(`/purchasing/orders/${o.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  const supplier = (sid: string) => suppliers.data?.find((s) => s.id === sid);
  return (
    <div className="flex flex-col gap-4">
      {open && items.data && (
        <Card title={t.purchasing.orders.add}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.purchasing.orders.supplier} error={errs.supplierId}>
                <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">{t.common.choose}</option>
                  {suppliers.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {name(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.common.warehouse} error={errs.warehouseId}>
                <Select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                  {stockWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.purchasing.orders.expected} error={errs.expectedDate}>
                <Input
                  type="date"
                  dir="ltr"
                  value={form.expectedDate}
                  onChange={(e) => setForm({ ...form, expectedDate: e.target.value })}
                />
              </Field>
            </div>
            <LinesEditor
              lines={lines}
              onChange={setLines}
              items={items.data}
              extra={{ label: t.purchasing.orders.unitPrice, field: 'unitPrice' }}
              errors={errs}
            />
            <Field label={t.common.notes}>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <FormError error={create.error} />
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {t.create}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title={t.purchasing.orders.title}
        actions={
          !open && can('purchasing.manage') && <Button onClick={() => setOpen(true)}>{t.purchasing.orders.add}</Button>
        }
      >
        <List query={orders} empty={t.purchasing.orders.empty}>
          {(rows) => (
            <Table
              head={[
                t.common.number,
                t.purchasing.orders.supplier,
                t.common.warehouse,
                t.purchasing.orders.expected,
                t.common.total,
                t.common.status,
              ]}
            >
              {rows.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer hover:bg-surface"
                  onClick={() => go(`/purchasing/orders/${o.id}`)}
                >
                  <Td>
                    <DocLink href={`#/purchasing/orders/${o.id}`}>{o.number}</DocLink>
                  </Td>
                  <Td>{supplier(o.supplierId) ? name(supplier(o.supplierId)!) : '—'}</Td>
                  <Td>
                    <Num>{warehouses.data?.find((w) => w.id === o.warehouseId)?.code ?? '—'}</Num>
                  </Td>
                  <Td>{o.expectedDate ? date(ymd(o.expectedDate)) : '—'}</Td>
                  <Td>
                    <Num>{money(o.total)}</Num>
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </List>
      </Card>
    </div>
  );
}

function OrderDetail({ id, back, go, can }: { id: string; back: () => void; go: Go; can: Can }) {
  const { t, name, money, price, quantity, date } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const suppliers = useSuppliers();
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api<Order>(`/purchasing/orders/${id}`) });
  const [receiving, setReceiving] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [supplierRef, setSupplierRef] = useState('');
  const [charges, setCharges] = useState<{ description: string; amount: string }[]>([]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['order', id] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };
  const status = useMutation({
    mutationFn: (action: 'approve' | 'cancel') => api(`/purchasing/orders/${id}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const item = (itemId: string) => items.data?.find((i) => i.id === itemId);
  const remaining = (l: OrderLine) => subtractQty(l.qtyBase, l.qtyReceivedBase);
  const receiveKey = useIdempotencyKey();
  const receive = useMutation({
    mutationFn: (lines: OrderLine[]) =>
      api<Receipt>('/purchasing/receipts', {
        method: 'POST',
        idempotencyKey: receiveKey.key(),
        body: {
          orderId: id,
          supplierRef,
          charges: filledCharges(charges),
          lines: lines
            .map((l) => ({ l, qty: (qtys[l.id] ?? remaining(l)).trim() }))
            .filter((x) => isPositive(x.qty))
            .map((x) => ({ itemId: x.l.itemId, qty: x.qty, unit: item(x.l.itemId)!.baseUnit })),
        },
      }),
    onSuccess: (r) => {
      receiveKey.renew();
      refresh();
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      void qc.invalidateQueries({ queryKey: ['balances'] });
      go(`/purchasing/receipts/${r.id}`);
    },
  });
  if (order.isPending || items.isPending) return <Loading />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  const o = order.data;
  const lines = o.lines ?? [];
  const sup = suppliers.data?.find((s) => s.id === o.supplierId);
  const receivable = ['approved', 'partially_received'].includes(o.status) && can('inventory.manage');
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.purchasing.orders.back} />
      <Card title={`${t.purchasing.orders.one} ${o.number}`} actions={<StatusBadge status={o.status} />}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {sup ? `${sup.code} — ${name(sup)}` : ''}
            {o.expectedDate && (
              <>
                {' '}
                · {t.purchasing.orders.expected}: {date(ymd(o.expectedDate))}
              </>
            )}
          </p>
          <Table
            head={[
              t.common.item,
              t.purchasing.orders.ordered,
              t.purchasing.orders.unitPrice,
              t.purchasing.orders.received,
              ...(receiving ? [t.purchasing.receipts.receiveNow] : []),
            ]}
          >
            {lines.map((l) => {
              const it = item(l.itemId);
              return (
                <tr key={l.id}>
                  <Td>{it ? `${it.code} — ${name(it)}` : '—'}</Td>
                  <Td>
                    <Num>{quantity(l.qty, l.unit)}</Num>
                  </Td>
                  <Td>
                    <Num>{price(l.unitPrice)}</Num> / {t.units[l.unit] ?? l.unit}
                  </Td>
                  <Td>
                    <Num>{quantity(l.qtyReceivedBase, it?.baseUnit ?? '')}</Num>
                  </Td>
                  {receiving && (
                    <Td>
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`${t.purchasing.receipts.receiveNow} ${it?.code ?? ''}`}
                          dir="ltr"
                          inputMode="decimal"
                          className="w-28"
                          value={qtys[l.id] ?? remaining(l)}
                          onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })}
                        />
                        <span className="text-xs text-muted">{t.units[it?.baseUnit ?? ''] ?? ''}</span>
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </Table>
          <p className="text-sm">
            {t.common.total}: <Num>{money(o.total)}</Num>
          </p>
          {receiving && (
            <div className="flex flex-col gap-4 rounded-md border border-line p-4">
              <div className="max-w-xs">
                <Field label={t.purchasing.receipts.supplierRef}>
                  <Input dir="ltr" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
                </Field>
              </div>
              <ChargesEditor charges={charges} onChange={setCharges} />
            </div>
          )}
          <FormError error={status.error ?? receive.error} />
          <div className="flex flex-wrap gap-2">
            {o.status === 'draft' && can('purchasing.approve') && (
              <Button disabled={status.isPending} onClick={() => status.mutate('approve')}>
                {t.purchasing.orders.approve}
              </Button>
            )}
            {receivable &&
              (receiving ? (
                <>
                  <Button disabled={receive.isPending} onClick={() => receive.mutate(lines)}>
                    {t.purchasing.receipts.post}
                  </Button>
                  <Button variant="secondary" onClick={() => setReceiving(false)}>
                    {t.cancel}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setReceiving(true)}>{t.purchasing.orders.receive}</Button>
              ))}
            {['draft', 'approved'].includes(o.status) && can('purchasing.manage') && !receiving && (
              <Button variant="secondary" disabled={status.isPending} onClick={() => status.mutate('cancel')}>
                {t.purchasing.orders.cancelOrder}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Goods receipts & returns ─────────────────────────────────────────────────

function ReceiptsTab({ go, can }: { go: Go; can: Can }) {
  const { t, name, money, dateTime } = useI18n();
  const qc = useQueryClient();
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: () => api<Receipt[]>('/purchasing/receipts') });
  const suppliers = useSuppliers();
  const warehouses = useWarehouses();
  const items = useItems();
  const stockWarehouses = (warehouses.data ?? []).filter((w) => w.kind !== 'transit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplierId: '', warehouseId: '', supplierRef: '' });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [charges, setCharges] = useState<{ description: string; amount: string }[]>([]);
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: () =>
      api<Receipt>('/purchasing/receipts', {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: {
          supplierId: form.supplierId || undefined,
          warehouseId: form.warehouseId || stockWarehouses[0]?.id,
          supplierRef: form.supplierRef,
          charges: filledCharges(charges),
          lines: lines
            .filter((l) => l.itemId && l.qty.trim())
            .map((l) => ({
              itemId: l.itemId,
              qty: l.qty.trim(),
              unit: l.unit,
              unitPrice: l.extra.trim() || undefined,
            })),
        },
      }),
    onSuccess: (r) => {
      idem.renew();
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      void qc.invalidateQueries({ queryKey: ['balances'] });
      go(`/purchasing/receipts/${r.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  const supplier = (sid: string) => suppliers.data?.find((s) => s.id === sid);
  return (
    <div className="flex flex-col gap-4">
      {open && items.data && (
        <Card title={t.purchasing.receipts.add}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.purchasing.orders.supplier} error={errs.supplierId}>
                <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">{t.common.choose}</option>
                  {suppliers.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {name(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.common.warehouse}>
                <Select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                  {stockWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.purchasing.receipts.supplierRef}>
                <Input
                  dir="ltr"
                  value={form.supplierRef}
                  onChange={(e) => setForm({ ...form, supplierRef: e.target.value })}
                />
              </Field>
            </div>
            <LinesEditor
              lines={lines}
              onChange={setLines}
              items={items.data}
              extra={{ label: t.purchasing.orders.unitPrice, field: 'unitPrice' }}
              errors={errs}
            />
            <ChargesEditor charges={charges} onChange={setCharges} />
            <FormError error={create.error} />
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {t.purchasing.receipts.post}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title={t.purchasing.receipts.title}
        actions={
          !open && can('inventory.manage') && <Button onClick={() => setOpen(true)}>{t.purchasing.receipts.add}</Button>
        }
      >
        <List query={receipts} empty={t.purchasing.receipts.empty}>
          {(rows) => (
            <Table
              head={[
                t.common.number,
                t.common.date,
                t.purchasing.orders.supplier,
                t.common.warehouse,
                t.purchasing.receipts.goodsValue,
                t.purchasing.receipts.chargesValue,
              ]}
            >
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-surface"
                  onClick={() => go(`/purchasing/receipts/${r.id}`)}
                >
                  <Td>
                    <DocLink href={`#/purchasing/receipts/${r.id}`}>{r.number}</DocLink>
                  </Td>
                  <Td>{dateTime(r.receivedAt)}</Td>
                  <Td>{supplier(r.supplierId) ? name(supplier(r.supplierId)!) : '—'}</Td>
                  <Td>
                    <Num>{warehouses.data?.find((w) => w.id === r.warehouseId)?.code ?? '—'}</Num>
                  </Td>
                  <Td>
                    <Num>{money(r.goodsTotal)}</Num>
                  </Td>
                  <Td>
                    <Num>{money(r.chargesTotal)}</Num>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </List>
      </Card>
    </div>
  );
}

const openQty = (l: ReceiptLine) => subtractQty(l.qtyBase, l.qtyInvoicedBase, l.qtyReturnedBase);

function ReceiptDetail({ id, back, can }: { id: string; back: () => void; can: Can }) {
  const { t, name, money, price, quantity, dateTime } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const suppliers = useSuppliers();
  const receipt = useQuery({ queryKey: ['receipt', id], queryFn: () => api<Receipt>(`/purchasing/receipts/${id}`) });
  const [returning, setReturning] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const item = (itemId: string) => items.data?.find((i) => i.id === itemId);
  const idem = useIdempotencyKey();
  const ret = useMutation({
    mutationFn: () =>
      api('/purchasing/returns', {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: {
          receiptId: id,
          reason,
          lines: Object.entries(qtys)
            .filter(([, q]) => isPositive(q))
            .map(([receiptLineId, qty]) => {
              const l = receipt.data!.lines!.find((x) => x.id === receiptLineId)!;
              return { receiptLineId, qty: qty.trim(), unit: item(l.itemId)!.baseUnit };
            }),
        },
      }),
    onSuccess: () => {
      idem.renew();
      setReturning(false);
      setQtys({});
      setReason('');
      void qc.invalidateQueries({ queryKey: ['receipt', id] });
      void qc.invalidateQueries({ queryKey: ['returns'] });
      void qc.invalidateQueries({ queryKey: ['balances'] });
    },
  });
  if (receipt.isPending || items.isPending) return <Loading />;
  if (receipt.isError) return <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} />;
  const r = receipt.data;
  const lines = r.lines ?? [];
  const sup = suppliers.data?.find((s) => s.id === r.supplierId);
  const returnable = can('inventory.manage') && lines.some((l) => isPositive(openQty(l)));
  const errs = fieldErrors(ret.error);
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.purchasing.receipts.back} />
      <Card
        title={`${t.purchasing.receipts.one} ${r.number}`}
        actions={<span className="text-sm text-muted">{dateTime(r.receivedAt)}</span>}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {sup ? `${sup.code} — ${name(sup)}` : ''}
            {r.supplierRef && (
              <>
                {' '}
                · {t.purchasing.receipts.supplierRef}: <Num>{r.supplierRef}</Num>
              </>
            )}
          </p>
          <Table
            head={[
              t.common.item,
              t.purchasing.orders.received,
              t.purchasing.orders.unitPrice,
              t.purchasing.receipts.goodsValue,
              t.purchasing.receipts.chargesValue,
              t.purchasing.receipts.invoiced,
              t.purchasing.receipts.returned,
              ...(returning ? [t.purchasing.receipts.returnTitle] : []),
            ]}
          >
            {lines.map((l) => {
              const it = item(l.itemId);
              const u = it?.baseUnit ?? '';
              return (
                <tr key={l.id}>
                  <Td>{it ? `${it.code} — ${name(it)}` : '—'}</Td>
                  <Td>
                    <Num>{quantity(l.qty, l.unit)}</Num>
                  </Td>
                  <Td>
                    <Num>{price(l.unitPrice)}</Num> / {t.units[l.unit] ?? l.unit}
                  </Td>
                  <Td>
                    <Num>{money(l.goodsValue)}</Num>
                  </Td>
                  <Td>
                    <Num>{money(l.chargesValue)}</Num>
                  </Td>
                  <Td>
                    <Num>{quantity(l.qtyInvoicedBase, u)}</Num>
                  </Td>
                  <Td>
                    <Num>{quantity(l.qtyReturnedBase, u)}</Num>
                  </Td>
                  {returning && (
                    <Td>
                      {isPositive(openQty(l)) ? (
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`${t.purchasing.receipts.returnTitle} ${it?.code ?? ''}`}
                            dir="ltr"
                            inputMode="decimal"
                            className="w-24"
                            placeholder={openQty(l)}
                            value={qtys[l.id] ?? ''}
                            onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })}
                          />
                          <span className="text-xs text-muted">{t.units[u] ?? u}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </Table>
          {returning && (
            <div className="flex flex-col gap-3 rounded-md border border-line p-4">
              <p className="text-sm text-muted">{t.purchasing.receipts.returnHint}</p>
              <div className="max-w-md">
                <Field label={t.common.reason} error={errs.reason}>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errs.reason} />
                </Field>
              </div>
            </div>
          )}
          <FormError error={ret.error} />
          {returnable && (
            <div className="flex gap-2">
              {returning ? (
                <>
                  <Button
                    disabled={ret.isPending || !Object.values(qtys).some(isPositive)}
                    onClick={() => ret.mutate()}
                  >
                    {t.purchasing.receipts.postReturn}
                  </Button>
                  <Button variant="secondary" onClick={() => setReturning(false)}>
                    {t.cancel}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setReturning(true)}>
                  {t.purchasing.receipts.returnTitle}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReturnsTab({ go }: { go: Go }) {
  const { t, dateTime } = useI18n();
  const returns = useQuery({ queryKey: ['returns'], queryFn: () => api<SupplierReturn[]>('/purchasing/returns') });
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: () => api<Receipt[]>('/purchasing/receipts') });
  return (
    <Card title={t.purchasing.returns.title}>
      <List query={returns} empty={t.purchasing.returns.empty}>
        {(rows) => (
          <Table head={[t.common.number, t.common.date, t.purchasing.returns.receipt, t.common.reason]}>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer hover:bg-surface"
                onClick={() => go(`/purchasing/receipts/${r.receiptId}`)}
              >
                <Td>
                  <Num>{r.number}</Num>
                </Td>
                <Td>{dateTime(r.createdAt)}</Td>
                <Td>
                  <DocLink href={`#/purchasing/receipts/${r.receiptId}`}>
                    {receipts.data?.find((x) => x.id === r.receiptId)?.number ?? '—'}
                  </DocLink>
                </Td>
                <Td>{r.reason}</Td>
              </tr>
            ))}
          </Table>
        )}
      </List>
    </Card>
  );
}

// ── Supplier invoices ────────────────────────────────────────────────────────

function InvoicesTab({ go, can }: { go: Go; can: Can }) {
  const { t, name, money, date } = useI18n();
  const invoices = useQuery({
    queryKey: ['supplier-invoices'],
    queryFn: () => api<SupplierInvoice[]>('/purchasing/invoices'),
  });
  const suppliers = useSuppliers();
  const [open, setOpen] = useState(false);
  const supplier = (sid: string) => suppliers.data?.find((s) => s.id === sid);
  return (
    <div className="flex flex-col gap-4">
      {open && <InvoiceForm close={() => setOpen(false)} go={go} can={can} />}
      <Card
        title={t.purchasing.invoices.title}
        actions={!open && <Button onClick={() => setOpen(true)}>{t.purchasing.invoices.add}</Button>}
      >
        <List query={invoices} empty={t.purchasing.invoices.empty}>
          {(rows) => (
            <Table
              head={[
                t.common.number,
                t.purchasing.orders.supplier,
                t.purchasing.invoices.supplierNo,
                t.common.date,
                t.purchasing.suppliers.due,
                t.common.total,
                t.purchasing.invoices.paid,
                t.common.status,
              ]}
            >
              {rows.map((i) => (
                <tr
                  key={i.id}
                  className="cursor-pointer hover:bg-surface"
                  onClick={() => go(`/purchasing/invoices/${i.id}`)}
                >
                  <Td>
                    <DocLink href={`#/purchasing/invoices/${i.id}`}>{i.number}</DocLink>
                  </Td>
                  <Td>{supplier(i.supplierId) ? name(supplier(i.supplierId)!) : '—'}</Td>
                  <Td>
                    <Num>{i.supplierInvoiceNo}</Num>
                  </Td>
                  <Td>{date(ymd(i.invoiceDate))}</Td>
                  <Td>
                    {date(ymd(i.dueDate))}{' '}
                    {i.status === 'open' && ymd(i.dueDate) < today() && (
                      <Badge tone="danger">{t.purchasing.suppliers.overdue}</Badge>
                    )}
                  </Td>
                  <Td>
                    <Num>{money(i.total)}</Num>
                  </Td>
                  <Td>
                    <Num>{money(i.amountPaid)}</Num>
                  </Td>
                  <Td>
                    <StatusBadge status={i.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </List>
      </Card>
    </div>
  );
}

interface GoodsDraft {
  qty: string;
  amount: string;
  taxAmount: string;
}
interface OtherDraft {
  accountId: string;
  description: string;
  amount: string;
  taxAmount: string;
}

function InvoiceForm({ close, go, can }: { close: () => void; go: Go; can: Can }) {
  const { t, name, money, price, quantity } = useI18n();
  const qc = useQueryClient();
  const suppliers = useSuppliers();
  const items = useItems();
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: () => api<Receipt[]>('/purchasing/receipts') });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<Account[]>('/accounting/accounts'),
    enabled: can('accounting.view'),
  });
  const [head, setHead] = useState({
    supplierId: '',
    supplierInvoiceNo: '',
    invoiceDate: today(),
    dueDate: '',
    total: '',
  });
  const [goods, setGoods] = useState<Record<string, GoodsDraft>>({});
  const [others, setOthers] = useState<OtherDraft[]>([]);
  const mine = (receipts.data ?? []).filter((r) => r.supplierId === head.supplierId);
  const details = useQueries({
    queries: mine.map((r) => ({
      queryKey: ['receipt', r.id],
      queryFn: () => api<Receipt>(`/purchasing/receipts/${r.id}`),
    })),
  });
  const open = details
    .flatMap((d) => (d.data ? (d.data.lines ?? []).map((l) => ({ receipt: d.data!, line: l })) : []))
    .filter((x) => isPositive(openQty(x.line)));
  const item = (itemId: string) => items.data?.find((i) => i.id === itemId) as Item | undefined;
  const g = (lineId: string) => goods[lineId] ?? { qty: '', amount: '', taxAmount: '' };
  const setG = (lineId: string, patch: Partial<GoodsDraft>) =>
    setGoods({ ...goods, [lineId]: { ...g(lineId), ...patch } });
  const used = Object.entries(goods).filter(([, d]) => d.qty.trim() || d.amount.trim());
  const usedOthers = others.filter((o) => o.accountId || o.amount.trim());
  const computed = fromCents(
    [...used.map(([, d]) => d), ...usedOthers].reduce((s, d) => s + cents(d.amount) + cents(d.taxAmount), 0n),
  );
  const mismatch = isMoney(head.total) && cents(head.total) !== cents(computed);
  const fillVat = () => {
    setGoods(
      Object.fromEntries(
        Object.entries(goods).map(([k, d]) => [
          k,
          d.taxAmount.trim() || !isMoney(d.amount) ? d : { ...d, taxAmount: percentOf(d.amount, 14n) },
        ]),
      ),
    );
    setOthers(
      others.map((o) => (o.taxAmount.trim() || !isMoney(o.amount) ? o : { ...o, taxAmount: percentOf(o.amount, 14n) })),
    );
  };
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: () =>
      api<SupplierInvoice>('/purchasing/invoices', {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: {
          supplierId: head.supplierId,
          supplierInvoiceNo: head.supplierInvoiceNo,
          invoiceDate: head.invoiceDate,
          dueDate: head.dueDate || undefined,
          total: head.total.trim(),
          lines: [
            ...used.map(([receiptLineId, d]) => {
              const l = open.find((x) => x.line.id === receiptLineId)!.line;
              return {
                receiptLineId,
                qty: d.qty.trim(),
                unit: item(l.itemId)!.baseUnit,
                amount: d.amount.trim(),
                taxAmount: d.taxAmount.trim() || '0',
              };
            }),
            ...usedOthers.map((o) => ({
              accountId: o.accountId,
              description: o.description,
              amount: o.amount.trim(),
              taxAmount: o.taxAmount.trim() || '0',
            })),
          ],
        },
      }),
    onSuccess: (inv) => {
      idem.renew();
      void qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      void qc.invalidateQueries({ queryKey: ['receipt'] });
      close();
      go(`/purchasing/invoices/${inv.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  const postable = (accounts.data ?? []).filter((a) => a.isPostable && !a.isControl);
  const cell = (value: string, onChange: (v: string) => void, label: string, width = 'w-28') => (
    <Input
      aria-label={label}
      dir="ltr"
      inputMode="decimal"
      className={width}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  return (
    <Card title={t.purchasing.invoices.add}>
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.purchasing.orders.supplier} error={errs.supplierId}>
            <Select
              value={head.supplierId}
              onChange={(e) => {
                setHead({ ...head, supplierId: e.target.value });
                setGoods({});
              }}
            >
              <option value="">{t.common.choose}</option>
              {suppliers.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {name(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.purchasing.invoices.supplierNo} error={errs.supplierInvoiceNo}>
            <Input
              dir="ltr"
              value={head.supplierInvoiceNo}
              onChange={(e) => setHead({ ...head, supplierInvoiceNo: e.target.value })}
            />
          </Field>
          <Field label={t.purchasing.invoices.invoiceDate} error={errs.invoiceDate}>
            <Input
              type="date"
              dir="ltr"
              value={head.invoiceDate}
              onChange={(e) => setHead({ ...head, invoiceDate: e.target.value })}
            />
          </Field>
          <Field label={t.purchasing.invoices.dueDate} hint={t.purchasing.invoices.dueHint} error={errs.dueDate}>
            <Input
              type="date"
              dir="ltr"
              value={head.dueDate}
              onChange={(e) => setHead({ ...head, dueDate: e.target.value })}
            />
          </Field>
          <Field label={t.purchasing.invoices.printedTotal} error={errs.total}>
            <Input
              dir="ltr"
              inputMode="decimal"
              value={head.total}
              onChange={(e) => setHead({ ...head, total: e.target.value })}
            />
          </Field>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t.purchasing.invoices.goodsLines}</h3>
          {!head.supplierId ? (
            <p className="text-sm text-muted">{t.purchasing.invoices.pickSupplier}</p>
          ) : details.some((d) => d.isPending) ? (
            <Loading />
          ) : open.length === 0 ? (
            <p className="text-sm text-muted">{t.purchasing.invoices.noOpen}</p>
          ) : (
            <Table
              head={[
                t.purchasing.returns.receipt,
                t.common.item,
                t.purchasing.receipts.openQty,
                t.purchasing.orders.unitPrice,
                t.common.qty,
                t.purchasing.invoices.net,
                t.purchasing.invoices.tax,
              ]}
            >
              {open.map(({ receipt, line }) => {
                const it = item(line.itemId);
                const u = it?.baseUnit ?? '';
                return (
                  <tr key={line.id}>
                    <Td>
                      <Num>{receipt.number}</Num>
                    </Td>
                    <Td>{it ? `${it.code} — ${name(it)}` : '—'}</Td>
                    <Td>
                      <Num>{quantity(openQty(line), u)}</Num>
                    </Td>
                    <Td>
                      <Num>
                        {price(line.unitPrice)} / {t.units[line.unit] ?? line.unit}
                      </Num>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        {cell(
                          g(line.id).qty,
                          (v) => setG(line.id, { qty: v }),
                          `${t.common.qty} ${it?.code ?? ''}`,
                          'w-24',
                        )}
                        <span className="text-xs text-muted">{t.units[u] ?? u}</span>
                      </div>
                    </Td>
                    <Td>{cell(g(line.id).amount, (v) => setG(line.id, { amount: v }), t.purchasing.invoices.net)}</Td>
                    <Td>
                      {cell(
                        g(line.id).taxAmount,
                        (v) => setG(line.id, { taxAmount: v }),
                        t.purchasing.invoices.tax,
                        'w-24',
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </section>

        {can('accounting.view') && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t.purchasing.invoices.otherLines}</h3>
            {others.map((o, i) => {
              const set = (patch: Partial<OtherDraft>) =>
                setOthers(others.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={t.purchasing.invoices.account}
                    value={o.accountId}
                    onChange={(e) => set({ accountId: e.target.value })}
                  >
                    <option value="">{t.common.choose}</option>
                    {postable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {name(a)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={t.purchasing.invoices.description}
                    placeholder={t.purchasing.invoices.description}
                    value={o.description}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                  {cell(o.amount, (v) => set({ amount: v }), t.purchasing.invoices.net)}
                  {cell(o.taxAmount, (v) => set({ taxAmount: v }), t.purchasing.invoices.tax, 'w-24')}
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t.common.remove}
                    onClick={() => setOthers(others.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOthers([...others, { accountId: '', description: '', amount: '', taxAmount: '' }])}
              >
                + {t.common.addLine}
              </Button>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant="secondary" onClick={fillVat}>
            {t.purchasing.invoices.fillVat}
          </Button>
          <p className="text-sm">
            {t.purchasing.invoices.computed}: <Num>{money(computed)}</Num>
          </p>
        </div>
        {mismatch && <Alert tone="warning">{t.purchasing.invoices.mismatch}</Alert>}
        {Object.entries(errs)
          .filter(([k]) => k.startsWith('lines'))
          .slice(0, 3)
          .map(([k, m]) => (
            <Alert key={k} tone="danger">
              {m}
            </Alert>
          ))}
        <FormError error={create.error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending || mismatch || (!used.length && !usedOthers.length)}>
            {t.save}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function InvoiceDetail({ id, back }: { id: string; back: () => void }) {
  const { t, name, money, quantity, date } = useI18n();
  const items = useItems();
  const suppliers = useSuppliers();
  const inv = useQuery({
    queryKey: ['supplier-invoice', id],
    queryFn: () => api<SupplierInvoice>(`/purchasing/invoices/${id}`),
  });
  if (inv.isPending) return <Loading />;
  if (inv.isError) return <ErrorState error={inv.error} onRetry={() => inv.refetch()} />;
  const d = inv.data;
  const sup = suppliers.data?.find((s) => s.id === d.supplierId);
  const item = (itemId: string | null) => items.data?.find((i) => i.id === itemId);
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.purchasing.invoices.back} />
      <Card title={`${t.purchasing.invoices.one} ${d.number}`} actions={<StatusBadge status={d.status} />}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {sup ? `${sup.code} — ${name(sup)}` : ''} · {t.purchasing.invoices.supplierNo}:{' '}
            <Num>{d.supplierInvoiceNo}</Num> · {date(ymd(d.invoiceDate))} · {t.purchasing.suppliers.due}:{' '}
            {date(ymd(d.dueDate))}
          </p>
          <Table
            head={[
              t.common.item,
              t.common.qty,
              t.purchasing.invoices.net,
              t.purchasing.invoices.tax,
              t.purchasing.invoices.cleared,
              t.purchasing.invoices.variance,
            ]}
          >
            {(d.lines ?? []).map((l) => {
              const it = item(l.itemId);
              return (
                <tr key={l.id}>
                  <Td>{it ? `${it.code} — ${name(it)}` : (l.description ?? '—')}</Td>
                  <Td>{l.qtyBase && it ? <Num>{quantity(l.qtyBase, it.baseUnit)}</Num> : '—'}</Td>
                  <Td>
                    <Num>{money(l.amount)}</Num>
                  </Td>
                  <Td>
                    <Num>{money(l.taxAmount)}</Num>
                  </Td>
                  <Td>{l.receiptLineId ? <Num>{money(l.grniCleared)}</Num> : '—'}</Td>
                  <Td>
                    {l.receiptLineId && Number(l.priceVariance) !== 0 ? (
                      <Badge tone="warning">
                        <Num>{money(l.priceVariance)}</Num>
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <dl className="grid max-w-xs grid-cols-2 gap-y-1 text-sm ms-auto">
            <dt className="text-muted">{t.purchasing.invoices.net}</dt>
            <dd className="num text-end">{money(d.subtotal)}</dd>
            <dt className="text-muted">{t.purchasing.invoices.tax}</dt>
            <dd className="num text-end">{money(d.taxTotal)}</dd>
            <dt className="font-semibold">{t.common.total}</dt>
            <dd className="num text-end font-semibold">{money(d.total)}</dd>
            <dt className="text-muted">{t.purchasing.invoices.paid}</dt>
            <dd className="num text-end">{money(d.amountPaid)}</dd>
          </dl>
        </div>
      </Card>
    </div>
  );
}

// ── Payments ─────────────────────────────────────────────────────────────────

interface PurchasingReconciliation {
  openPayables: string;
  glPayables: string;
  payablesMatch: boolean;
  uninvoicedReceipts: string;
  glGoodsReceivedNotInvoiced: string;
  goodsReceivedMatch: boolean;
}

function PaymentsTable({ rows }: { rows: Payment[] }) {
  const { t, money, dateTime } = useI18n();
  return (
    <Table
      head={[
        t.common.number,
        t.common.date,
        t.purchasing.payments.method,
        t.purchasing.payments.reference,
        t.purchasing.payments.amount,
      ]}
    >
      {rows.map((p) => (
        <tr key={p.id}>
          <Td>
            <Num>{p.number}</Num>
          </Td>
          <Td>{dateTime(p.paidAt)}</Td>
          <Td>{t.purchasing.payments.methods[p.method] ?? p.method}</Td>
          <Td>
            <Num>{p.reference ?? '—'}</Num>
          </Td>
          <Td>
            <Num>{money(p.amount)}</Num>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function PaymentsTab({ can }: { can: Can }) {
  const { t, name, money, date } = useI18n();
  const qc = useQueryClient();
  const payments = useQuery({ queryKey: ['supplier-payments'], queryFn: () => api<Payment[]>('/purchasing/payments') });
  const recon = useQuery({
    queryKey: ['purchasing-reconciliation'],
    queryFn: () => api<PurchasingReconciliation>('/purchasing/reconciliation'),
    enabled: can('reports.financial'),
    retry: false,
  });
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const [method, setMethod] = useState('bank');
  const [reference, setReference] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const statement = useQuery({
    queryKey: ['statement', supplierId],
    queryFn: () => api<Statement>(`/purchasing/suppliers/${supplierId}/statement`),
    enabled: !!supplierId,
  });
  const openInvoices = (statement.data?.invoices ?? []).filter((i) => i.status === 'open');
  const allocations = Object.entries(alloc).filter(([, v]) => v.trim() && cents(v) > 0n);
  const amount = fromCents(allocations.reduce((s, [, v]) => s + cents(v), 0n));
  const idem = useIdempotencyKey();
  const pay = useMutation({
    mutationFn: () =>
      api('/purchasing/payments', {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: {
          supplierId,
          method,
          reference,
          amount,
          allocations: allocations.map(([invoiceId, v]) => ({ invoiceId, amount: v.trim() })),
        },
      }),
    onSuccess: () => {
      idem.renew();
      setAlloc({});
      setReference('');
      for (const k of ['supplier-payments', 'statement', 'supplier-invoices', 'purchasing-reconciliation'])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
  return (
    <div className="flex flex-col gap-4">
      {recon.data && (
        <Card title={t.purchasing.payments.reconTitle}>
          <div className="flex flex-col gap-2">
            <Alert tone={recon.data.payablesMatch ? 'success' : 'danger'}>
              {recon.data.payablesMatch ? t.purchasing.payments.payablesOk : t.purchasing.payments.payablesBad}{' '}
              <Num>{money(recon.data.openPayables)}</Num> / <Num>{money(recon.data.glPayables)}</Num>
            </Alert>
            <Alert tone={recon.data.goodsReceivedMatch ? 'success' : 'danger'}>
              {recon.data.goodsReceivedMatch ? t.purchasing.payments.grniOk : t.purchasing.payments.grniBad}{' '}
              <Num>{money(recon.data.uninvoicedReceipts)}</Num> /{' '}
              <Num>{money(recon.data.glGoodsReceivedNotInvoiced)}</Num>
            </Alert>
          </div>
        </Card>
      )}
      <Card title={t.purchasing.payments.add}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            pay.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.purchasing.orders.supplier}>
              <Select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setAlloc({});
                }}
              >
                <option value="">{t.common.choose}</option>
                {suppliers.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {name(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.purchasing.payments.method}>
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(t.purchasing.payments.methods).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.purchasing.payments.reference}>
              <Input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          {supplierId &&
            (statement.isPending ? (
              <Loading />
            ) : statement.isError ? (
              <ErrorState error={statement.error} onRetry={() => statement.refetch()} />
            ) : openInvoices.length === 0 ? (
              <p className="text-sm text-muted">{t.purchasing.payments.noOpen}</p>
            ) : (
              <>
                <Table
                  head={[
                    t.common.number,
                    t.purchasing.invoices.supplierNo,
                    t.purchasing.suppliers.due,
                    t.purchasing.suppliers.openAmount,
                    t.purchasing.payments.allocate,
                  ]}
                >
                  {openInvoices.map((i) => (
                    <tr key={i.id}>
                      <Td>
                        <Num>{i.number}</Num>
                      </Td>
                      <Td>
                        <Num>{i.supplierInvoiceNo}</Num>
                      </Td>
                      <Td>{date(ymd(i.dueDate))}</Td>
                      <Td>
                        <Num>{money(i.openAmount)}</Num>
                      </Td>
                      <Td>
                        <Input
                          aria-label={`${t.purchasing.payments.allocate} ${i.number}`}
                          dir="ltr"
                          inputMode="decimal"
                          className="w-32"
                          value={alloc[i.id] ?? ''}
                          onChange={(e) => setAlloc({ ...alloc, [i.id]: e.target.value })}
                        />
                      </Td>
                    </tr>
                  ))}
                </Table>
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAlloc(Object.fromEntries(openInvoices.map((i) => [i.id, i.openAmount])))}
                  >
                    {t.purchasing.payments.payAll}
                  </Button>
                  <p className="text-sm font-medium">
                    {t.purchasing.payments.amount}: <Num>{money(amount)}</Num>
                  </p>
                </div>
              </>
            ))}
          <FormError error={pay.error} />
          {Object.entries(fieldErrors(pay.error)).map(([k, m]) => (
            <Alert key={k} tone="danger">
              {m}
            </Alert>
          ))}
          <div>
            <Button type="submit" disabled={pay.isPending || !supplierId || allocations.length === 0}>
              {t.purchasing.payments.add}
            </Button>
          </div>
        </form>
      </Card>
      <Card title={t.purchasing.payments.title}>
        <List query={payments} empty={t.purchasing.payments.empty}>
          {(rows) => <PaymentsTable rows={rows} />}
        </List>
      </Card>
    </div>
  );
}
