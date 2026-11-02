import { useEffect, useState, type ReactNode } from 'react';
import type { Operator } from '@ros/pos-core';
import { useI18n } from './i18n';
import { Runtime, type PrintJob, type SyncStatus } from './runtime';
import { Button, Field, Input, Keypad, Modal, Num, UiProvider, useUi } from './ui';
import { SellScreen } from './sell';
import { CashScreen, OrdersScreen, SalesScreen, TablesScreen } from './screens';
import { Icon, type IconName } from './icons';

type Boot =
  | { phase: 'starting' }
  | { phase: 'storage-error'; message: string }
  | { phase: 'ready'; runtime: Runtime; paired: boolean };

// One runtime per page, kept on the window so a hot reload of this module (development) reuses it
// instead of opening the database a second time while the first worker still holds it.
const page = window as unknown as { __rosRuntime?: Promise<Runtime> | null };

export function App() {
  const { t } = useI18n();
  const [boot, setBoot] = useState<Boot>({ phase: 'starting' });
  const start = () => {
    setBoot({ phase: 'starting' });
    page.__rosRuntime ??= Runtime.start();
    page.__rosRuntime
      .then(async (runtime) => setBoot({ phase: 'ready', runtime, paired: await runtime.isPaired() }))
      .catch((err: unknown) => {
        page.__rosRuntime = null;
        const message = String(err instanceof Error ? err.message : err);
        setBoot({
          phase: 'storage-error',
          message: /access handle|NoModificationAllowed|locked|in use/i.test(message)
            ? t.storage.otherTab
            : /opfs|getDirectory|SharedArrayBuffer|not supported/i.test(message)
              ? t.storage.unsupported
              : message,
        });
      });
  };
  useEffect(start, []);

  if (boot.phase === 'starting') return <Centered>{t.loading}</Centered>;
  if (boot.phase === 'storage-error')
    return (
      <Centered>
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-semibold">{t.storage.title}</h1>
          <p className="text-muted">{boot.message}</p>
          <Button onClick={start}>{t.storage.retry}</Button>
        </div>
      </Centered>
    );
  return (
    <UiProvider runtime={boot.runtime}>
      {boot.paired ? (
        <Device runtime={boot.runtime} />
      ) : (
        <Pair runtime={boot.runtime} done={() => setBoot({ ...boot, paired: true })} />
      )}
    </UiProvider>
  );
}

const Centered = ({ children }: { children: ReactNode }) => (
  <main className="flex min-h-full items-center justify-center p-6 text-lg">{children}</main>
);

function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <Button variant="ghost" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
      <Icon name="globe" size={18} />
      {t.language}
    </Button>
  );
}

function Pair({ runtime, done }: { runtime: Runtime; done: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const submit = async () => {
    setState('busy');
    try {
      await runtime.pair(code);
      done();
    } catch {
      setState('failed');
    }
  };
  return (
    <Centered>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t.pair.title}</h1>
          <LanguageToggle />
        </div>
        <p className="text-sm text-muted">{t.pair.hint}</p>
        <Field label={t.pair.code}>
          <Input
            dir="ltr"
            autoFocus
            maxLength={8}
            className="text-center text-2xl tracking-[0.3em] uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        {state === 'failed' && (
          <p role="alert" className="text-sm text-danger">
            {t.pair.failed}
          </p>
        )}
        <Button size="lg" disabled={code.trim().length < 6 || state === 'busy'} onClick={submit}>
          {state === 'busy' ? t.pair.syncing : t.pair.submit}
        </Button>
      </div>
    </Centered>
  );
}

type View = 'sell' | 'tables' | 'orders' | 'sales' | 'cash';

function Device({ runtime }: { runtime: Runtime }) {
  const [operator, setOperator] = useState<Operator | null>(runtime.pos.currentOperator());
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    runtime.startLoop();
    return runtime.onStatus(setStatus);
  }, [runtime]);
  if (!operator) return <Login runtime={runtime} status={status} onLogin={setOperator} />;
  return (
    <Shell
      runtime={runtime}
      operator={operator}
      status={status}
      logout={() => {
        runtime.pos.logout();
        setOperator(null);
      }}
    />
  );
}

