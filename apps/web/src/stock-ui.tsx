import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorCode, fieldErrors } from './api';
import { useI18n } from './i18n';
import { Alert, Badge, Button, Input, Select } from './ui';

/** Shared by the inventory and purchasing screens. */

export interface Item {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  kind: string;
  baseUnit: 'g' | 'ml' | 'pc';
  standardCost: string;
  conversions: Record<string, string>;
  minQty: string | null;
  archivedAt: string | null;
}
export interface Warehouse {
  id: string;
  code: string;
  name: string;
  kind: string;
  branchId: string | null;
}

export const useItems = () =>
  useQuery({ queryKey: ['inventory-items'], queryFn: () => api<Item[]>('/inventory/items') });
export const useWarehouses = () =>
  useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/inventory/warehouses') });

const BUILT_IN: Record<Item['baseUnit'], string[]> = { g: ['g', 'kg'], ml: ['ml', 'l'], pc: ['pc', 'dozen'] };
/** Units an item can be entered in: the built-in units of its dimension plus its own conversions. */
export const unitsFor = (item?: Item) =>
  item ? [...BUILT_IN[item.baseUnit], ...Object.keys(item.conversions ?? {})] : [];

// ── Exact money arithmetic for forms (integer cents; never floating point, ADR-0006) ──
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
export const isMoney = (v: string) => MONEY.test(v.trim());
export const cents = (v: string): bigint => {
  const s = v.trim();
  if (!MONEY.test(s)) return 0n;
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'));
};
export const fromCents = (c: bigint) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};
/** Rounded half up to the cent: amount × percent / 100. */
export const percentOf = (amount: string, percent: bigint) => fromCents((cents(amount) * percent + 50n) / 100n);

/** Base-unit quantity left = a − b − c, as a display string (inputs are DB decimals). */
export const subtractQty = (a: string, ...rest: string[]) => {
  const scale = (v: string) => {
    const [w, f = ''] = v.replace(/^-/, '').split('.');
    const n = BigInt(w!) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6));
    return v.startsWith('-') ? -n : n;
  };
  const n = rest.reduce((s, v) => s - scale(v), scale(a));
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const frac = String(abs % 1_000_000n)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return `${neg ? '-' : ''}${abs / 1_000_000n}${frac ? `.${frac}` : ''}`;
};
export const isPositive = (v: string) => /^\d{1,9}(\.\d{1,6})?$/.test(v.trim()) && !/^0+(\.0+)?$/.test(v.trim());

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? 'page' : undefined}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-ink aria-[current=page]:border-brand-600 aria-[current=page]:font-medium aria-[current=page]:text-brand-700"
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone =
    status === 'received' || status === 'paid' || status === 'approved'
      ? 'success'
      : status === 'cancelled'
        ? 'danger'
        : status === 'draft'
          ? 'neutral'
          : 'warning';
  return <Badge tone={tone}>{t.status[status] ?? status}</Badge>;
}

export const Num = ({ children }: { children: ReactNode }) => <span className="num">{children}</span>;

/** A form-level API error that is not tied to a field. */
export function FormError({ error }: { error: unknown }) {
  const { error: message } = useI18n();
  if (!error || Object.keys(fieldErrors(error)).length) return null;
  return <Alert tone="danger">{message(errorCode(error))}</Alert>;
}

export interface LineDraft {
  itemId: string;
  qty: string;
  unit: string;
  extra: string;
}
export const emptyLine = (): LineDraft => ({ itemId: '', qty: '', unit: '', extra: '' });

/**
 * Item / quantity / unit lines with an optional extra column (price, unit cost, waste). Field errors from the
 * API arrive as `lines.<i>.<field>` and are shown on the matching input.
 */
export function LinesEditor({
  lines,
  onChange,
  items,
  extra,
  errors = {},
  signed = false,
}: {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  items: Item[];
  extra?: { label: string; field: string };
  errors?: Record<string, string>;
  signed?: boolean;
}) {
  const { t, name } = useI18n();
  const set = (i: number, patch: Partial<LineDraft>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const err = (i: number, f: string) => errors[`lines.${i}.${f}`];
  return (
    <fieldset className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="px-1 py-1 text-start font-medium">
                {t.common.item}
              </th>
              <th scope="col" className="px-1 py-1 text-start font-medium">
                {t.common.qty}
              </th>
              <th scope="col" className="px-1 py-1 text-start font-medium">
                {t.common.unit}
              </th>
              {extra && (
                <th scope="col" className="px-1 py-1 text-start font-medium">
                  {extra.label}
                </th>
              )}
              <th scope="col" className="w-0" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const item = items.find((x) => x.id === l.itemId);
              const units = unitsFor(item);
              return (
                <tr key={i} className="align-top">
                  <td className="p-1">
                    <Select
                      aria-label={t.common.item}
                      className="w-full"
                      value={l.itemId}
                      onChange={(e) => {
                        const next = items.find((x) => x.id === e.target.value);
                        set(i, { itemId: e.target.value, unit: next ? next.baseUnit : '' });
                      }}
                      aria-invalid={!!err(i, 'itemId')}
                    >
                      <option value="">{t.common.choose}</option>
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.code} — {name(x)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1">
                    <Input
                      aria-label={t.common.qty}
                      inputMode="decimal"
                      dir="ltr"
                      className="w-28"
                      value={l.qty}
                      placeholder={signed ? '±0' : '0'}
                      onChange={(e) => set(i, { qty: e.target.value })}
                      aria-invalid={!!err(i, 'qty')}
                    />
                    {err(i, 'qty') && <p className="text-xs text-danger">{err(i, 'qty')}</p>}
                  </td>
                  <td className="p-1">
                    <Select
                      aria-label={t.common.unit}
                      value={l.unit}
                      onChange={(e) => set(i, { unit: e.target.value })}
                      disabled={!item}
                    >
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {t.units[u] ?? u}
                        </option>
                      ))}
                    </Select>
                  </td>
                  {extra && (
                    <td className="p-1">
                      <Input
                        aria-label={extra.label}
                        inputMode="decimal"
                        dir="ltr"
                        className="w-28"
                        value={l.extra}
                        onChange={(e) => set(i, { extra: e.target.value })}
                        aria-invalid={!!err(i, extra.field)}
                      />
                      {err(i, extra.field) && <p className="text-xs text-danger">{err(i, extra.field)}</p>}
                    </td>
                  )}
                  <td className="p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t.common.remove}
                      disabled={lines.length === 1}
                      onClick={() => onChange(lines.filter((_, j) => j !== i))}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button type="button" variant="secondary" onClick={() => onChange([...lines, emptyLine()])}>
          + {t.common.addLine}
        </Button>
      </div>
    </fieldset>
  );
}
