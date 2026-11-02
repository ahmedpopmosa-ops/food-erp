import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import type { Approval } from '@ros/contracts';
import { useI18n } from './i18n';
import type { Runtime } from './runtime';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

/** Touch-sized buttons (≥ 48 px). */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
}) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 font-medium transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'lg' ? 'min-h-14 text-lg' : 'min-h-12 text-base',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-surface',
        variant === 'ghost' && 'text-muted hover:bg-white hover:text-ink',
        variant === 'danger' && 'border border-red-200 bg-white text-danger hover:bg-red-50',
        className,
      )}
    />
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cx(
      'min-h-12 w-full rounded-lg border border-line bg-white px-3 text-lg outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100',
      props.className,
    )}
  />
);

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const Num = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cx('num', className)}>{children}</span>
);

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cx(
          'flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-md',
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" aria-label={t.close} onClick={onClose}>
            ✕
          </Button>
        </header>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** A numeric keypad for PINs and amounts (works on touch screens without a keyboard). */
export function Keypad({
  value,
  onChange,
  decimal,
}: {
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? '.' : 'C', '0', '⌫'];
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === 'C') return onChange('');
    if (k === '.' && value.includes('.')) return;
    onChange(value + k);
  };
  return (
    <div className="num grid grid-cols-3 gap-2" dir="ltr">
      {keys.map((k) => (
        <Button key={k} variant="secondary" size="lg" className="text-2xl" onClick={() => press(k)}>
          {k}
        </Button>
      ))}
    </div>
  );
}

// ── Toasts and manager approvals (app-wide) ───────────────────────────────────

interface Ui {
  toast: (message: string, tone?: 'info' | 'error') => void;
  /** Runs `fn`; if the POS core asks for a manager approval, asks for one (manager no. + PIN) and retries. */
  withApproval: <T>(action: string, fn: (approval: Approval | null) => Promise<T>) => Promise<T | undefined>;
  fail: (err: unknown) => void;
}

const UiCtx = createContext<Ui | null>(null);

export function UiProvider({ runtime, children }: { runtime: Runtime; children: ReactNode }) {
  const { t, error } = useI18n();
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'info' | 'error' }[]>([]);
  const [asking, setAsking] = useState<{ action: string } | null>(null);
  const resolver = useRef<((a: Approval | null) => void) | null>(null);
  const [no, setNo] = useState('');
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const toast = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { id, message, tone }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);
  const fail = useCallback((err: unknown) => toast(error(err), 'error'), [toast, error]);

  const askApproval = (action: string) =>
    new Promise<Approval | null>((resolve) => {
      resolver.current = resolve;
      setNo('');
      setPin('');
      setProblem(null);
      setAsking({ action });
    });

  const withApproval = useCallback(async <T,>(action: string, fn: (approval: Approval | null) => Promise<T>) => {
    try {
      return await fn(null);
    } catch (err) {
      if ((err as { code?: string }).code !== 'approval_required') throw err;
      const approval = await askApproval(action);
      if (!approval) return undefined;
      return fn(approval);
    }
  }, []);

  const submit = async () => {
    try {
      const approval = await runtime.pos.approve(asking!.action, no.trim(), pin);
      setAsking(null);
      resolver.current?.(approval);
    } catch (err) {
      setPin('');
      setProblem(error(err));
    }
  };
  const dismiss = () => {
    setAsking(null);
    resolver.current?.(null);
  };

  return (
    <UiCtx.Provider value={{ toast, withApproval, fail }}>
      {children}
      {asking && (
        <Modal title={t.approval.title} onClose={dismiss}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">{t.approval.hint}</p>
            <Field label={t.approval.manager}>
              <Input dir="ltr" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} />
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
              {t.confirm}
            </Button>
          </div>
        </Modal>
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div
            key={x.id}
            role={x.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-lg',
              x.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white',
            )}
          >
            {x.message}
          </div>
        ))}
      </div>
    </UiCtx.Provider>
  );
}

export function useUi() {
  const v = useContext(UiCtx);
  if (!v) throw new Error('useUi outside UiProvider');
  return v;
}
