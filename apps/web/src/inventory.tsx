import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldErrors, useIdempotencyKey } from './api';
import { useI18n } from './i18n';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Input, Loading, Select, Table, Td } from './ui';
import {
  emptyLine,
  FormError,
  LinesEditor,
  Num,
  StatusBadge,
  Tabs,
  unitsFor,
  useItems,
  useWarehouses,
  type Item,
  type LineDraft,
  type Warehouse,
} from './stock-ui';

type Go = (path: string) => void;
type Can = (permission: string) => boolean;

export function InventoryPage({ tab, id, go, can }: { tab?: string; id?: string; go: Go; can: Can }) {
  const { t } = useI18n();
  const current = tab || 'stock';
  const tabs = (Object.keys(t.inventory.tabs) as (keyof typeof t.inventory.tabs)[]).map((key) => ({
    key,
    label: t.inventory.tabs[key],
    href: `#/inventory/${key}`,
  }));
  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} current={current} />
      {current === 'items' ? (
        <ItemsTab can={can} />
      ) : current === 'recipes' ? (
        <RecipesTab can={can} />
      ) : current === 'adjustments' ? (
        <AdjustmentsTab can={can} />
      ) : current === 'counts' ? (
        id ? (
          <CountDetail key={id} id={id} back={() => go('/inventory/counts')} can={can} />
        ) : (
          <CountsTab go={go} can={can} />
        )
      ) : current === 'transfers' ? (
        id ? (
          <TransferDetail key={id} id={id} back={() => go('/inventory/transfers')} can={can} />
        ) : (
          <TransfersTab go={go} can={can} />
        )
      ) : current === 'movements' ? (
        <MovementsTab />
      ) : (
        <StockTab can={can} />
      )}
    </div>
  );
}

const warehouseLabel = (w?: Warehouse) => (w ? `${w.code} — ${w.name}` : '');
/** Lines with an item and a quantity, as the API expects them. */
const filled = (lines: LineDraft[]) => lines.filter((l) => l.itemId && l.qty.trim());

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

// ── Stock ────────────────────────────────────────────────────────────────────

interface BalanceRow {
  warehouseId: string;
  itemId: string;
  warehouseCode: string;
  itemCode: string;
  nameAr: string;
  nameEn: string;
  baseUnit: string;
  qtyBase: string;
  totalValue: string;
  avgUnitCost: string;
  belowMinimum: boolean;
}
interface InventoryReconciliation {
  ledgerMatchesBalances: boolean;
  glMatchesStock: boolean;
  stockValue: string;
  glInventoryValue: string;
}

