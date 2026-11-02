import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorCode, fieldErrors } from './api';
import { useI18n } from './i18n';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Input, Loading, Select, Table, Td } from './ui';

interface Branch {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}
interface DiningTable {
  id: string;
  label: string;
  seats: number;
  isActive: boolean;
  serviceAreaId: string;
}
interface Area {
  id: string;
  nameAr: string;
  nameEn: string;
  sort: number;
  tables: DiningTable[];
}

const NEW_AREA = '__new__';
const byLabel = (a: DiningTable, b: DiningTable) => a.label.localeCompare(b.label, undefined, { numeric: true });

/** Floor plan per branch: add tables (one or a numbered range), edit them, stop or resume using them. */
export function TablesPage({ canManage }: { canManage: boolean }) {
  const { t, name } = useI18n();
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/branches') });
  const [branchId, setBranchId] = useState('');
  const branch = branches.data?.find((b) => b.id === branchId) ?? branches.data?.[0];
  const plan = useQuery({
    queryKey: ['tables', branch?.id],
    queryFn: () => api<Area[]>(`/branches/${branch!.id}/tables`),
    enabled: !!branch,
  });

  if (branches.isPending) return <Loading />;
  if (branches.isError) return <ErrorState error={branches.error} onRetry={() => branches.refetch()} />;
  const areas = plan.data ?? [];
  const all = areas.flatMap((a) => a.tables);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.tables.title}</h1>
          <p className="text-sm text-muted">{t.tables.hint}</p>
        </div>
        <Field label={t.tables.branch}>
          <Select value={branch?.id ?? ''} onChange={(e) => setBranchId(e.target.value)}>
            {branches.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {name(b)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {branch && canManage && <AddTables key={branch.id} branchId={branch.id} areas={areas} />}

      {branch && (
        <Card
          title={name(branch)}
          actions={
            all.length > 0 && (
              <span className="text-sm text-muted">
                {t.tables.count(all.filter((x) => x.isActive).length, all.length)}
              </span>
            )
          }
        >
          {plan.isPending ? (
            <Loading />
          ) : plan.isError ? (
            <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
          ) : all.length === 0 ? (
            <Empty>{t.tables.empty}</Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {canManage && <p className="text-xs text-muted">{t.tables.stopHint}</p>}
              {areas
                .filter((a) => a.tables.length > 0)
                .map((a) => (
                  <section key={a.id} className="flex flex-col gap-2">
                    <h3 className="font-semibold">
                      {name(a)} <span className="text-sm font-normal text-muted">({a.tables.length})</span>
                    </h3>
                    <Table head={[t.tables.label, t.tables.seats, t.tables.area, t.tables.status, '']}>
                      {[...a.tables].sort(byLabel).map((table) => (
                        <TableRow
                          key={table.id}
                          table={table}
                          area={a}
                          areas={areas}
                          branchId={branch.id}
                          canManage={canManage}
                        />
                      ))}
                    </Table>
                  </section>
                ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/** Area picker: an existing area of the branch, or a new one named in both languages. */
function AreaFields({
  areas,
  value,
  onChange,
}: {
  areas: Area[];
  value: { areaId: string; nameAr: string; nameEn: string };
  onChange: (v: { areaId: string; nameAr: string; nameEn: string }) => void;
}) {
  const { t, name } = useI18n();
  return (
    <>
      <Field label={t.tables.area}>
        <Select value={value.areaId} onChange={(e) => onChange({ ...value, areaId: e.target.value })}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {name(a)}
            </option>
          ))}
          <option value={NEW_AREA}>{t.tables.newArea}</option>
        </Select>
      </Field>
      {value.areaId === NEW_AREA && (
        <>
          <Field label={t.tables.areaAr}>
            <Input value={value.nameAr} onChange={(e) => onChange({ ...value, nameAr: e.target.value })} />
          </Field>
          <Field label={t.tables.areaEn}>
            <Input dir="ltr" value={value.nameEn} onChange={(e) => onChange({ ...value, nameEn: e.target.value })} />
          </Field>
        </>
      )}
    </>
  );
}

/** The area names to send: those of the chosen area, or the typed new ones. */
const areaNames = (areas: Area[], v: { areaId: string; nameAr: string; nameEn: string }) => {
  const a = areas.find((x) => x.id === v.areaId);
  return a
    ? { areaNameAr: a.nameAr, areaNameEn: a.nameEn }
    : { areaNameAr: v.nameAr.trim(), areaNameEn: v.nameEn.trim() };
};

function AddTables({ branchId, areas }: { branchId: string; areas: Area[] }) {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({ prefix: 'T', from: '1', to: '1', seats: '4' });
  const [area, setArea] = useState({
    areaId: NEW_AREA,
    nameAr: t.tables.defaultAreaAr,
    nameEn: t.tables.defaultAreaEn,
  });
  const [result, setResult] = useState<{ added: number; failedAt?: string; error?: unknown } | null>(null);
  // Once the branch has areas, offer one instead of a new area: the one just created (same name), else the
  // first. Runs when the area list changes, not while a new area's name is being typed.
  useEffect(() => {
    setArea((v) => {
      if (v.areaId !== NEW_AREA || !areas[0]) return v;
      const created = areas.find((a) => a.nameEn === v.nameEn.trim());
      return { ...v, areaId: (created ?? areas[0]).id };
    });
  }, [areas]);

  const from = Number(form.from);
  const to = Number(form.to || form.from);
  const numbered = form.from.trim() !== '';
  const count = !numbered ? 1 : Number.isInteger(from) && Number.isInteger(to) && to >= from ? to - from + 1 : 0;
  const labels = numbered
    ? Array.from({ length: Math.min(count, 100) }, (_, i) => `${form.prefix.trim()}${from + i}`)
    : [form.prefix.trim()];
  const names = areaNames(areas, area);
  const valid =
    count >= 1 &&
    count <= 100 &&
    labels.every((l) => l.length >= 1 && l.length <= 12) &&
    Number(form.seats) >= 1 &&
    !!names.areaNameAr &&
    !!names.areaNameEn;

  // One request per table, in order; stops at the first failure and says which table it was.
  const add = useMutation({
    mutationFn: async () => {
      let added = 0;
      for (const label of labels) {
        try {
          await api(`/branches/${branchId}/tables`, {
            method: 'POST',
            body: { label, seats: Number(form.seats), ...names },
          });
          added++;
        } catch (err) {
          return { added, failedAt: label, error: err };
        }
      }
      return { added };
    },
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['tables', branchId] });
    },
  });

  return (
    <Card title={t.tables.add}>
      <form
        className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          add.mutate();
        }}
      >
        <Field label={t.tables.prefix}>
          <Input
            dir="ltr"
            maxLength={12}
            value={form.prefix}
            onChange={(e) => setForm({ ...form, prefix: e.target.value })}
          />
        </Field>
        <Field label={t.tables.from}>
          <Input
            dir="ltr"
            inputMode="numeric"
            value={form.from}
            onChange={(e) => setForm({ ...form, from: e.target.value })}
          />
        </Field>
        <Field label={t.tables.to}>
          <Input
            dir="ltr"
            inputMode="numeric"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
          />
        </Field>
        <Field label={t.tables.seats}>
          <Input
            dir="ltr"
            type="number"
            min={1}
            max={50}
            value={form.seats}
            onChange={(e) => setForm({ ...form, seats: e.target.value })}
          />
        </Field>
        <AreaFields areas={areas} value={area} onChange={setArea} />
        <div className="flex flex-col gap-1 sm:col-span-3 lg:col-span-6">
          <p className="text-xs text-muted">{t.tables.addHint}</p>
          {valid && labels.length > 1 && (
            <p className="text-sm">
              <bdi className="num font-medium">
                {labels[0]} … {labels[labels.length - 1]}
              </bdi>
            </p>
          )}
          {count > 100 && <p className="text-xs text-danger">{t.tables.tooMany}</p>}
          <div>
            <Button type="submit" disabled={!valid || add.isPending}>
              {t.tables.adding(count > 0 && count <= 100 ? count : 1)}
            </Button>
          </div>
        </div>
        {result && (
          <div className="sm:col-span-3 lg:col-span-6">
            {result.failedAt ? (
              <Alert tone="danger">
                {t.tables.partial(result.added, result.failedAt)} {error(errorCode(result.error))}
              </Alert>
            ) : (
              <Alert tone="success">{t.tables.added(result.added)}</Alert>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

function TableRow({
  table,
  area,
  areas,
  branchId,
  canManage,
}: {
  table: DiningTable;
  area: Area;
  areas: Area[];
  branchId: string;
  canManage: boolean;
}) {
  const { t, name, error } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label: table.label, seats: String(table.seats) });
  const [where, setWhere] = useState({ areaId: area.id, nameAr: '', nameEn: '' });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/tables/${table.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['tables', branchId] });
    },
  });
  const errs = fieldErrors(update.error);

  if (editing)
    return (
      <tr className="bg-surface/60">
        <Td>
          <Input
            dir="ltr"
            className="w-24"
            maxLength={12}
            aria-label={t.tables.label}
            aria-invalid={!!errs.label}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Td>
        <Td>
          <Input
            dir="ltr"
            type="number"
            className="w-20"
            min={1}
            max={50}
            aria-label={t.tables.seats}
            value={form.seats}
            onChange={(e) => setForm({ ...form, seats: e.target.value })}
          />
        </Td>
        <Td>
          <div className="flex flex-wrap gap-2">
            <AreaFields areas={areas} value={where} onChange={setWhere} />
          </div>
        </Td>
        <Td>{update.isError && <span className="text-xs text-danger">{error(errorCode(update.error))}</span>}</Td>
        <Td className="whitespace-nowrap text-end">
          <Button
            disabled={update.isPending || !form.label.trim() || Number(form.seats) < 1}
            onClick={() => {
              const names = areaNames(areas, where);
              update.mutate({
                label: form.label.trim(),
                seats: Number(form.seats),
                ...(where.areaId !== area.id && names.areaNameAr && names.areaNameEn ? names : {}),
              });
            }}
          >
            {t.tables.save}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            {t.tables.cancel}
          </Button>
        </Td>
      </tr>
    );

  return (
    <tr className={table.isActive ? '' : 'text-muted'}>
      <Td>
        <span className="num font-semibold">{table.label}</span>
      </Td>
      <Td>
        <span className="num">{table.seats}</span>
      </Td>
      <Td>{name(area)}</Td>
      <Td>
        <Badge tone={table.isActive ? 'success' : 'neutral'}>
          {table.isActive ? t.tables.active : t.tables.inactive}
        </Badge>
        {update.isError && <span className="ms-2 text-xs text-danger">{error(errorCode(update.error))}</span>}
      </Td>
      <Td className="whitespace-nowrap text-end">
        {canManage && (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setForm({ label: table.label, seats: String(table.seats) });
                setWhere({ areaId: area.id, nameAr: '', nameEn: '' });
                update.reset();
                setEditing(true);
              }}
            >
              {t.tables.edit}
            </Button>
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => update.mutate({ isActive: !table.isActive })}
            >
              {table.isActive ? t.tables.stop : t.tables.resume}
            </Button>
          </>
        )}
      </Td>
    </tr>
  );
}