function Login({
  runtime,
  status,
  onLogin,
}: {
  runtime: Runtime;
  status: SyncStatus | null;
  onLogin: (o: Operator) => void;
}) {
  const { t, error } = useI18n();
  const [no, setNo] = useState('');
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [staff, setStaff] = useState<number | null>(null);
  useEffect(() => {
    void runtime.pos.refs.list('employee').then((e) => setStaff(e.length));
  }, [runtime, status?.lastSyncAt]);
  const submit = async () => {
    try {
      onLogin(await runtime.pos.login(no.trim(), pin));
    } catch (err) {
      setPin('');
      setProblem(error(err));
    }
  };
  return (
    <Centered>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t.login.title}</h1>
          <LanguageToggle />
        </div>
        {staff === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-warning">{t.login.noEmployees}</p>}
        <Field label={t.login.employeeNo}>
          <Input dir="ltr" autoFocus value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} />
        </Field>
        <Field label={t.login.pin}>
          <Input dir="ltr" type="password" readOnly value={pin} />
        </Field>
        <Keypad value={pin} onChange={setPin} />
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        <Button size="lg" disabled={!no.trim() || pin.length < 4} onClick={submit}>
          {t.login.submit}
        </Button>
        <SyncBadge runtime={runtime} status={status} />
      </div>
    </Centered>
  );
}

function SyncBadge({ runtime, status }: { runtime: Runtime; status: SyncStatus | null }) {
  const { t, time } = useI18n();
  if (!status) return null;
  const tone =
    status.state === 'idle' && status.pending === 0 && status.rejected === 0
      ? 'bg-brand-50 text-brand-700'
      : status.state === 'idle' || status.state === 'syncing'
        ? 'bg-amber-50 text-warning'
        : 'bg-red-50 text-danger';
  const label =
    status.state === 'unauthorised'
      ? t.sync.unauthorised
      : status.state === 'device_disabled'
        ? t.sync.disabled
        : status.state === 'offline'
          ? t.sync.offline
          : status.rejected > 0
            ? `${t.sync.rejected}: ${status.rejected}`
            : status.pending > 0
              ? `${t.sync.pending}: ${status.pending}`
              : t.sync.online;
  return (
    <button
      type="button"
      onClick={() => void runtime.syncNow()}
      title={status.leaseValidUntil ? `${t.sync.lease} ${time(status.leaseValidUntil)}` : t.sync.leaseExpired}
      className={`rounded-full px-3 py-1 text-sm font-medium ${tone}`}
    >
      {status.state === 'syncing' ? '⟳ ' : '● '}
      {label}
    </button>
  );
}