function StockTab({ can }: { can: Can }) {
  const { t, name, money, price, quantity } = useI18n();
  const warehouses = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const balances = useQuery({
    queryKey: ['balances', warehouseId],
    queryFn: () => api<BalanceRow[]>(`/inventory/balances${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
  });
  const recon = useQuery({
    queryKey: ['inventory-reconciliation'],
    queryFn: () => api<InventoryReconciliation>('/inventory/reconciliation'),
    enabled: can('reports.inventory'),
    retry: false,
  });
  const rows = (balances.data ?? []).filter((b) => Number(b.qtyBase) !== 0 || Number(b.totalValue) !== 0);
  return (
    <div className="flex flex-col gap-4">
      {recon.data && (
        <Card title={t.inventory.stock.reconTitle}>
          <div className="flex flex-col gap-2">
            <Alert tone={recon.data.ledgerMatchesBalances ? 'success' : 'danger'}>
              {recon.data.ledgerMatchesBalances ? t.inventory.stock.ledgerOk : t.inventory.stock.ledgerBad}
            </Alert>
            <Alert tone={recon.data.glMatchesStock ? 'success' : 'danger'}>
              {recon.data.glMatchesStock ? t.inventory.stock.glOk : t.inventory.stock.glBad}{' '}
              {t.inventory.stock.stockValue}: <Num>{money(recon.data.stockValue)}</Num> · {t.inventory.stock.glValue}:{' '}
              <Num>{money(recon.data.glInventoryValue)}</Num>
            </Alert>
          </div>
        </Card>
      )}
      <Card
        title={t.inventory.stock.title}
        actions={
          <Select aria-label={t.common.warehouse} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">{t.common.all}</option>
            {warehouses.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {warehouseLabel(w)}
              </option>
            ))}
          </Select>
        }
      >
        {balances.isPending ? (
          <Loading />
        ) : balances.isError ? (
          <ErrorState error={balances.error} onRetry={() => balances.refetch()} />
        ) : rows.length === 0 ? (
          <Empty>{t.inventory.stock.empty}</Empty>
        ) : (
          <Table
            head={[t.common.warehouse, t.common.item, t.common.qty, t.inventory.stock.avgCost, t.common.value, '']}
          >
            {rows.map((b) => (
              <tr key={`${b.warehouseId}:${b.itemId}`}>
                <Td>
                  <Num>{b.warehouseCode}</Num>
                </Td>
                <Td>
                  <Num>{b.itemCode}</Num> {name(b)}
                </Td>
                <Td>
                  <Num>{quantity(b.qtyBase, b.baseUnit)}</Num>
                </Td>
                <Td>
                  <Num>{price(b.avgUnitCost)}</Num>
                </Td>
                <Td>
                  <Num>{money(b.totalValue)}</Num>
                </Td>
                <Td>
                  {Number(b.qtyBase) < 0 ? (
                    <Badge tone="danger">{'< 0'}</Badge>
                  ) : (
                    b.belowMinimum && <Badge tone="warning">{t.inventory.stock.belowMin}</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Items ────────────────────────────────────────────────────────────────────

function ItemsTab({ can }: { can: Can }) {
  const { t, name, quantity } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const blank = {
    code: '',
    nameAr: '',
    nameEn: '',
    kind: 'ingredient',
    baseUnit: 'g',
    standardCost: '0',
    minQty: '',
    unit: '',
    factor: '',
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const create = useMutation({
    mutationFn: () =>
      api<Item>('/inventory/items', {
        method: 'POST',
        body: {
          code: form.code,
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          kind: form.kind,
          baseUnit: form.baseUnit,
          standardCost: form.standardCost || '0',
          minQty: form.minQty || null,
          conversions: form.unit.trim() ? { [form.unit.trim().toLowerCase()]: form.factor } : {},
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setForm(blank);
      void qc.invalidateQueries({ queryKey: ['inventory-items'] });
    },
  });
  const errs = fieldErrors(create.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const text = (key: keyof typeof form, label: string, opts: { ltr?: boolean; hint?: string; error?: string } = {}) => (
    <Field label={label} error={opts.error ?? errs[key]} hint={opts.hint}>
      <Input
        dir={opts.ltr ? 'ltr' : undefined}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={!!(opts.error ?? errs[key])}
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      {open && (
        <Card title={t.inventory.items.add}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
            {text('code', t.common.code, { ltr: true })}
            {text('nameAr', t.products.nameAr)}
            {text('nameEn', t.products.nameEn, { ltr: true })}
            <Field label={t.inventory.items.kind}>
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(t.inventory.items.kinds).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.inventory.items.baseUnit}>
              <Select value={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.value })}>
                {['g', 'ml', 'pc'].map((u) => (
                  <option key={u} value={u}>
                    {t.units[u]}
                  </option>
                ))}
              </Select>
            </Field>
            {text('standardCost', t.inventory.items.standardCost, {
              ltr: true,
              hint: t.inventory.items.standardCostHint,
            })}
            {text('minQty', t.inventory.items.minQty, { ltr: true })}
            {text('unit', t.inventory.items.customUnit, { ltr: true })}
            {form.unit.trim() &&
              text('factor', t.inventory.items.customFactor, {
                ltr: true,
                error: Object.entries(errs).find(([k]) => k.startsWith('conversions'))?.[1],
              })}
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
        title={t.inventory.items.title}
        actions={
          !open && can('inventory.manage') && <Button onClick={() => setOpen(true)}>{t.inventory.items.add}</Button>
        }
      >
        {items.isPending ? (
          <Loading />
        ) : items.isError ? (
          <ErrorState error={items.error} onRetry={() => items.refetch()} />
        ) : items.data.length === 0 ? (
          <Empty>{t.inventory.items.empty}</Empty>
        ) : (
          <Table
            head={[
              t.common.code,
              t.common.name,
              t.inventory.items.kind,
              t.common.unit,
              t.inventory.items.standardCost,
              t.inventory.items.minQty,
            ]}
          >
            {items.data.map((i) => (
              <tr key={i.id}>
                <Td>
                  <Num>{i.code}</Num>
                </Td>
                <Td>{name(i)}</Td>
                <Td>{t.inventory.items.kinds[i.kind] ?? i.kind}</Td>
                <Td>
                  {unitsFor(i)
                    .map((u) => t.units[u] ?? u)
                    .join(' · ')}
                </Td>
                <Td>
                  <Num>{i.standardCost}</Num>
                </Td>
                <Td>{i.minQty ? <Num>{quantity(i.minQty, i.baseUnit)}</Num> : '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Recipes ──────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  nameAr: string;
  nameEn: string;
  variants: { id: string }[];
}
interface Recipe {
  variantId: string;
  versions: {
    id: string;
    version: number;
    status: string;
    yieldQty: string;
    effectiveFrom: string;
    lines: { itemId: string; qty: string; unit: string; wastePct: string }[];
  }[];
}

function RecipesTab({ can }: { can: Can }) {
  const { t, name, quantity, dateTime } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/catalog/products') });
  const variants = (products.data ?? []).flatMap((p) =>
    p.variants.map((v, i) => ({ id: v.id, label: `${name(p)}${p.variants.length > 1 ? ` #${i + 1}` : ''}` })),
  );
  const [variantId, setVariantId] = useState('');
  const recipes = useQuery({
    queryKey: ['recipes', variantId],
    queryFn: () => api<Recipe[]>(`/inventory/recipes?variantId=${variantId}`),
    enabled: !!variantId,
  });
  const versions = recipes.data?.[0]?.versions ?? [];
  const active = versions.find((v) => v.status === 'active');
  const [yieldQty, setYieldQty] = useState('1');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const pick = (id: string) => {
    setVariantId(id);
    setLines([emptyLine()]);
  };
  const editActive = () => {
    if (!active) return;
    setYieldQty(active.yieldQty);
    setLines(active.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unit: l.unit, extra: l.wastePct })));
  };
  const save = useMutation({
    mutationFn: () =>
      api('/inventory/recipes', {
        method: 'POST',
        body: {
          variantId,
          yieldQty,
          lines: filled(lines).map((l) => ({ itemId: l.itemId, qty: l.qty, unit: l.unit, wastePct: l.extra || '0' })),
        },
      }),
    onSuccess: () => {
      setLines([emptyLine()]);
      void qc.invalidateQueries({ queryKey: ['recipes', variantId] });
    },
  });
  const item = (id: string) => items.data?.find((i) => i.id === id);
  return (
    <div className="flex flex-col gap-4">
      <Card title={t.inventory.recipes.title}>
        <Field label={t.inventory.recipes.product}>
          <Select value={variantId} onChange={(e) => pick(e.target.value)}>
            <option value="">{t.common.choose}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        {!variantId ? (
          <p className="mt-4 text-sm text-muted">{t.inventory.recipes.pick}</p>
        ) : recipes.isPending ? (
          <Loading />
        ) : recipes.isError ? (
          <ErrorState error={recipes.error} onRetry={() => recipes.refetch()} />
        ) : !active ? (
          <p className="mt-4 text-sm text-muted">{t.inventory.recipes.none}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-muted">
              {t.inventory.recipes.current} · {t.inventory.recipes.version} <Num>{active.version}</Num> ·{' '}
              {dateTime(active.effectiveFrom)} · {t.inventory.recipes.yield} <Num>{active.yieldQty}</Num>
            </p>
            <Table head={[t.common.item, t.common.qty, t.inventory.recipes.wastePct]}>
              {active.lines.map((l, i) => (
                <tr key={i}>
                  <Td>{item(l.itemId) ? `${item(l.itemId)!.code} — ${name(item(l.itemId)!)}` : '—'}</Td>
                  <Td>
                    <Num>{quantity(l.qty, l.unit)}</Num>
                  </Td>
                  <Td>
                    <Num>{l.wastePct}</Num>
                  </Td>
                </tr>
              ))}
            </Table>
            {can('recipes.manage') && (
              <div>
                <Button variant="secondary" onClick={editActive}>
                  {t.inventory.recipes.newVersion}…
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
      {variantId && can('recipes.manage') && items.data && (
        <Card title={t.inventory.recipes.newVersion}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <p className="text-sm text-muted">{t.inventory.recipes.hint}</p>
            <div className="max-w-xs">
              <Field label={t.inventory.recipes.yield} error={fieldErrors(save.error).yieldQty}>
                <Input dir="ltr" inputMode="decimal" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} />
              </Field>
            </div>
            <LinesEditor
              lines={lines}
              onChange={setLines}
              items={items.data}
              extra={{ label: t.inventory.recipes.wastePct, field: 'wastePct' }}
              errors={fieldErrors(save.error)}
            />
            <FormError error={save.error} />
            <div>
              <Button type="submit" disabled={save.isPending || filled(lines).length === 0}>
                {t.inventory.recipes.newVersion}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

// ── Adjustments ──────────────────────────────────────────────────────────────

interface AdjustmentRow {
  id: string;
  number: string;
  kind: string;
  reason: string;
  warehouseId: string;
  postedAt: string;
}

function AdjustmentsTab({ can }: { can: Can }) {
  const { t, dateTime } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const warehouses = useWarehouses();
  const list = useQuery({
    queryKey: ['adjustments'],
    queryFn: () => api<AdjustmentRow[]>('/inventory/adjustments'),
  });
  const stockWarehouses = (warehouses.data ?? []).filter((w) => w.kind !== 'transit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ warehouseId: '', kind: 'adjustment', reason: '' });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const withCost = form.kind === 'opening_balance';
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: () =>
      api('/inventory/adjustments', {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: {
          warehouseId: form.warehouseId || stockWarehouses[0]?.id,
          kind: form.kind,
          reason: form.reason,
          lines: filled(lines).map((l) => ({
            itemId: l.itemId,
            qty: l.qty.trim(),
            unit: l.unit,
            ...(withCost && l.extra ? { unitCost: l.extra } : {}),
          })),
        },
      }),
    onSuccess: () => {
      idem.renew();
      setOpen(false);
      setLines([emptyLine()]);
      setForm({ ...form, reason: '' });
      void qc.invalidateQueries({ queryKey: ['adjustments'] });
      void qc.invalidateQueries({ queryKey: ['balances'] });
    },
  });
  const errs = fieldErrors(create.error);
  const wh = (id: string) => warehouses.data?.find((w) => w.id === id);
  return (
    <div className="flex flex-col gap-4">
      {open && items.data && (
        <Card title={t.inventory.adjustments.add}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.common.warehouse} error={errs.warehouseId}>
                <Select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                  {stockWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {warehouseLabel(w)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t.inventory.adjustments.kind}
                hint={form.kind === 'adjustment' ? t.inventory.adjustments.signedHint : undefined}
              >
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {Object.entries(t.inventory.adjustments.kinds).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.common.reason} error={errs.reason}>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  aria-invalid={!!errs.reason}
                />
              </Field>
            </div>
            <LinesEditor
              lines={lines}
              onChange={setLines}
              items={items.data}
              signed={form.kind === 'adjustment'}
              extra={withCost ? { label: t.inventory.adjustments.unitCost, field: 'unitCost' } : undefined}
              errors={errs}
            />
            <FormError error={create.error} />
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending || filled(lines).length === 0}>
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
        title={t.inventory.adjustments.title}
        actions={
          !open &&
          can('inventory.adjust') && <Button onClick={() => setOpen(true)}>{t.inventory.adjustments.add}</Button>
        }
      >
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <Empty>{t.inventory.adjustments.empty}</Empty>
        ) : (
          <Table
            head={[t.common.number, t.common.date, t.inventory.adjustments.kind, t.common.warehouse, t.common.reason]}
          >
            {list.data.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Num>{a.number}</Num>
                </Td>
                <Td>{dateTime(a.postedAt)}</Td>
                <Td>{t.inventory.adjustments.kinds[a.kind] ?? a.kind}</Td>
                <Td>
                  <Num>{wh(a.warehouseId)?.code}</Num>
                </Td>
                <Td>{a.reason}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Counts ───────────────────────────────────────────────────────────────────

interface CountRow {
  id: string;
  number: string;
  warehouseId: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
}
interface CountDetail extends CountRow {
  lines: { id: string; itemId: string; systemQty: string; countedQty: string | null; differenceQty: string | null }[];
}

function CountsTab({ go, can }: { go: Go; can: Can }) {
  const { t, dateTime } = useI18n();
  const qc = useQueryClient();
  const warehouses = useWarehouses();
  const list = useQuery({ queryKey: ['counts'], queryFn: () => api<CountRow[]>('/inventory/counts') });
  const stockWarehouses = (warehouses.data ?? []).filter((w) => w.kind !== 'transit');
  const [warehouseId, setWarehouseId] = useState('');
  const start = useMutation({
    mutationFn: () =>
      api<CountRow>('/inventory/counts', {
        method: 'POST',
        body: { warehouseId: warehouseId || stockWarehouses[0]?.id },
      }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['counts'] });
      go(`/inventory/counts/${c.id}`);
    },
  });
  const wh = (id: string) => warehouses.data?.find((w) => w.id === id);
  return (
    <div className="flex flex-col gap-4">
      {can('inventory.manage') && (
        <Card title={t.inventory.counts.start}>
          <form
            className="flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            <Field label={t.common.warehouse}>
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {stockWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {warehouseLabel(w)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={start.isPending || stockWarehouses.length === 0}>
              {t.inventory.counts.start}
            </Button>
            <div className="basis-full">
              <FormError error={start.error} />
            </div>
          </form>
        </Card>
      )}
      <Card title={t.inventory.counts.title}>
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <Empty>{t.inventory.counts.empty}</Empty>
        ) : (
          <Table head={[t.common.number, t.common.warehouse, t.common.date, t.common.status]}>
            {list.data.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer hover:bg-surface"
                onClick={() => go(`/inventory/counts/${c.id}`)}
              >
                <Td>
                  <a href={`#/inventory/counts/${c.id}`} className="num font-medium text-brand-700 hover:underline">
                    {c.number}
                  </a>
                </Td>
                <Td>
                  <Num>{wh(c.warehouseId)?.code}</Num>
                </Td>
                <Td>{dateTime(c.createdAt)}</Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function CountDetail({ id, back, can }: { id: string; back: () => void; can: Can }) {
  const { t, name, quantity } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const count = useQuery({ queryKey: ['count', id], queryFn: () => api<CountDetail>(`/inventory/counts/${id}`) });
  const [entered, setEntered] = useState<Record<string, string>>({});
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['count', id] });
    void qc.invalidateQueries({ queryKey: ['counts'] });
    void qc.invalidateQueries({ queryKey: ['balances'] });
  };
  const item = (itemId: string) => items.data?.find((i) => i.id === itemId);
  const saveLines = useMutation({
    mutationFn: () =>
      api(`/inventory/counts/${id}/lines`, {
        method: 'PUT',
        body: {
          lines: Object.entries(entered)
            .filter(([, v]) => v.trim() !== '')
            .map(([itemId, countedQty]) => ({ itemId, countedQty: countedQty.trim(), unit: item(itemId)!.baseUnit })),
        },
      }),
    onSuccess: () => {
      setEntered({});
      refresh();
    },
  });
  const approveKey = useIdempotencyKey();
  const approve = useMutation({
    mutationFn: () => api(`/inventory/counts/${id}/approve`, { method: 'POST', idempotencyKey: approveKey.key() }),
    onSuccess: () => {
      approveKey.renew();
      refresh();
    },
  });
  if (count.isPending || items.isPending) return <Loading />;
  if (count.isError) return <ErrorState error={count.error} onRetry={() => count.refetch()} />;
  const c = count.data;
  const editable = c.status === 'in_progress' && can('inventory.manage');
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.inventory.counts.back} />
      <Card title={`${t.inventory.counts.one} ${c.number}`} actions={<StatusBadge status={c.status} />}>
        <div className="flex flex-col gap-4">
          {c.status === 'in_progress' && <Alert>{t.inventory.counts.approveHint}</Alert>}
          <Table
            head={[t.common.item, t.inventory.counts.system, t.inventory.counts.counted, t.inventory.counts.difference]}
          >
            {c.lines.map((l) => {
              const it = item(l.itemId);
              return (
                <tr key={l.id}>
                  <Td>{it ? `${it.code} — ${name(it)}` : '—'}</Td>
                  <Td>
                    <Num>{quantity(l.systemQty, it?.baseUnit ?? '')}</Num>
                  </Td>
                  <Td>
                    {editable ? (
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`${t.inventory.counts.counted} ${it?.code ?? ''}`}
                          dir="ltr"
                          inputMode="decimal"
                          className="w-28"
                          placeholder={l.countedQty ?? ''}
                          value={entered[l.itemId] ?? ''}
                          onChange={(e) => setEntered({ ...entered, [l.itemId]: e.target.value })}
                        />
                        <span className="text-xs text-muted">{t.units[it?.baseUnit ?? ''] ?? ''}</span>
                      </div>
                    ) : l.countedQty !== null ? (
                      <Num>{quantity(l.countedQty, it?.baseUnit ?? '')}</Num>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>{l.differenceQty !== null ? <Num>{quantity(l.differenceQty, it?.baseUnit ?? '')}</Num> : '—'}</Td>
                </tr>
              );
            })}
          </Table>
          <FormError error={saveLines.error ?? approve.error} />
          {c.status === 'in_progress' && (
            <div className="flex flex-wrap gap-2">
              {editable && (
                <Button
                  variant="secondary"
                  disabled={saveLines.isPending || !Object.values(entered).some((v) => v.trim())}
                  onClick={() => saveLines.mutate()}
                >
                  {t.inventory.counts.saveCounts}
                </Button>
              )}
              {can('inventory.count.approve') && (
                <Button
                  disabled={approve.isPending || Object.values(entered).some((v) => v.trim())}
                  onClick={() => approve.mutate()}
                >
                  {t.inventory.counts.approve}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Transfers ────────────────────────────────────────────────────────────────

interface TransferRow {
  id: string;
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: string;
  createdAt: string;
}
interface TransferDetail extends TransferRow {
  lines: { id: string; itemId: string; qtySent: string; qtyReceived: string | null; unitCost: string | null }[];
}

function TransfersTab({ go, can }: { go: Go; can: Can }) {
  const { t, dateTime } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const warehouses = useWarehouses();
  const list = useQuery({ queryKey: ['transfers'], queryFn: () => api<TransferRow[]>('/inventory/transfers') });
  const stockWarehouses = (warehouses.data ?? []).filter((w) => w.kind !== 'transit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fromWarehouseId: '', toWarehouseId: '' });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  // Any branch's store can receive; the source must be one of the caller's own warehouses.
  const destinations = useQuery({
    queryKey: ['warehouses', 'destinations'],
    queryFn: () => api<Warehouse[]>('/inventory/warehouses?destinations=true'),
  });
  const fromId = form.fromWarehouseId || stockWarehouses[0]?.id || '';
  const defaultTo = destinations.data?.find((w) => w.id !== fromId)?.id ?? '';
  const create = useMutation({
    mutationFn: () =>
      api<TransferRow>('/inventory/transfers', {
        method: 'POST',
        body: {
          fromWarehouseId: fromId,
          toWarehouseId: form.toWarehouseId || defaultTo,
          lines: filled(lines).map((l) => ({ itemId: l.itemId, qty: l.qty.trim(), unit: l.unit })),
        },
      }),
    onSuccess: (tr) => {
      void qc.invalidateQueries({ queryKey: ['transfers'] });
      go(`/inventory/transfers/${tr.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  const wh = (id: string) => destinations.data?.find((w) => w.id === id);
  return (
    <div className="flex flex-col gap-4">
      {open && items.data && (
        <Card title={t.inventory.transfers.add}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.inventory.transfers.from} error={errs.fromWarehouseId}>
                <Select value={fromId} onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })}>
                  {stockWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {warehouseLabel(w)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.inventory.transfers.to} error={errs.toWarehouseId}>
                <Select
                  value={form.toWarehouseId || defaultTo}
                  onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}
                >
                  {destinations.data?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {warehouseLabel(w)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <LinesEditor lines={lines} onChange={setLines} items={items.data} errors={errs} />
            <FormError error={create.error} />
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending || filled(lines).length === 0}>
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
        title={t.inventory.transfers.title}
        actions={
          !open && can('inventory.manage') && <Button onClick={() => setOpen(true)}>{t.inventory.transfers.add}</Button>
        }
      >
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <Empty>{t.inventory.transfers.empty}</Empty>
        ) : (
          <Table
            head={[
              t.common.number,
              t.inventory.transfers.from,
              t.inventory.transfers.to,
              t.common.date,
              t.common.status,
            ]}
          >
            {list.data.map((tr) => (
              <tr
                key={tr.id}
                className="cursor-pointer hover:bg-surface"
                onClick={() => go(`/inventory/transfers/${tr.id}`)}
              >
                <Td>
                  <a href={`#/inventory/transfers/${tr.id}`} className="num font-medium text-brand-700 hover:underline">
                    {tr.number}
                  </a>
                </Td>
                <Td>
                  <Num>{wh(tr.fromWarehouseId)?.code ?? '—'}</Num>
                </Td>
                <Td>
                  <Num>{wh(tr.toWarehouseId)?.code ?? '—'}</Num>
                </Td>
                <Td>{dateTime(tr.createdAt)}</Td>
                <Td>
                  <StatusBadge status={tr.status} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function TransferDetail({ id, back, can }: { id: string; back: () => void; can: Can }) {
  const { t, name, quantity } = useI18n();
  const qc = useQueryClient();
  const items = useItems();
  const warehouses = useWarehouses();
  const destinations = useQuery({
    queryKey: ['warehouses', 'destinations'],
    queryFn: () => api<Warehouse[]>('/inventory/warehouses?destinations=true'),
  });
  const transfer = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => api<TransferDetail>(`/inventory/transfers/${id}`),
  });
  const [received, setReceived] = useState<Record<string, string>>({});
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['transfer', id] });
    void qc.invalidateQueries({ queryKey: ['transfers'] });
    void qc.invalidateQueries({ queryKey: ['balances'] });
  };
  const item = (itemId: string) => items.data?.find((i) => i.id === itemId);
  // Dispatch and receipt are separate submissions, each with its own key.
  const dispatchKey = useIdempotencyKey();
  const receiveKey = useIdempotencyKey();
  const dispatch = useMutation({
    mutationFn: () => api(`/inventory/transfers/${id}/dispatch`, { method: 'POST', idempotencyKey: dispatchKey.key() }),
    onSuccess: () => {
      dispatchKey.renew();
      refresh();
    },
  });
  const receive = useMutation({
    mutationFn: (lines: TransferDetail['lines']) =>
      api(`/inventory/transfers/${id}/receive`, {
        method: 'POST',
        idempotencyKey: receiveKey.key(),
        body: {
          lines: lines.map((l) => ({
            itemId: l.itemId,
            qtyReceived: (received[l.itemId] ?? l.qtySent).trim(),
            unit: item(l.itemId)!.baseUnit,
          })),
        },
      }),
    onSuccess: () => {
      receiveKey.renew();
      refresh();
    },
  });
  if (transfer.isPending || items.isPending) return <Loading />;
  if (transfer.isError) return <ErrorState error={transfer.error} onRetry={() => transfer.refetch()} />;
  const tr = transfer.data;
  const wh = (wid: string) => destinations.data?.find((w) => w.id === wid);
  const mine = (wid: string) => !!warehouses.data?.some((w) => w.id === wid);
  // Dispatch from the source, receive at the destination: only staff of that side (the API checks it too).
  const canDispatch = tr.status === 'draft' && can('inventory.manage') && mine(tr.fromWarehouseId);
  const canReceive = tr.status === 'dispatched' && can('inventory.manage') && mine(tr.toWarehouseId);
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.inventory.transfers.back} />
      <Card title={`${t.inventory.transfers.one} ${tr.number}`} actions={<StatusBadge status={tr.status} />}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {t.inventory.transfers.from} <Num>{wh(tr.fromWarehouseId)?.code ?? '—'}</Num> → {t.inventory.transfers.to}{' '}
            <Num>{wh(tr.toWarehouseId)?.code ?? '—'}</Num>
          </p>
          {canReceive && <Alert>{t.inventory.transfers.receiveHint}</Alert>}
          <Table head={[t.common.item, t.inventory.transfers.sent, t.inventory.transfers.received]}>
            {tr.lines.map((l) => {
              const it = item(l.itemId);
              return (
                <tr key={l.id}>
                  <Td>{it ? `${it.code} — ${name(it)}` : '—'}</Td>
                  <Td>
                    <Num>{quantity(l.qtySent, it?.baseUnit ?? '')}</Num>
                  </Td>
                  <Td>
                    {canReceive ? (
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`${t.inventory.transfers.received} ${it?.code ?? ''}`}
                          dir="ltr"
                          inputMode="decimal"
                          className="w-28"
                          value={received[l.itemId] ?? l.qtySent}
                          onChange={(e) => setReceived({ ...received, [l.itemId]: e.target.value })}
                        />
                        <span className="text-xs text-muted">{t.units[it?.baseUnit ?? ''] ?? ''}</span>
                      </div>
                    ) : l.qtyReceived !== null ? (
                      <Num>{quantity(l.qtyReceived, it?.baseUnit ?? '')}</Num>
                    ) : (
                      '—'
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <FormError error={dispatch.error ?? receive.error} />
          <div className="flex gap-2">
            {canDispatch && (
              <Button disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
                {t.inventory.transfers.dispatch}
              </Button>
            )}
            {canReceive && (
              <Button disabled={receive.isPending} onClick={() => receive.mutate(tr.lines)}>
                {t.inventory.transfers.receive}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Movements ────────────────────────────────────────────────────────────────

interface Movement {
  id: string;
  warehouseId: string;
  itemId: string;
  movementType: string;
  qtyBase: string;
  totalCost: string;
  postedAt: string;
}

function MovementsTab() {
  const { t, name, money, quantity, dateTime } = useI18n();
  const items = useItems();
  const warehouses = useWarehouses();
  const [page, setPage] = useState(1);
  const [itemId, setItemId] = useState('');
  const pageSize = 50;
  const list = useQuery({
    queryKey: ['movements', page, itemId],
    queryFn: () =>
      api<{ items: Movement[]; total: number }>(
        `/inventory/movements?page=${page}&pageSize=${pageSize}${itemId ? `&itemId=${itemId}` : ''}`,
      ),
  });
  const item = (id: string) => items.data?.find((i) => i.id === id);
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));
  return (
    <Card
      title={t.inventory.movements.title}
      actions={
        <Select
          aria-label={t.common.item}
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t.common.all}</option>
          {items.data?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} — {name(i)}
            </option>
          ))}
        </Select>
      }
    >
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <Empty>{t.inventory.movements.empty}</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <Table
            head={[
              t.common.date,
              t.common.warehouse,
              t.common.item,
              t.inventory.movements.type,
              t.common.qty,
              t.common.value,
            ]}
          >
            {list.data.items.map((m) => {
              const it = item(m.itemId);
              return (
                <tr key={m.id}>
                  <Td>{dateTime(m.postedAt)}</Td>
                  <Td>
                    <Num>{warehouses.data?.find((w) => w.id === m.warehouseId)?.code ?? '—'}</Num>
                  </Td>
                  <Td>{it ? `${it.code} — ${name(it)}` : '—'}</Td>
                  <Td>{t.movementTypes[m.movementType] ?? m.movementType}</Td>
                  <Td>
                    <Num>{quantity(m.qtyBase, it?.baseUnit ?? '')}</Num>
                  </Td>
                  <Td>
                    <Num>{money(m.totalCost)}</Num>
                  </Td>
                </tr>
              );
            })}
          </Table>
          <div className="flex items-center justify-end gap-2 text-sm">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t.common.previous}
            </Button>
            <Num>
              {page} / {pages}
            </Num>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t.common.next}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
