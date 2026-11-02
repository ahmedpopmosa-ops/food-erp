import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorCode, fieldErrors } from './api';
import { useI18n } from './i18n';
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Loading, Select } from './ui';
import { FormError, Num, Tabs } from './stock-ui';

type Can = (permission: string) => boolean;

interface Branch {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}
interface Station {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  delayThresholdSec: number;
  isDefault: boolean;
  isActive: boolean;
  routes: { categoryId: string }[];
}
interface Ticket {
  id: string;
  ticketNo: number;
  label: string;
  channel: string;
  status: 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
  firedAt: string;
  elapsedSec: number;
  delayed: boolean;
  delayThresholdSec: number;
  station: { id: string; nameAr: string; nameEn: string } | null;
  items: {
    id: string;
    nameAr: string;
    nameEn: string;
    qty: string;
    voidedAt: string | null;
    modifiers: { nameAr: string; nameEn: string }[];
  }[];
}

/** Remembered per screen (a kitchen tablet stays on its branch and station). */
const remember = (key: string) => {
  try {
    return localStorage.getItem(`ros.kitchen.${key}`) ?? '';
  } catch {
    return '';
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(`ros.kitchen.${key}`, value);
  } catch {
    /* per-screen convenience only */
  }
};

export function KitchenPage({ tab, can }: { tab?: string; can: Can }) {
  const { t, name } = useI18n();
  const branches = useQuery({ queryKey: ['kitchen-branches'], queryFn: () => api<Branch[]>('/kitchen/branches') });
  const [branchId, setBranchId] = useState(remember('branch'));
  const branch = branches.data?.find((b) => b.id === branchId) ?? branches.data?.[0];
  const current = tab === 'stations' && can('catalog.manage') ? 'stations' : 'display';
  const tabs = [
    { key: 'display', label: t.kitchen.tabs.display, href: '#/kitchen' },
    ...(can('catalog.manage') ? [{ key: 'stations', label: t.kitchen.tabs.stations, href: '#/kitchen/stations' }] : []),
  ];
  if (branches.isPending) return <Loading />;
  if (branches.isError) return <ErrorState error={branches.error} onRetry={() => branches.refetch()} />;
  if (!branch) return <Empty>{t.kitchen.noBranch}</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={tabs} current={current} />
        {branches.data.length > 1 && (
          <Select
            aria-label={t.devices.branch}
            value={branch.id}
            onChange={(e) => {
              setBranchId(e.target.value);
              store('branch', e.target.value);
            }}
          >
            {branches.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {name(b)}
              </option>
            ))}
          </Select>
        )}
      </div>
      {current === 'stations' ? <StationsSetup branchId={branch.id} /> : <Display branchId={branch.id} can={can} />}
    </div>
  );
}

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Display({ branchId, can }: { branchId: string; can: Can }) {
  const { t, name, error } = useI18n();
  const qc = useQueryClient();
  const stations = useQuery({
    queryKey: ['kitchen-stations', branchId],
    queryFn: () => api<Station[]>(`/kitchen/stations?branchId=${branchId}`),
  });
  const [stationId, setStationId] = useState(remember('station'));
  const [view, setView] = useState<'active' | 'done'>('active');
  const station = stations.data?.find((s) => s.id === stationId);
  const qs = `branchId=${branchId}${station ? `&stationId=${station.id}` : ''}&view=${view}`;
  const tickets = useQuery({
    queryKey: ['kitchen-tickets', qs],
    queryFn: async () => ({ ...(await api<{ tickets: Ticket[] }>(`/kitchen/tickets?${qs}`)), fetchedAt: Date.now() }),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
  // A one-second tick for the timers between polls.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const move = useMutation({
    mutationFn: (m: { id: string; from: string; to: string }) =>
      api(`/kitchen/tickets/${m.id}/status`, { method: 'POST', body: { from: m.from, to: m.to } }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['kitchen-tickets'] }),
  });
  const canMove = can('kitchen.update');
  const running = (tk: Ticket) => tk.status === 'new' || tk.status === 'preparing';
  const elapsed = (tk: Ticket) =>
    tk.elapsedSec + (running(tk) && tickets.data ? (now - tickets.data.fetchedAt) / 1000 : 0);
  const late = (tk: Ticket) => running(tk) && elapsed(tk) > tk.delayThresholdSec;
  const actions = (tk: Ticket): { to: 'preparing' | 'ready' | 'served'; label: string; primary?: boolean }[] =>
    tk.status === 'new'
      ? [
          { to: 'preparing', label: t.kitchen.start, primary: true },
          { to: 'ready', label: t.kitchen.ready },
        ]
      : tk.status === 'preparing'
        ? [{ to: 'ready', label: t.kitchen.ready, primary: true }]
        : tk.status === 'ready'
          ? [
              { to: 'served', label: t.kitchen.served, primary: true },
              { to: 'preparing', label: t.kitchen.recall },
            ]
          : [];
  const tone = (s: Ticket['status']) =>
    s === 'ready' ? 'success' : s === 'cancelled' ? 'danger' : s === 'preparing' ? 'warning' : 'neutral';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={t.kitchen.station}
          value={station?.id ?? ''}
          onChange={(e) => {
            setStationId(e.target.value);
            store('station', e.target.value);
          }}
        >
          <option value="">{t.kitchen.allStations}</option>
          {stations.data
            ?.filter((s) => s.isActive)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {name(s)}
              </option>
            ))}
        </Select>
        <Button variant={view === 'active' ? 'primary' : 'secondary'} onClick={() => setView('active')}>
          {t.kitchen.active}
        </Button>
        <Button variant={view === 'done' ? 'primary' : 'secondary'} onClick={() => setView('done')}>
          {t.kitchen.done}
        </Button>
        {tickets.isFetching && <span className="text-xs text-muted">{t.loading}</span>}
        {move.isError && (
          <span role="alert" className="text-sm text-danger">
            {error(errorCode(move.error))}
          </span>
        )}
      </div>
      {tickets.isPending ? (
        <Loading />
      ) : tickets.isError ? (
        <ErrorState error={tickets.error} onRetry={() => tickets.refetch()} />
      ) : tickets.data.tickets.length === 0 ? (
        <Empty>{view === 'active' ? t.kitchen.empty : t.kitchen.emptyDone}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tickets.data.tickets.map((tk) => (
            <article
              key={tk.id}
              aria-label={`${t.kitchen.ticket} ${tk.ticketNo}`}
              className={`flex flex-col gap-3 rounded-lg border-2 bg-white p-4 ${
                late(tk) ? 'border-red-500 bg-red-50' : tk.status === 'ready' ? 'border-brand-600' : 'border-line'
              }`}
            >
              <header className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold">
                    <Num>#{tk.ticketNo}</Num> · {tk.label}
                  </p>
                  <p className="text-xs text-muted">
                    {tk.station ? name(tk.station) : ''} · {t.kitchen.channels[tk.channel] ?? tk.channel}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xl font-semibold ${late(tk) ? 'text-danger' : ''}`}>
                    <Num>{clock(elapsed(tk))}</Num>
                  </span>
                  <Badge tone={tone(tk.status)}>{t.kitchen.status[tk.status]}</Badge>
                </div>
              </header>
              {late(tk) && <p className="text-sm font-medium text-danger">{t.kitchen.delayed}</p>}
              <ul className="flex flex-col gap-1 text-lg">
                {tk.items.map((i) => (
                  <li key={i.id} className={i.voidedAt ? 'text-muted line-through' : ''}>
                    <span className="font-semibold">
                      <Num>{Number(i.qty)}</Num> ×
                    </span>{' '}
                    {name(i)}
                    {i.voidedAt && <span className="ms-2 text-xs no-underline">({t.kitchen.voided})</span>}
                    {i.modifiers.map((m, k) => (
                      <div key={k} className="ms-6 text-base text-muted">
                        + {name(m)}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
              {canMove && actions(tk).length > 0 && (
                <div className="mt-auto flex flex-wrap gap-2">
                  {actions(tk).map((a) => (
                    <Button
                      key={a.to}
                      variant={a.primary ? 'primary' : 'secondary'}
                      className="min-h-12 flex-1 text-base"
                      disabled={move.isPending}
                      onClick={() => move.mutate({ id: tk.id, from: tk.status, to: a.to })}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
}

function StationsSetup({ branchId }: { branchId: string }) {
  const { t, name } = useI18n();
  const qc = useQueryClient();
  const stations = useQuery({
    queryKey: ['kitchen-stations', branchId],
    queryFn: () => api<Station[]>(`/kitchen/stations?branchId=${branchId}`),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/catalog/categories') });
  const blank = { code: '', nameAr: '', nameEn: '', minutes: '10', isDefault: false, categoryIds: [] as string[] };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ minutes: '10', categoryIds: [] as string[] });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['kitchen-stations', branchId] });
  const create = useMutation({
    mutationFn: () =>
      api('/kitchen/stations', {
        method: 'POST',
        body: {
          branchId,
          code: form.code,
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          delayThresholdSec: Math.round(Number(form.minutes || '10') * 60),
          isDefault: form.isDefault,
          categoryIds: form.categoryIds,
        },
      }),
    onSuccess: () => {
      setForm(blank);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (u: { id: string; body: object }) =>
      api(`/kitchen/stations/${u.id}`, { method: 'PATCH', body: u.body }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const errs = fieldErrors(create.error);
  const owner = (categoryId: string) => stations.data?.find((s) => s.routes.some((r) => r.categoryId === categoryId));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const categoryChecks = (selected: string[], onChange: (ids: string[]) => void, self?: string) => (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="mb-1 text-sm font-medium">{t.kitchen.categories}</legend>
      {categories.data?.map((c) => {
        const other = owner(c.id);
        return (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={() => onChange(toggle(selected, c.id))}
            />
            {name(c)}
            {other && other.id !== self && !selected.includes(c.id) && (
              <span className="text-xs text-muted">({name(other)})</span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
  return (
    <div className="flex flex-col gap-4">
      <Card title={t.kitchen.addStation}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label={t.common.code} error={errs.code}>
              <Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label={t.products.nameAr} error={errs.nameAr}>
              <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            </Field>
            <Field label={t.products.nameEn} error={errs.nameEn}>
              <Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </Field>
            <Field label={t.kitchen.thresholdMinutes} error={errs.delayThresholdSec}>
              <Input
                dir="ltr"
                inputMode="numeric"
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            {t.kitchen.default}
          </label>
          {categoryChecks(form.categoryIds, (ids) => setForm({ ...form, categoryIds: ids }))}
          <p className="text-xs text-muted">{t.kitchen.routingHint}</p>
          <FormError error={create.error} />
          <div>
            <Button type="submit" disabled={create.isPending}>
              {t.create}
            </Button>
          </div>
        </form>
      </Card>
      <Card title={t.kitchen.tabs.stations}>
        {stations.isPending ? (
          <Loading />
        ) : stations.isError ? (
          <ErrorState error={stations.error} onRetry={() => stations.refetch()} />
        ) : stations.data.length === 0 ? (
          <Empty>{t.kitchen.noStations}</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {stations.data.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Num>{s.code}</Num>
                  <span className="font-medium">{name(s)}</span>
                  {s.isDefault && <Badge tone="success">{t.kitchen.default}</Badge>}
                  {!s.isActive && <Badge tone="danger">{t.kitchen.inactive}</Badge>}
                  <span className="text-sm text-muted">
                    {t.kitchen.thresholdMinutes}: <Num>{Math.round(s.delayThresholdSec / 60)}</Num>
                  </span>
                  <span className="text-sm text-muted">
                    ·{' '}
                    {s.routes
                      .map((r) => categories.data?.find((c) => c.id === r.categoryId))
                      .filter(Boolean)
                      .map((c) => name(c!))
                      .join('، ') || '—'}
                  </span>
                  <div className="ms-auto flex flex-wrap gap-1">
                    {!s.isDefault && s.isActive && (
                      <Button variant="ghost" onClick={() => update.mutate({ id: s.id, body: { isDefault: true } })}>
                        {t.kitchen.makeDefault}
                      </Button>
                    )}
                    {!s.isDefault && (
                      <Button
                        variant="ghost"
                        onClick={() => update.mutate({ id: s.id, body: { isActive: !s.isActive } })}
                      >
                        {s.isActive ? t.kitchen.deactivate : t.kitchen.activate}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditing(s.id);
                        setEdit({
                          minutes: String(Math.round(s.delayThresholdSec / 60)),
                          categoryIds: s.routes.map((r) => r.categoryId),
                        });
                      }}
                    >
                      {t.kitchen.edit}
                    </Button>
                  </div>
                </div>
                {editing === s.id && (
                  <div className="flex flex-col gap-3 rounded-md border border-line p-3">
                    <div className="max-w-xs">
                      <Field label={t.kitchen.thresholdMinutes}>
                        <Input
                          dir="ltr"
                          inputMode="numeric"
                          value={edit.minutes}
                          onChange={(e) => setEdit({ ...edit, minutes: e.target.value })}
                        />
                      </Field>
                    </div>
                    {categoryChecks(edit.categoryIds, (ids) => setEdit({ ...edit, categoryIds: ids }), s.id)}
                    <div className="flex gap-2">
                      <Button
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: s.id,
                            body: {
                              delayThresholdSec: Math.round(Number(edit.minutes || '10') * 60),
                              categoryIds: edit.categoryIds,
                            },
                          })
                        }
                      >
                        {t.save}
                      </Button>
                      <Button variant="secondary" onClick={() => setEditing(null)}>
                        {t.cancel}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <FormError error={update.error} />
      </Card>
    </div>
  );
}