function Shell({
  runtime,
  operator,
  status,
  logout,
}: {
  runtime: Runtime;
  operator: Operator;
  status: SyncStatus | null;
  logout: () => void;
}) {
  const { t, name } = useI18n();
  const ui = useUi();
  const [view, setView] = useState<View>('sell');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [branch, setBranch] = useState<{ code: string; nameAr: string; nameEn: string } | null>(null);
  const [receipt, setReceipt] = useState<PrintJob | null>(null);
  useEffect(() => {
    void runtime.pos.identity().then(async (id) => {
      setBranch(
        (await runtime.pos.refs.get('branch', id.branchId)) ?? {
          code: id.branchCode,
          nameAr: id.branchCode,
          nameEn: id.branchCode,
        },
      );
    });
    return runtime.printer.onJob((job) => (job.kind === 'receipt' ? setReceipt(job) : ui.toast(t.sell.sentToKitchen)));
  }, [runtime, ui, t]);
  const open = (id: string | null) => {
    setOrderId(id);
    setView('sell');
  };
  const nav: [View, string, IconName][] = [
    ['sell', t.nav.sell, 'sell'],
    ['tables', t.nav.tables, 'tables'],
    ['orders', t.nav.orders, 'orders'],
    ['sales', t.nav.sales, 'sales'],
    ['cash', t.nav.cash, 'cash'],
  ];
  return (
    <div className="flex h-full">
      {/* Side rail: always within thumb reach on a tablet, leaves the full height to the menu. */}
      <nav aria-label="POS" className="flex w-20 shrink-0 flex-col items-center gap-1 bg-ink py-3 text-white/70">
        <span className="mb-3 grid size-11 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
          R
        </span>
        {nav.map(([v, label, icon]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-current={view === v ? 'page' : undefined}
            className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] leading-tight transition ${
              view === v ? 'bg-white/12 text-white' : 'hover:bg-white/6 hover:text-white'
            }`}
          >
            <Icon name={icon} size={24} className={view === v ? 'text-brand-100' : ''} />
            <span className="text-center">{label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={logout}
          className="mt-auto flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] hover:bg-white/6 hover:text-white"
        >
          <Icon name="lock" size={22} />
          {t.lock}
        </button>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{branch ? name(branch) : t.appName}</p>
            <p className="num text-xs text-muted">{branch?.code}</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <SyncBadge runtime={runtime} status={status} />
            <span className="hidden items-center gap-2 rounded-full bg-surface py-1 ps-1 pe-3 text-sm sm:flex">
              <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-brand-700">
                <Icon name="user" size={16} />
              </span>
              {operator.name}
            </span>
            <LanguageToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1">
          {view === 'sell' ? (
            <SellScreen
              runtime={runtime}
              orderId={orderId}
              setOrderId={setOrderId}
              afterSale={() => void runtime.syncNow()}
              goTables={() => setView('tables')}
            />
          ) : view === 'tables' ? (
            <TablesScreen runtime={runtime} open={open} />
          ) : view === 'orders' ? (
            <OrdersScreen runtime={runtime} open={open} />
          ) : view === 'sales' ? (
            <SalesScreen runtime={runtime} afterRefund={() => void runtime.syncNow()} />
          ) : (
            <CashScreen runtime={runtime} afterChange={() => void runtime.syncNow()} />
          )}
        </main>
      </div>
      {receipt && <ReceiptModal job={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

/**
 * Shows the printer text as rows. The text is padded for a fixed-width printer ("label    value"), which
 * scrambles once Arabic and numbers mix in one line, so each row is split at its padding and both sides
 * keep their own direction.
 */
function ReceiptText({ text }: { text: string }) {
  return (
    <div id="receipt-print" className="flex flex-col gap-0.5 rounded-lg bg-surface p-4 text-sm leading-6">
      {text
        .replace(/\n$/, '')
        .split('\n')
        .map((line, i) => {
          if (/^-+$/.test(line)) return <hr key={i} className="my-1 border-dashed border-line" />;
          const [label, value] = line.trim().split(/\s{2,}/, 2);
          if (value === undefined)
            return (
              // Centred lines (branch, footer) arrive padded with leading spaces; item names start at column 0.
              <p
                key={i}
                className={
                  line.startsWith(' ') ? (i === 0 ? 'text-center font-semibold' : 'text-center') : 'font-medium'
                }
              >
                <bdi>{label}</bdi>
              </p>
            );
          return (
            <p key={i} className="flex justify-between gap-3">
              <bdi>{label}</bdi>
              <bdi className="num">{value}</bdi>
            </p>
          );
        })}
    </div>
  );
}

function ReceiptModal({ job, onClose }: { job: PrintJob; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={`${t.receipt.title} · ${job.invoiceNumber}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ReceiptText text={job.text} />
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" onClick={() => window.print()}>
            🖨 {t.receipt.print}
          </Button>
          <Button size="lg" variant="secondary" className="flex-1" onClick={onClose}>
            <Num>{t.receipt.newSale}</Num>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
