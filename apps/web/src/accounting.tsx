import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldErrors, useIdempotencyKey } from './api';
import { useI18n } from './i18n';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Input, Loading, Select, Table, Td } from './ui';
import { cents, FormError, fromCents, isMoney, Num, Tabs } from './stock-ui';
import { AccountingPage as TrialBalance } from './pages';

type Go = (path: string) => void;
type Can = (permission: string) => boolean;

interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: string;
  subtype: string | null;
  isPostable: boolean;
  isControl: boolean;
  archivedAt: string | null;
}
interface Branch {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}
interface EntryLine {
  id: string;
  lineNo: number;
  accountId: string;
  debit: string;
  credit: string;
  branchId: string | null;
  description: string | null;
  account?: { code: string; nameAr: string; nameEn: string };
}
interface Entry {
  id: string;
  number: string;
  entryDate: string;
  originalDate: string | null;
  sourceType: string;
  memo: string | null;
  reversalOfId: string | null;
  lines: EntryLine[];
  reversedBy?: { id: string; number: string } | null;
}

const ymd = (iso: string) => iso.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const useAccounts = () => useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounting/accounts') });
const useBranches = (enabled: boolean) =>
  useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('/branches'), enabled });

export function AccountingSection({ tab, id, go, can }: { tab?: string; id?: string; go: Go; can: Can }) {
  const { t } = useI18n();
  const current = tab || 'trial-balance';
  const financial = can('reports.financial');
  const tabs = [
    { key: 'trial-balance', label: t.ledger.tabs.trialBalance, show: true },
    { key: 'journal', label: t.ledger.tabs.journal, show: true },
    { key: 'periods', label: t.ledger.tabs.periods, show: true },
    { key: 'reports', label: t.ledger.tabs.reports, show: financial },
    { key: 'reconciliation', label: t.ledger.tabs.reconciliation, show: financial },
    { key: 'bank', label: t.ledger.tabs.bank, show: true },
  ]
    .filter((x) => x.show)
    .map((x) => ({ key: x.key, label: x.label, href: `#/accounting/${x.key}` }));
  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} current={current} />
      {current === 'journal' ? (
        id ? (
          <EntryDetail key={id} id={id} back={() => go('/accounting/journal')} go={go} can={can} />
        ) : (
          <JournalTab go={go} can={can} />
        )
      ) : current === 'periods' ? (
        <PeriodsTab can={can} />
      ) : current === 'reports' && financial ? (
        <ReportsTab can={can} />
      ) : current === 'reconciliation' && financial ? (
        <ReconciliationTab />
      ) : current === 'bank' ? (
        id ? (
          <StatementDetail key={id} id={id} back={() => go('/accounting/bank')} can={can} />
        ) : (
          <BankTab go={go} can={can} />
        )
      ) : (
        <TrialBalance />
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

const AccountName = ({ a }: { a?: { code: string; nameAr: string; nameEn: string } }) => {
  const { name } = useI18n();
  return a ? (
    <>
      <Num>{a.code}</Num> {name(a)}
    </>
  ) : (
    <>—</>
  );
};

/** Postable accounts a person may post to by hand (control accounts belong to their sub-ledgers). */
const manualAccounts = (accounts: Account[] = []) =>
  accounts.filter((a) => a.isPostable && !a.isControl && !a.archivedAt);

// ── Journal ──────────────────────────────────────────────────────────────────

function JournalTab({ go, can }: { go: Go; can: Can }) {
  const { t, money, date } = useI18n();
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (range.from) qs.set('from', range.from);
  if (range.to) qs.set('to', range.to);
  const list = useQuery({
    queryKey: ['journal', range, page],
    queryFn: () => api<{ items: Entry[]; total: number }>(`/accounting/journal-entries?${qs}`),
  });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 25));
  const total = (e: Entry) => fromCents(e.lines.reduce((s, l) => s + cents(Number(l.debit).toFixed(2)), 0n));
  return (
    <div className="flex flex-col gap-4">
      {open && <ManualEntryForm close={() => setOpen(false)} go={go} />}
      <Card
        title={t.ledger.journal.title}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Input
              type="date"
              aria-label={t.ledger.from}
              value={range.from}
              onChange={(e) => {
                setRange({ ...range, from: e.target.value });
                setPage(1);
              }}
            />
            <Input
              type="date"
              aria-label={t.ledger.to}
              value={range.to}
              onChange={(e) => {
                setRange({ ...range, to: e.target.value });
                setPage(1);
              }}
            />
            {!open && can('accounting.journal.post') && (
              <Button onClick={() => setOpen(true)}>{t.ledger.journal.add}</Button>
            )}
          </div>
        }
      >
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <Empty>{t.accounting.empty}</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <Table
              head={[t.common.number, t.common.date, t.ledger.journal.source, t.ledger.journal.memo, t.common.total]}
            >
              {list.data.items.map((e) => (
                <tr
                  key={e.id}
                  className="cursor-pointer hover:bg-surface"
                  onClick={() => go(`/accounting/journal/${e.id}`)}
                >
                  <Td>
                    <a
                      href={`#/accounting/journal/${e.id}`}
                      className="num font-medium text-brand-700 hover:underline"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.number}
                    </a>
                  </Td>
                  <Td>
                    {date(ymd(e.entryDate))} {e.originalDate && <Badge tone="warning">{t.ledger.journal.late}</Badge>}
                  </Td>
                  <Td>{t.ledger.sources[e.sourceType] ?? e.sourceType}</Td>
                  <Td>{e.memo ?? '—'}</Td>
                  <Td>
                    <Num>{money(total(e))}</Num>
                  </Td>
                </tr>
              ))}
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
    </div>
  );
}

