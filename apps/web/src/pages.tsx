import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorCode, fieldErrors } from './api';
import { useI18n } from './i18n';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Input, Loading, Select, Table, Td } from './ui';

type Named = { id: string; nameAr: string; nameEn: string };
interface Price {
  price: string;
  validFrom: string;
  validTo: string | null;
  branchId: string | null;
  channel: string | null;
}
interface Product extends Named {
  archivedAt: string | null;
  variants: { id: string; prices: Price[] }[];
}
interface TaxCategory {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}

/** Price in effect now for all branches and channels. */
const currentPrice = (p: Product) =>
  p.variants[0]?.prices.find(
    (x) =>
      !x.branchId &&
      !x.channel &&
      Date.parse(x.validFrom) <= Date.now() &&
      (!x.validTo || Date.parse(x.validTo) > Date.now()),
  )?.price;

export function ProductsPage() {
  const { t, name, money, error } = useI18n();
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/catalog/products') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Named[]>('/catalog/categories') });
  const taxCats = useQuery({
    queryKey: ['tax-categories'],
    queryFn: () => api<TaxCategory[]>('/catalog/tax-categories'),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nameAr: '',
    nameEn: '',
    categoryId: '',
    newCategory: '',
    taxCategoryId: '',
    price: '',
  });

  const create = useMutation({
    mutationFn: async () => {
      let categoryId = form.categoryId;
      if (!categoryId) {
        const c = await api<Named>('/catalog/categories', {
          method: 'POST',
          body: { nameAr: form.newCategory, nameEn: form.newCategory },
        });
        categoryId = c.id;
      }
      const taxCategoryId = form.taxCategoryId || taxCats.data?.find((c) => c.code === 'STANDARD')?.id || '';
      return api<Product>('/catalog/products', {
        method: 'POST',
        body: { nameAr: form.nameAr, nameEn: form.nameEn, categoryId, taxCategoryId, price: form.price },
      });
    },
    onSuccess: () => {
      setOpen(false);
      setForm({ nameAr: '', nameEn: '', categoryId: '', newCategory: '', taxCategoryId: '', price: '' });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  const errs = fieldErrors(create.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="flex flex-col gap-4">
      {open && (
        <Card title={t.products.add}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label={t.products.nameAr} error={errs.nameAr}>
              <Input
                required
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                aria-invalid={!!errs.nameAr}
              />
            </Field>
            <Field label={t.products.nameEn} error={errs.nameEn}>
              <Input
                required
                dir="ltr"
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                aria-invalid={!!errs.nameEn}
              />
            </Field>
            <Field label={t.products.category}>
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">{t.products.newCategory}…</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {name(c)}
                  </option>
                ))}
              </Select>
            </Field>
            {!form.categoryId && (
              <Field label={t.products.newCategory}>
                <Input
                  required
                  value={form.newCategory}
                  onChange={(e) => setForm({ ...form, newCategory: e.target.value })}
                />
              </Field>
            )}
            <Field label={t.products.taxCategory}>
              <Select value={form.taxCategoryId} onChange={(e) => setForm({ ...form, taxCategoryId: e.target.value })}>
                {taxCats.data?.map((c) => (
                  <option key={c.id} value={c.code === 'STANDARD' ? '' : c.id}>
                    {name(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`${t.products.price} (EGP)`} error={errs.price}>
              <Input
                required
                inputMode="decimal"
                dir="ltr"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                aria-invalid={!!errs.price}
              />
            </Field>
            {create.isError && !Object.keys(errs).length && (
              <div className="sm:col-span-2">
                <Alert tone="danger">{error(errorCode(create.error))}</Alert>
              </div>
            )}
            <div className="flex gap-2 sm:col-span-2">
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
      <Card title={t.products.title} actions={!open && <Button onClick={() => setOpen(true)}>{t.products.add}</Button>}>
        {products.isPending ? (
          <Loading />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : products.data.length === 0 ? (
          <Empty>{t.products.empty}</Empty>
        ) : (
          <Table head={[t.products.nameAr, t.products.nameEn, t.products.price, '']}>
            {products.data.map((p) => (
              <tr key={p.id}>
                <Td>{p.nameAr}</Td>
                <Td>
                  <span dir="ltr">{p.nameEn}</span>
                </Td>
                <Td>
                  <span className="num">{currentPrice(p) ? money(currentPrice(p)!) : '—'}</span>
                </Td>
                <Td>{p.archivedAt && <Badge>{t.products.archived}</Badge>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

interface Device {
  id: string;
  branchId: string;
  code: string;
  name: string;
  status: string;
  lastSeenAt: string | null;
}
interface Branch extends Named {
  code: string;
}

export function DevicesPage() {
  const { t, name, dateTime, error } = useI18n();
  const qc = useQueryClient();
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api<Device[]>('/devices') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/branches') });
  const [form, setForm] = useState({ branchId: '', code: '', name: '' });
  const [pairing, setPairing] = useState<{ code: string; device: string } | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api<{ pairingCode: string; code: string }>('/devices', {
        method: 'POST',
        body: { ...form, branchId: form.branchId || branches.data?.[0]?.id },
      }),
    onSuccess: (d) => {
      setPairing({ code: d.pairingCode, device: d.code });
      setForm({ branchId: '', code: '', name: '' });
      void qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });
  const errs = fieldErrors(create.error);
  const tone = (s: string) => (s === 'active' ? 'success' : s === 'pending_pairing' ? 'warning' : 'danger');

  return (
    <div className="flex flex-col gap-4">
      {pairing && (
        <Alert tone="success">
          <p className="font-medium">
            {t.devices.pairingCode} ({pairing.device}):{' '}
            <span className="num text-lg tracking-widest">{pairing.code}</span>
          </p>
          <p>{t.devices.pairingHint}</p>
        </Alert>
      )}
      <Card title={t.devices.add}>
        <form
          className="grid gap-4 sm:grid-cols-4 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label={t.devices.branch}>
            <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {name(b)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.devices.code} error={errs.code}>
            <Input
              dir="ltr"
              maxLength={4}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              aria-invalid={!!errs.code}
            />
          </Field>
          <Field label={t.devices.name} error={errs.name}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-invalid={!!errs.name}
            />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {t.create}
          </Button>
          {create.isError && !Object.keys(errs).length && (
            <div className="sm:col-span-4">
              <Alert tone="danger">{error(errorCode(create.error))}</Alert>
            </div>
          )}
        </form>
      </Card>
      <Card title={t.devices.title}>
        {devices.isPending ? (
          <Loading />
        ) : devices.isError ? (
          <ErrorState error={devices.error} onRetry={() => devices.refetch()} />
        ) : devices.data.length === 0 ? (
          <Empty>{t.devices.empty}</Empty>
        ) : (
          <Table head={[t.devices.code, t.devices.name, t.devices.branch, t.devices.status, t.devices.lastSeen]}>
            {devices.data.map((d) => (
              <tr key={d.id}>
                <Td>
                  <span className="num font-medium">{d.code}</span>
                </Td>
                <Td>{d.name}</Td>
                <Td>{branches.data?.find((b) => b.id === d.branchId)?.code}</Td>
                <Td>
                  <Badge tone={tone(d.status)}>{d.status}</Badge>
                </Td>
                <Td>{d.lastSeenAt ? dateTime(d.lastSeenAt) : t.devices.never}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

interface InvoiceRow {
  id: string;
  number: string;
  issuedAt: string;
  total: string;
  currencyCode: string;
  paymentStatus: string;
  openDiscrepancies: number;
}
interface Line {
  lineNo: number;
  descriptionAr: string;
  descriptionEn: string;
  qty: string;
  unitPrice: string;
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
}
interface InvoiceDetail extends InvoiceRow {
  subtotal: string;
  taxTotal: string;
  lines: Line[];
  payments: { id: string; amount: string; tendered: string | null; changeGiven: string | null }[];
  journal: {
    number: string;
    entryDate: string;
    lines: { lineNo: number; accountId: string; debit: string; credit: string; description: string | null }[];
  } | null;
  discrepancies: { id: string; kind: string; status: string }[];
}
interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}

export function InvoicesPage({ id, go }: { id?: string; go: (path: string) => void }) {
  const { t, money, dateTime } = useI18n();
  const list = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api<{ items: InvoiceRow[] }>('/sales/invoices?pageSize=50'),
    enabled: !id,
  });
  if (id) return <InvoiceDetailView id={id} back={() => go('/invoices')} />;
  return (
    <Card title={t.invoices.title}>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <Empty>{t.invoices.empty}</Empty>
      ) : (
        <Table head={[t.invoices.number, t.invoices.date, t.invoices.total, t.invoices.payment, t.invoices.flags]}>
          {list.data.items.map((i) => (
            <tr key={i.id} className="cursor-pointer hover:bg-surface" onClick={() => go(`/invoices/${i.id}`)}>
              <Td>
                <a
                  href={`#/invoices/${i.id}`}
                  className="num font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  {i.number}
                </a>
              </Td>
              <Td>{dateTime(i.issuedAt)}</Td>
              <Td>
                <span className="num">{money(i.total, i.currencyCode)}</span>
              </Td>
              <Td>
                <Badge tone={i.paymentStatus === 'paid' ? 'success' : 'warning'}>{i.paymentStatus}</Badge>
              </Td>
              <Td>{i.openDiscrepancies > 0 && <Badge tone="warning">{i.openDiscrepancies}</Badge>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function InvoiceDetailView({ id, back }: { id: string; back: () => void }) {
  const { t, money, dateTime, name, locale } = useI18n();
  const inv = useQuery({ queryKey: ['invoice', id], queryFn: () => api<InvoiceDetail>(`/sales/invoices/${id}`) });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounting/accounts') });
  if (inv.isPending) return <Loading />;
  if (inv.isError) return <ErrorState error={inv.error} onRetry={() => inv.refetch()} />;
  const d = inv.data;
  const acc = (aid: string) => accounts.data?.find((a) => a.id === aid);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" onClick={back}>
          {locale === 'ar' ? '→' : '←'} {t.invoices.back}
        </Button>
      </div>
      <Card
        title={`${t.invoices.number} ${d.number}`}
        actions={<span className="text-sm text-muted">{dateTime(d.issuedAt)}</span>}
      >
        <Table
          head={[
            t.invoices.lines,
            t.invoices.qty,
            t.invoices.unitPrice,
            t.invoices.net,
            t.invoices.tax,
            t.invoices.gross,
          ]}
        >
          {d.lines.map((l) => (
            <tr key={l.lineNo}>
              <Td>{locale === 'ar' ? l.descriptionAr : l.descriptionEn}</Td>
              <Td>
                <span className="num">{l.qty}</span>
              </Td>
              <Td>
                <span className="num">{money(l.unitPrice, d.currencyCode)}</span>
              </Td>
              <Td>
                <span className="num">{money(l.netAmount, d.currencyCode)}</span>
              </Td>
              <Td>
                <span className="num">{money(l.taxAmount, d.currencyCode)}</span>
              </Td>
              <Td>
                <span className="num">{money(l.grossAmount, d.currencyCode)}</span>
              </Td>
            </tr>
          ))}
        </Table>
        <dl className="mt-4 grid max-w-xs grid-cols-2 gap-y-1 text-sm ms-auto">
          <dt className="text-muted">{t.invoices.net}</dt>
          <dd className="num text-end">{money(d.subtotal, d.currencyCode)}</dd>
          <dt className="text-muted">{t.invoices.tax}</dt>
          <dd className="num text-end">{money(d.taxTotal, d.currencyCode)}</dd>
          <dt className="font-semibold">{t.invoices.total}</dt>
          <dd className="num text-end font-semibold">{money(d.total, d.currencyCode)}</dd>
        </dl>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t.invoices.journal}>
          {!d.journal ? (
            <Empty>—</Empty>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                <span className="num">{d.journal.number}</span> ·{' '}
                <span className="num">{d.journal.entryDate.slice(0, 10)}</span>
              </p>
              <Table head={[t.accounting.account, t.accounting.debit, t.accounting.credit]}>
                {d.journal.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <Td>
                      <span className="num">{acc(l.accountId)?.code}</span>{' '}
                      {acc(l.accountId) ? name(acc(l.accountId)!) : ''}
                    </Td>
                    <Td>
                      <span className="num">{Number(l.debit) ? money(l.debit, d.currencyCode) : ''}</span>
                    </Td>
                    <Td>
                      <span className="num">{Number(l.credit) ? money(l.credit, d.currencyCode) : ''}</span>
                    </Td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Card>
        <Card title={t.invoices.discrepancies}>
          {d.discrepancies.length === 0 ? (
            <p className="text-sm text-muted">{t.invoices.noDiscrepancies}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.discrepancies.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-sm">
                  <Badge tone="warning">{x.kind}</Badge> <span className="text-muted">{x.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

interface TrialBalance {
  accounts: (Account & { accountId: string; debit: string; credit: string })[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}

export function AccountingPage() {
  const { t, money, name } = useI18n();
  const tb = useQuery({ queryKey: ['trial-balance'], queryFn: () => api<TrialBalance>('/accounting/trial-balance') });
  return (
    <Card title={t.accounting.title}>
      {tb.isPending ? (
        <Loading />
      ) : tb.isError ? (
        <ErrorState error={tb.error} onRetry={() => tb.refetch()} />
      ) : tb.data.accounts.length === 0 ? (
        <Empty>{t.accounting.empty}</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone={tb.data.balanced ? 'success' : 'danger'}>
            {tb.data.balanced ? t.accounting.balanced : t.accounting.unbalanced}
          </Alert>
          <Table head={[t.accounting.account, t.accounting.debit, t.accounting.credit]}>
            {tb.data.accounts.map((a) => (
              <tr key={a.accountId}>
                <Td>
                  <span className="num">{a.code}</span> {name(a)}
                </Td>
                <Td>
                  <span className="num">{money(a.debit)}</span>
                </Td>
                <Td>
                  <span className="num">{money(a.credit)}</span>
                </Td>
              </tr>
            ))}
            <tr className="font-semibold">
              <Td>{t.accounting.totals}</Td>
              <Td>
                <span className="num">{money(tb.data.totalDebit)}</span>
              </Td>
              <Td>
                <span className="num">{money(tb.data.totalCredit)}</span>
              </Td>
            </tr>
          </Table>
        </div>
      )}
    </Card>
  );
}