interface LineDraft {
  accountId: string;
  debit: string;
  credit: string;
  branchId: string;
  description: string;
}
const blankLine = (): LineDraft => ({ accountId: '', debit: '', credit: '', branchId: '', description: '' });

function ManualEntryForm({ close, go }: { close: () => void; go: Go }) {
  const { t, name, money } = useI18n();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const branches = useBranches(true);
  const [head, setHead] = useState({ date: today(), memo: '' });
  const [lines, setLines] = useState<LineDraft[]>([blankLine(), blankLine()]);
  const idem = useIdempotencyKey();
  const set = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const used = lines.filter((l) => l.accountId || l.debit.trim() || l.credit.trim());
  const debit = used.reduce((s, l) => s + cents(l.debit), 0n);
  const credit = used.reduce((s, l) => s + cents(l.credit), 0n);
  const balanced = debit === credit && debit > 0n;
  const create = useMutation({
    mutationFn: () =>
      api<Entry>('/accounting/journal-entries', {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: {
          date: head.date,
          memo: head.memo,
          lines: used.map((l) => ({
            accountId: l.accountId,
            ...(isMoney(l.debit) && cents(l.debit) > 0n ? { debit: l.debit.trim() } : {}),
            ...(isMoney(l.credit) && cents(l.credit) > 0n ? { credit: l.credit.trim() } : {}),
            ...(l.branchId ? { branchId: l.branchId } : {}),
            ...(l.description.trim() ? { description: l.description.trim() } : {}),
          })),
        },
      }),
    onSuccess: (e) => {
      idem.renew();
      void qc.invalidateQueries({ queryKey: ['journal'] });
      void qc.invalidateQueries({ queryKey: ['trial-balance'] });
      close();
      go(`/accounting/journal/${e.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  return (
    <Card title={t.ledger.journal.add}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.common.date} error={errs.date}>
            <Input
              type="date"
              dir="ltr"
              value={head.date}
              onChange={(e) => setHead({ ...head, date: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t.ledger.journal.memo} error={errs.memo}>
              <Input
                value={head.memo}
                onChange={(e) => setHead({ ...head, memo: e.target.value })}
                aria-invalid={!!errs.memo}
              />
            </Field>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-xs text-muted">
                {[
                  t.accounting.account,
                  t.accounting.debit,
                  t.accounting.credit,
                  t.devices.branch,
                  t.purchasing.invoices.description,
                  '',
                ].map((h, i) => (
                  <th key={i} scope="col" className="px-1 py-1 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="p-1">
                    <Select
                      aria-label={t.accounting.account}
                      className="w-full"
                      value={l.accountId}
                      onChange={(e) => set(i, { accountId: e.target.value })}
                    >
                      <option value="">{t.common.choose}</option>
                      {manualAccounts(accounts.data).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {name(a)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1">
                    <Input
                      aria-label={t.accounting.debit}
                      dir="ltr"
                      inputMode="decimal"
                      className="w-28"
                      value={l.debit}
                      onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      aria-label={t.accounting.credit}
                      dir="ltr"
                      inputMode="decimal"
                      className="w-28"
                      value={l.credit}
                      onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                    />
                  </td>
                  <td className="p-1">
                    <Select
                      aria-label={t.devices.branch}
                      value={l.branchId}
                      onChange={(e) => set(i, { branchId: e.target.value })}
                    >
                      <option value="">—</option>
                      {branches.data?.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1">
                    <Input
                      aria-label={t.purchasing.invoices.description}
                      value={l.description}
                      onChange={(e) => set(i, { description: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t.common.remove}
                      disabled={lines.length <= 2}
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant="secondary" onClick={() => setLines([...lines, blankLine()])}>
            + {t.common.addLine}
          </Button>
          <p className="text-sm">
            {t.accounting.debit}: <Num>{money(fromCents(debit))}</Num> · {t.accounting.credit}:{' '}
            <Num>{money(fromCents(credit))}</Num>
          </p>
          {used.length > 0 && !balanced && <Badge tone="warning">{t.ledger.journal.unbalanced}</Badge>}
        </div>
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
          <Button type="submit" disabled={create.isPending || !balanced}>
            {t.ledger.journal.post}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EntryDetail({ id, back, go, can }: { id: string; back: () => void; go: Go; can: Can }) {
  const { t, money, date } = useI18n();
  const qc = useQueryClient();
  const entry = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: () => api<Entry>(`/accounting/journal-entries/${id}`),
  });
  const branches = useBranches(true);
  const [reversing, setReversing] = useState(false);
  const [rev, setRev] = useState({ date: today(), memo: '' });
  const idem = useIdempotencyKey();
  const reverse = useMutation({
    mutationFn: () =>
      api<Entry>(`/accounting/journal-entries/${id}/reverse`, {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: { date: rev.date, ...(rev.memo.trim() ? { memo: rev.memo.trim() } : {}) },
      }),
    onSuccess: (r) => {
      idem.renew();
      void qc.invalidateQueries({ queryKey: ['journal'] });
      void qc.invalidateQueries({ queryKey: ['journal-entry', id] });
      go(`/accounting/journal/${r.id}`);
    },
  });
  if (entry.isPending) return <Loading />;
  if (entry.isError) return <ErrorState error={entry.error} onRetry={() => entry.refetch()} />;
  const e = entry.data;
  const reversible = e.sourceType === 'manual' && !e.reversedBy && can('accounting.journal.post');
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.ledger.journal.back} />
      <Card
        title={`${t.ledger.journal.one} ${e.number}`}
        actions={<Badge>{t.ledger.sources[e.sourceType] ?? e.sourceType}</Badge>}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {date(ymd(e.entryDate))}
            {e.originalDate && (
              <>
                {' '}
                · {t.ledger.journal.originalDate}: {date(ymd(e.originalDate))}
              </>
            )}
            {e.memo && <> · {e.memo}</>}
          </p>
          {e.reversalOfId && (
            <p className="text-sm">
              {t.ledger.journal.reverses}{' '}
              <a href={`#/accounting/journal/${e.reversalOfId}`} className="text-brand-700 hover:underline">
                {t.ledger.journal.original}
              </a>
            </p>
          )}
          {e.reversedBy && (
            <Alert tone="warning">
              {t.ledger.journal.reversedBy}{' '}
              <a href={`#/accounting/journal/${e.reversedBy.id}`} className="num font-medium underline">
                {e.reversedBy.number}
              </a>
            </Alert>
          )}
          <Table
            head={[
              t.accounting.account,
              t.devices.branch,
              t.purchasing.invoices.description,
              t.accounting.debit,
              t.accounting.credit,
            ]}
          >
            {e.lines.map((l) => (
              <tr key={l.id}>
                <Td>
                  <AccountName a={l.account} />
                </Td>
                <Td>
                  <Num>{branches.data?.find((b) => b.id === l.branchId)?.code ?? '—'}</Num>
                </Td>
                <Td>{l.description ?? '—'}</Td>
                <Td>
                  <Num>{Number(l.debit) ? money(l.debit) : ''}</Num>
                </Td>
                <Td>
                  <Num>{Number(l.credit) ? money(l.credit) : ''}</Num>
                </Td>
              </tr>
            ))}
          </Table>
          {reversing && (
            <div className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-2">
              <Field label={t.ledger.journal.reversalDate}>
                <Input
                  type="date"
                  dir="ltr"
                  value={rev.date}
                  onChange={(ev) => setRev({ ...rev, date: ev.target.value })}
                />
              </Field>
              <Field label={t.ledger.journal.memo}>
                <Input
                  value={rev.memo}
                  placeholder={`${t.ledger.journal.reversalOf} ${e.number}`}
                  onChange={(ev) => setRev({ ...rev, memo: ev.target.value })}
                />
              </Field>
            </div>
          )}
          <FormError error={reverse.error} />
          {reversible && (
            <div className="flex gap-2">
              {reversing ? (
                <>
                  <Button disabled={reverse.isPending} onClick={() => reverse.mutate()}>
                    {t.ledger.journal.confirmReverse}
                  </Button>
                  <Button variant="secondary" onClick={() => setReversing(false)}>
                    {t.cancel}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setReversing(true)}>
                  {t.ledger.journal.reverse}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Periods & fiscal years ───────────────────────────────────────────────────

interface Period {
  id: string;
  periodNo: number;
  startDate: string;
  endDate: string;
  status: string;
}
interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  closingEntryId: string | null;
  periods: Period[];
}
interface Checklist {
  items: { key: string; count: number; ok: boolean }[];
  ready: boolean;
}

function PeriodsTab({ can }: { can: Can }) {
  const { t, date } = useI18n();
  const qc = useQueryClient();
  const years = useQuery({ queryKey: ['fiscal-years'], queryFn: () => api<FiscalYear[]>('/accounting/fiscal-years') });
  const [reopening, setReopening] = useState<{ id: string; reason: string } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const checklist = useQuery({
    queryKey: ['checklist', checking],
    queryFn: () => api<Checklist>(`/accounting/periods/${checking}/checklist`),
    enabled: !!checking,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['fiscal-years'] });
  const action = useMutation({
    mutationFn: (a: { path: string; body?: object }) =>
      api(`/accounting/${a.path}`, { method: 'POST', ...(a.body ? { body: a.body } : {}) }),
    onSuccess: () => {
      setReopening(null);
      refresh();
    },
  });
  const canClose = can('accounting.period_close');
  const canReopen = can('accounting.period_reopen');
  const tone = (s: string) => (s === 'open' ? 'success' : s === 'closed' ? 'neutral' : 'warning');
  return (
    <div className="flex flex-col gap-4">
      <FormError error={action.error} />
      {checking && (
        <Card
          title={t.ledger.periods.checklist}
          actions={
            <Button variant="ghost" onClick={() => setChecking(null)}>
              ✕
            </Button>
          }
        >
          {checklist.isPending ? (
            <Loading />
          ) : checklist.isError ? (
            <ErrorState error={checklist.error} />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {checklist.data.items.map((i) => (
                <li key={i.key} className="flex items-center gap-2">
                  <Badge tone={i.ok ? 'success' : 'warning'}>
                    <Num>{i.count}</Num>
                  </Badge>
                  {t.ledger.periods.checks[i.key] ?? i.key}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {years.isPending ? (
        <Loading />
      ) : years.isError ? (
        <ErrorState error={years.error} onRetry={() => years.refetch()} />
      ) : (
        years.data.map((fy, index) => (
          <Card
            key={fy.id}
            title={fy.name}
            actions={
              <div className="flex items-center gap-2">
                <Badge tone={fy.status === 'open' ? 'success' : 'neutral'}>
                  {t.ledger.periods.status[fy.status] ?? fy.status}
                </Badge>
                {index === 0 && canClose && (
                  <Button
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ path: 'fiscal-years/next' })}
                  >
                    {t.ledger.periods.openNext}
                  </Button>
                )}
                {fy.status === 'open' && canClose && fy.periods.every((p) => p.status === 'closed') && (
                  <Button
                    disabled={action.isPending}
                    onClick={() => action.mutate({ path: `fiscal-years/${fy.id}/close` })}
                  >
                    {t.ledger.periods.closeYear}
                  </Button>
                )}
                {fy.closingEntryId && (
                  <a
                    href={`#/accounting/journal/${fy.closingEntryId}`}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    {t.ledger.periods.closingEntry}
                  </a>
                )}
              </div>
            }
          >
            <Table head={[t.ledger.periods.period, t.ledger.from, t.ledger.to, t.common.status, '']}>
              {fy.periods.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Num>{p.periodNo}</Num>
                  </Td>
                  <Td>{date(ymd(p.startDate))}</Td>
                  <Td>{date(ymd(p.endDate))}</Td>
                  <Td>
                    <Badge tone={tone(p.status)}>{t.ledger.periods.status[p.status] ?? p.status}</Badge>
                  </Td>
                  <Td>
                    {reopening?.id === p.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label={t.ledger.periods.reason}
                          placeholder={t.ledger.periods.reason}
                          value={reopening.reason}
                          onChange={(e) => setReopening({ id: p.id, reason: e.target.value })}
                        />
                        <Button
                          disabled={action.isPending || reopening.reason.trim().length < 5}
                          onClick={() =>
                            action.mutate({ path: `periods/${p.id}/reopen`, body: { reason: reopening.reason } })
                          }
                        >
                          {t.ledger.periods.reopen}
                        </Button>
                        <Button variant="ghost" onClick={() => setReopening(null)}>
                          {t.cancel}
                        </Button>
                      </div>
                    ) : (
                      fy.status === 'open' && (
                        <div className="flex flex-wrap gap-1">
                          <Button variant="ghost" onClick={() => setChecking(p.id)}>
                            {t.ledger.periods.checklist}
                          </Button>
                          {p.status === 'open' && canClose && (
                            <Button
                              variant="secondary"
                              disabled={action.isPending}
                              onClick={() => action.mutate({ path: `periods/${p.id}/soft-close` })}
                            >
                              {t.ledger.periods.softClose}
                            </Button>
                          )}
                          {p.status === 'soft_closed' && canClose && (
                            <Button
                              variant="secondary"
                              disabled={action.isPending}
                              onClick={() => action.mutate({ path: `periods/${p.id}/close` })}
                            >
                              {t.ledger.periods.close}
                            </Button>
                          )}
                          {p.status !== 'open' && canReopen && (
                            <Button variant="ghost" onClick={() => setReopening({ id: p.id, reason: '' })}>
                              {t.ledger.periods.reopen}
                            </Button>
                          )}
                        </div>
                      )
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        ))
      )}
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────

interface ReportLine {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  amount: string;
}
interface Section {
  lines: ReportLine[];
  total: string;
}

function ReportsTab({ can }: { can: Can }) {
  const { t, name } = useI18n();
  const [kind, setKind] = useState<'pl' | 'bs' | 'cf' | 'gl'>('pl');
  const [f, setF] = useState({ from: '', to: '', asOf: '', branchId: '', accountId: '' });
  const branches = useBranches(can('setup.branches.view'));
  const accounts = useAccounts();
  const qs = (keys: (keyof typeof f)[]) => {
    const p = new URLSearchParams();
    for (const k of keys) if (f[k]) p.set(k, f[k]);
    return p.toString();
  };
  const path =
    kind === 'pl'
      ? `reports/profit-and-loss?${qs(['from', 'to', 'branchId'])}`
      : kind === 'bs'
        ? `reports/balance-sheet?${qs(['asOf'])}`
        : kind === 'cf'
          ? `reports/cash-flow?${qs(['from', 'to'])}`
          : `reports/general-ledger?${qs(['accountId', 'from', 'to'])}`;
  const report = useQuery({
    queryKey: ['report', path],
    queryFn: () => api<Record<string, unknown>>(`/accounting/${path}`),
    enabled: kind !== 'gl' || !!f.accountId,
  });
  const dateInput = (key: 'from' | 'to' | 'asOf', label: string) => (
    <Field label={label}>
      <Input type="date" dir="ltr" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t.ledger.reports.report}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {(['pl', 'bs', 'cf', 'gl'] as const).map((k) => (
                <option key={k} value={k}>
                  {t.ledger.reports.kinds[k]}
                </option>
              ))}
            </Select>
          </Field>
          {kind === 'bs' ? (
            dateInput('asOf', t.ledger.reports.asOf)
          ) : (
            <>
              {dateInput('from', t.ledger.from)}
              {dateInput('to', t.ledger.to)}
            </>
          )}
          {kind === 'pl' && branches.data && (
            <Field label={t.devices.branch}>
              <Select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
                <option value="">{t.common.all}</option>
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {name(b)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === 'gl' && (
            <Field label={t.accounting.account}>
              <Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
                <option value="">{t.common.choose}</option>
                {(accounts.data ?? [])
                  .filter((a) => a.isPostable)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {name(a)}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
        </div>
      </Card>
      {kind === 'gl' && !f.accountId ? (
        <Empty>{t.ledger.reports.pickAccount}</Empty>
      ) : report.isPending ? (
        <Loading />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : kind === 'pl' ? (
        <ProfitAndLoss r={report.data as never} />
      ) : kind === 'bs' ? (
        <BalanceSheet r={report.data as never} />
      ) : kind === 'cf' ? (
        <CashFlow r={report.data as never} />
      ) : (
        <GeneralLedger r={report.data as never} />
      )}
    </div>
  );
}

function SectionRows({ title, s, strong }: { title: string; s: Section; strong?: boolean }) {
  const { money } = useI18n();
  return (
    <>
      <tr className="bg-surface">
        <Td className="font-semibold">{title}</Td>
        <Td />
      </tr>
      {s.lines.map((l) => (
        <tr key={l.accountId}>
          <Td>
            <AccountName a={l} />
          </Td>
          <Td>
            <Num>{money(l.amount)}</Num>
          </Td>
        </tr>
      ))}
      <tr className={strong ? 'font-semibold' : 'font-medium'}>
        <Td>{title}</Td>
        <Td>
          <Num>{money(s.total)}</Num>
        </Td>
      </tr>
    </>
  );
}

function TotalRow({ label, amount }: { label: ReactNode; amount: string }) {
  const { money } = useI18n();
  return (
    <tr className="border-t-2 border-ink font-semibold">
      <Td>{label}</Td>
      <Td>
        <Num>{money(amount)}</Num>
      </Td>
    </tr>
  );
}

function ProfitAndLoss({
  r,
}: {
  r: {
    from: string;
    to: string;
    revenue: Section;
    costOfSales: Section;
    grossProfit: string;
    expenses: Section;
    netIncome: string;
  };
}) {
  const { t, date } = useI18n();
  return (
    <Card title={`${t.ledger.reports.kinds.pl} · ${date(r.from)} – ${date(r.to)}`}>
      <Table head={[t.accounting.account, t.common.value]}>
        <SectionRows title={t.ledger.reports.revenue} s={r.revenue} />
        <SectionRows title={t.ledger.reports.costOfSales} s={r.costOfSales} />
        <TotalRow label={t.ledger.reports.grossProfit} amount={r.grossProfit} />
        <SectionRows title={t.ledger.reports.expenses} s={r.expenses} />
        <TotalRow label={t.ledger.reports.netIncome} amount={r.netIncome} />
      </Table>
    </Card>
  );
}

function BalanceSheet({
  r,
}: {
  r: {
    asOf: string;
    assets: Section;
    liabilities: Section;
    equity: Section;
    currentEarnings: string;
    liabilitiesAndEquity: string;
    balanced: boolean;
  };
}) {
  const { t, date, money } = useI18n();
  return (
    <Card title={`${t.ledger.reports.kinds.bs} · ${date(r.asOf)}`}>
      <div className="flex flex-col gap-4">
        <Alert tone={r.balanced ? 'success' : 'danger'}>
          {r.balanced ? t.ledger.reports.balanced : t.ledger.reports.unbalanced}
        </Alert>
        <Table head={[t.accounting.account, t.common.value]}>
          <SectionRows title={t.ledger.reports.assets} s={r.assets} strong />
          <SectionRows title={t.ledger.reports.liabilities} s={r.liabilities} />
          <SectionRows title={t.ledger.reports.equity} s={r.equity} />
          <tr>
            <Td>{t.ledger.reports.currentEarnings}</Td>
            <Td>
              <Num>{money(r.currentEarnings)}</Num>
            </Td>
          </tr>
          <TotalRow label={t.ledger.reports.liabilitiesAndEquity} amount={r.liabilitiesAndEquity} />
        </Table>
      </div>
    </Card>
  );
}

function CashFlow({
  r,
}: {
  r: {
    from: string;
    to: string;
    openingCash: string;
    operating: { netIncome: string; adjustments: ReportLine[]; total: string };
    investing: Section;
    financing: Section;
    netChange: string;
    closingCash: string;
    reconciles: boolean;
  };
}) {
  const { t, date, money } = useI18n();
  return (
    <Card title={`${t.ledger.reports.kinds.cf} · ${date(r.from)} – ${date(r.to)}`}>
      <div className="flex flex-col gap-4">
        <Alert tone={r.reconciles ? 'success' : 'danger'}>
          {r.reconciles ? t.ledger.reports.cashOk : t.ledger.reports.cashBad}
        </Alert>
        <Table head={[t.accounting.account, t.common.value]}>
          <TotalRow label={t.ledger.reports.openingCash} amount={r.openingCash} />
          <tr>
            <Td>{t.ledger.reports.netIncome}</Td>
            <Td>
              <Num>{money(r.operating.netIncome)}</Num>
            </Td>
          </tr>
          <SectionRows
            title={t.ledger.reports.operating}
            s={{ lines: r.operating.adjustments, total: r.operating.total }}
          />
          <SectionRows title={t.ledger.reports.investing} s={r.investing} />
          <SectionRows title={t.ledger.reports.financing} s={r.financing} />
          <TotalRow label={t.ledger.reports.netChange} amount={r.netChange} />
          <TotalRow label={t.ledger.reports.closingCash} amount={r.closingCash} />
        </Table>
      </div>
    </Card>
  );
}

function GeneralLedger({
  r,
}: {
  r: {
    account: { code: string; nameAr: string; nameEn: string };
    from: string;
    to: string;
    opening: string;
    closing: string;
    truncated: boolean;
    lines: {
      entryId: string;
      number: string;
      date: string;
      memo: string | null;
      description: string | null;
      debit: string;
      credit: string;
      balance: string;
    }[];
  };
}) {
  const { t, date, money, name } = useI18n();
  return (
    <Card title={`${r.account.code} ${name(r.account)} · ${date(r.from)} – ${date(r.to)}`}>
      <div className="flex flex-col gap-3">
        {r.truncated && <Alert tone="warning">{t.ledger.reports.truncated}</Alert>}
        <Table
          head={[
            t.common.date,
            t.common.number,
            t.ledger.journal.memo,
            t.accounting.debit,
            t.accounting.credit,
            t.ledger.reports.balance,
          ]}
        >
          <tr className="bg-surface">
            <Td>{t.ledger.reports.opening}</Td>
            <Td />
            <Td />
            <Td />
            <Td />
            <Td>
              <Num>{money(r.opening)}</Num>
            </Td>
          </tr>
          {r.lines.map((l, i) => (
            <tr key={`${l.entryId}:${i}`}>
              <Td>{date(l.date)}</Td>
              <Td>
                <a href={`#/accounting/journal/${l.entryId}`} className="num text-brand-700 hover:underline">
                  {l.number}
                </a>
              </Td>
              <Td>{l.description ?? l.memo ?? '—'}</Td>
              <Td>
                <Num>{Number(l.debit) ? money(l.debit) : ''}</Num>
              </Td>
              <Td>
                <Num>{Number(l.credit) ? money(l.credit) : ''}</Num>
              </Td>
              <Td>
                <Num>{money(l.balance)}</Num>
              </Td>
            </tr>
          ))}
          <TotalRow label={t.ledger.reports.closing} amount={r.closing} />
        </Table>
      </div>
    </Card>
  );
}

// ── Reconciliation ───────────────────────────────────────────────────────────

function ReconciliationTab() {
  const { t, money, date } = useI18n();
  const [range, setRange] = useState({ from: '', to: '' });
  const qs = new URLSearchParams();
  if (range.from) qs.set('from', range.from);
  if (range.to) qs.set('to', range.to);
  const report = useQuery({
    queryKey: ['ledger-reconciliation', range],
    queryFn: () =>
      api<{
        from: string;
        to: string;
        ok: boolean;
        checks: { key: string; subledger: string; ledger: string; difference: string; ok: boolean }[];
      }>(`/accounting/reconciliation?${qs}`),
  });
  const counts = ['documentsWithoutEntry', 'stockLedgerMismatches'];
  return (
    <Card
      title={t.ledger.tabs.reconciliation}
      actions={
        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            aria-label={t.ledger.from}
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
          <Input
            type="date"
            aria-label={t.ledger.to}
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </div>
      }
    >
      {report.isPending ? (
        <Loading />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone={report.data.ok ? 'success' : 'danger'}>
            {report.data.ok ? t.ledger.recon.allOk : t.ledger.recon.differences} ({date(report.data.from)} –{' '}
            {date(report.data.to)})
          </Alert>
          <Table
            head={[
              t.ledger.recon.check,
              t.ledger.recon.subledger,
              t.ledger.recon.ledger,
              t.ledger.recon.difference,
              '',
            ]}
          >
            {report.data.checks.map((c) => {
              const fmt = (v: string) => (counts.includes(c.key) ? String(Number(v)) : money(v));
              return (
                <tr key={c.key}>
                  <Td>{t.ledger.recon.checks[c.key] ?? c.key}</Td>
                  <Td>
                    <Num>{fmt(c.subledger)}</Num>
                  </Td>
                  <Td>
                    <Num>{fmt(c.ledger)}</Num>
                  </Td>
                  <Td>
                    <Num>{fmt(c.difference)}</Num>
                  </Td>
                  <Td>
                    <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? '✓' : '✕'}</Badge>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </Card>
  );
}

// ── Bank reconciliation ──────────────────────────────────────────────────────

interface BookLine {
  id: string;
  entryId: string;
  number: string;
  date: string;
  memo: string | null;
  description: string | null;
  amount: string;
}
interface StatementRow {
  id: string;
  reference: string;
  accountId: string;
  startDate: string;
  endDate: string;
  closingBalance: string;
  status: string;
  lineCount: number;
  matchedCount: number;
}
interface StatementDetailData {
  id: string;
  reference: string;
  status: string;
  startDate: string;
  endDate: string;
  openingBalance: string;
  account: { id: string; code: string; nameAr: string; nameEn: string };
  lines: {
    id: string;
    lineNo: number;
    txnDate: string;
    description: string;
    reference: string | null;
    amount: string;
    match: BookLine | null;
  }[];
  bookLines: BookLine[];
  summary: {
    ledgerBalance: string;
    outstandingBook: string;
    unrecordedBank: string;
    expectedClosing: string;
    closingBalance: string;
    difference: string;
    unmatchedLines: number;
  };
  autoMatched?: number;
}

/** Bank accounts first (the usual choice), then clearing accounts (card and wallet settlements). */
const bankAccounts = (accounts: Account[] = []) =>
  accounts
    .filter((a) => a.type === 'asset' && ['bank', 'clearing'].includes(a.subtype ?? '') && a.isPostable)
    .sort((a, b) => Number(b.subtype === 'bank') - Number(a.subtype === 'bank') || a.code.localeCompare(b.code));

/** "date,description,amount[,reference]" per line; a header row and blank lines are skipped. */
function parseStatementCsv(text: string) {
  const rows: { date: string; description: string; amount: string; reference?: string }[] = [];
  const errors: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [date = '', description = '', amount = '', reference = ''] = line.split(/[,;\t]/).map((c) => c.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (i > 0 || /\d/.test(date)) errors.push(i + 1);
      return;
    }
    const a = amount.replace(/\s/g, '');
    if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(a)) return void errors.push(i + 1);
    rows.push({ date, description: description || '—', amount: a, ...(reference ? { reference } : {}) });
  });
  return { rows, errors };
}

function BankTab({ go, can }: { go: Go; can: Can }) {
  const { t, money, date, name } = useI18n();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const list = useQuery({
    queryKey: ['bank-statements'],
    queryFn: () => api<StatementRow[]>('/accounting/bank-statements'),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    accountId: '',
    reference: '',
    startDate: '',
    endDate: '',
    openingBalance: '0.00',
    closingBalance: '',
    csv: '',
  });
  const idem = useIdempotencyKey();
  const parsed = parseStatementCsv(form.csv);
  const signedCents = (v: string) => (v.trim().startsWith('-') ? -cents(v.trim().slice(1)) : cents(v));
  const computed = fromCents(
    parsed.rows.reduce((s, r) => s + signedCents(r.amount), signedCents(form.openingBalance || '0')),
  );
  const create = useMutation({
    mutationFn: () =>
      api<StatementDetailData>('/accounting/bank-statements', {
        method: 'POST',
        idempotencyKey: idem.key(),
        body: {
          accountId: form.accountId || bankAccounts(accounts.data)[0]?.id,
          reference: form.reference,
          startDate: form.startDate,
          endDate: form.endDate,
          openingBalance: form.openingBalance.trim(),
          closingBalance: form.closingBalance.trim(),
          lines: parsed.rows,
        },
      }),
    onSuccess: (s) => {
      idem.renew();
      void qc.invalidateQueries({ queryKey: ['bank-statements'] });
      go(`/accounting/bank/${s.id}`);
    },
  });
  const errs = fieldErrors(create.error);
  const text = (key: 'reference' | 'openingBalance' | 'closingBalance', label: string) => (
    <Field label={label} error={errs[key]}>
      <Input dir="ltr" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );
  const accountOf = (id: string) => accounts.data?.find((a) => a.id === id);
  return (
    <div className="flex flex-col gap-4">
      {open && (
        <Card title={t.ledger.bank.import}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.accounting.account}>
                <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                  {bankAccounts(accounts.data).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {name(a)}
                    </option>
                  ))}
                </Select>
              </Field>
              {text('reference', t.ledger.bank.reference)}
              <div />
              <Field label={t.ledger.from} error={errs.startDate}>
                <Input
                  type="date"
                  dir="ltr"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </Field>
              <Field label={t.ledger.to} error={errs.endDate}>
                <Input
                  type="date"
                  dir="ltr"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </Field>
              <div />
              {text('openingBalance', t.ledger.bank.opening)}
              {text('closingBalance', t.ledger.bank.closing)}
            </div>
            <Field label={t.ledger.bank.lines} hint={t.ledger.bank.csvHint}>
              <textarea
                dir="ltr"
                rows={8}
                className="rounded-md border border-line bg-white p-3 font-mono text-sm outline-none focus:border-brand-600"
                placeholder={'2026-10-01,Deposit,2500.00,REF1\n2026-10-03,Bank fee,-12.50'}
                value={form.csv}
                onChange={(e) => setForm({ ...form, csv: e.target.value })}
              />
            </Field>
            <p className="text-sm">
              {t.ledger.bank.parsed}: <Num>{parsed.rows.length}</Num> · {t.ledger.bank.computedClosing}:{' '}
              <Num>{money(computed)}</Num>
            </p>
            {parsed.errors.length > 0 && (
              <Alert tone="warning">
                {t.ledger.bank.badRows}: <Num>{parsed.errors.join(', ')}</Num>
              </Alert>
            )}
            {Object.entries(errs)
              .filter(([k]) => k.startsWith('lines'))
              .slice(0, 3)
              .map(([k, m]) => (
                <Alert key={k} tone="danger">
                  {k}: {m}
                </Alert>
              ))}
            <FormError error={create.error} />
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending || parsed.rows.length === 0 || parsed.errors.length > 0}>
                {t.ledger.bank.import}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title={t.ledger.bank.title}
        actions={
          !open &&
          can('accounting.journal.post') && <Button onClick={() => setOpen(true)}>{t.ledger.bank.import}</Button>
        }
      >
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <Empty>{t.ledger.bank.empty}</Empty>
        ) : (
          <Table
            head={[
              t.ledger.bank.reference,
              t.accounting.account,
              t.ledger.from,
              t.ledger.to,
              t.ledger.bank.closing,
              t.ledger.bank.matched,
              t.common.status,
            ]}
          >
            {list.data.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-surface" onClick={() => go(`/accounting/bank/${s.id}`)}>
                <Td>
                  <a
                    href={`#/accounting/bank/${s.id}`}
                    className="num font-medium text-brand-700 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {s.reference}
                  </a>
                </Td>
                <Td>
                  <AccountName a={accountOf(s.accountId)} />
                </Td>
                <Td>{date(ymd(s.startDate))}</Td>
                <Td>{date(ymd(s.endDate))}</Td>
                <Td>
                  <Num>{money(s.closingBalance)}</Num>
                </Td>
                <Td>
                  <Num>
                    {s.matchedCount} / {s.lineCount}
                  </Num>
                </Td>
                <Td>
                  <Badge tone={s.status === 'reconciled' ? 'success' : 'warning'}>
                    {t.ledger.bank.status[s.status] ?? s.status}
                  </Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function StatementDetail({ id, back, can }: { id: string; back: () => void; can: Can }) {
  const { t, money, date, name } = useI18n();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const statement = useQuery({
    queryKey: ['bank-statement', id],
    queryFn: () => api<StatementDetailData>(`/accounting/bank-statements/${id}`),
  });
  const [pick, setPick] = useState<Record<string, string>>({});
  const [postTo, setPostTo] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const postKey = useIdempotencyKey();
  const act = useMutation({
    mutationFn: (a: { path: string; body?: object; keyed?: boolean }) =>
      api<StatementDetailData>(`/accounting/bank-statements/${id}/${a.path}`, {
        method: 'POST',
        ...(a.body ? { body: a.body } : {}),
        ...(a.keyed ? { idempotencyKey: postKey.key() } : {}),
      }),
    onSuccess: (s, a) => {
      if (a.keyed) postKey.renew();
      qc.setQueryData(['bank-statement', id], s);
      void qc.invalidateQueries({ queryKey: ['bank-statements'] });
      setNote(s.autoMatched !== undefined ? `${t.ledger.bank.autoMatched}: ${s.autoMatched}` : null);
    },
  });
  if (statement.isPending) return <Loading />;
  if (statement.isError) return <ErrorState error={statement.error} onRetry={() => statement.refetch()} />;
  const s = statement.data;
  const editable = s.status === 'open' && can('accounting.journal.post');
  const counterAccounts = manualAccounts(accounts.data).filter((a) => a.id !== s.account.id);
  const outstanding = s.bookLines.filter((b) => b.date <= ymd(s.endDate));
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={back} label={t.ledger.bank.back} />
      <Card
        title={`${t.ledger.bank.one} ${s.reference}`}
        actions={
          <Badge tone={s.status === 'reconciled' ? 'success' : 'warning'}>
            {t.ledger.bank.status[s.status] ?? s.status}
          </Badge>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            <AccountName a={s.account} /> · {date(ymd(s.startDate))} – {date(ymd(s.endDate))}
          </p>
          <dl className="grid max-w-xl grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">{t.ledger.bank.ledgerBalance}</dt>
            <dd className="num text-end">{money(s.summary.ledgerBalance)}</dd>
            <dt className="text-muted">− {t.ledger.bank.outstanding}</dt>
            <dd className="num text-end">{money(s.summary.outstandingBook)}</dd>
            <dt className="text-muted">+ {t.ledger.bank.unrecorded}</dt>
            <dd className="num text-end">{money(s.summary.unrecordedBank)}</dd>
            <dt className="font-medium">{t.ledger.bank.expected}</dt>
            <dd className="num text-end font-medium">{money(s.summary.expectedClosing)}</dd>
            <dt className="font-medium">{t.ledger.bank.closing}</dt>
            <dd className="num text-end font-medium">{money(s.summary.closingBalance)}</dd>
            <dt className="text-muted">{t.ledger.recon.difference}</dt>
            <dd className="num text-end">{money(s.summary.difference)}</dd>
          </dl>
          <p className="text-xs text-muted">{t.ledger.bank.summaryHint}</p>
          {note && <Alert tone="success">{note}</Alert>}
          <FormError error={act.error} />
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ path: 'auto-match' })}>
                {t.ledger.bank.autoMatch}
              </Button>
              <Button
                disabled={act.isPending || s.summary.unmatchedLines > 0}
                onClick={() => act.mutate({ path: 'complete' })}
              >
                {t.ledger.bank.complete}
              </Button>
            </div>
          )}
        </div>
      </Card>
      <Card title={t.ledger.bank.lines}>
        <Table
          head={[
            t.common.date,
            t.purchasing.invoices.description,
            t.ledger.bank.reference,
            t.ledger.bank.amount,
            t.ledger.bank.match,
          ]}
        >
          {s.lines.map((l) => {
            const candidates = s.bookLines.filter((b) => b.amount === l.amount);
            return (
              <tr key={l.id} className="align-top">
                <Td>{date(ymd(l.txnDate))}</Td>
                <Td>{l.description}</Td>
                <Td>
                  <Num>{l.reference ?? '—'}</Num>
                </Td>
                <Td>
                  <Num>{money(l.amount)}</Num>
                </Td>
                <Td>
                  {l.match ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="success">✓</Badge>
                      <a
                        href={`#/accounting/journal/${l.match.entryId}`}
                        className="num text-brand-700 hover:underline"
                      >
                        {l.match.number}
                      </a>
                      <span className="text-xs text-muted">{date(l.match.date)}</span>
                      {editable && (
                        <Button
                          variant="ghost"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ path: 'unmatch', body: { lineId: l.id } })}
                        >
                          {t.ledger.bank.unmatch}
                        </Button>
                      )}
                    </div>
                  ) : editable ? (
                    <div className="flex flex-col gap-2">
                      {candidates.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            aria-label={t.ledger.bank.match}
                            value={pick[l.id] ?? ''}
                            onChange={(e) => setPick({ ...pick, [l.id]: e.target.value })}
                          >
                            <option value="">{t.common.choose}</option>
                            {candidates.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.number} · {b.date} · {b.description ?? b.memo ?? ''}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="secondary"
                            disabled={act.isPending || !pick[l.id]}
                            onClick={() =>
                              act.mutate({ path: 'match', body: { lineId: l.id, journalLineId: pick[l.id] } })
                            }
                          >
                            {t.ledger.bank.match}
                          </Button>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          aria-label={t.ledger.bank.postTo}
                          value={postTo[l.id] ?? ''}
                          onChange={(e) => setPostTo({ ...postTo, [l.id]: e.target.value })}
                        >
                          <option value="">{t.ledger.bank.postTo}…</option>
                          {counterAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {name(a)}
                            </option>
                          ))}
                        </Select>
                        <Button
                          variant="ghost"
                          disabled={act.isPending || !postTo[l.id]}
                          onClick={() =>
                            act.mutate({
                              path: 'post-line',
                              body: { lineId: l.id, accountId: postTo[l.id] },
                              keyed: true,
                            })
                          }
                        >
                          {t.ledger.bank.post}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Badge tone="warning">{t.ledger.bank.unmatched}</Badge>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <Card title={t.ledger.bank.outstandingTitle}>
        {outstanding.length === 0 ? (
          <Empty>{t.ledger.bank.noOutstanding}</Empty>
        ) : (
          <Table head={[t.common.date, t.common.number, t.ledger.journal.memo, t.ledger.bank.amount]}>
            {outstanding.map((b) => (
              <tr key={b.id}>
                <Td>{date(b.date)}</Td>
                <Td>
                  <a href={`#/accounting/journal/${b.entryId}`} className="num text-brand-700 hover:underline">
                    {b.number}
                  </a>
                </Td>
                <Td>{b.description ?? b.memo ?? '—'}</Td>
                <Td>
                  <Num>{money(b.amount)}</Num>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
