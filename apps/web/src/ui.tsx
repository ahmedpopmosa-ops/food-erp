import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useI18n } from './i18n';
import { errorCode } from './api';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-surface',
        variant === 'ghost' && 'text-muted hover:bg-white hover:text-ink',
        className,
      )}
    />
  );
}

export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

const control =
  'min-h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger';

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cx(control, props.className)} />
);
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cx(control, props.className)} />
);

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white">
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className="py-10 text-center text-sm text-muted">
      {t.loading}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, error: message } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-10 text-sm">
      <p className="text-danger">{message(errorCode(error))}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t.retry}
        </Button>
      )}
    </div>
  );
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'danger' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'rounded-md border px-4 py-3 text-sm',
        tone === 'info' && 'border-line bg-surface',
        tone === 'success' && 'border-brand-100 bg-brand-50 text-brand-700',
        tone === 'danger' && 'border-red-200 bg-red-50 text-danger',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-warning',
      )}
    >
      {children}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-start text-xs text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx('px-3 py-2.5', className)}>{children}</td>
);

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-surface text-muted',
        tone === 'success' && 'bg-brand-50 text-brand-700',
        tone === 'warning' && 'bg-amber-50 text-warning',
        tone === 'danger' && 'bg-red-50 text-danger',
      )}
    >
      {children}
    </span>
  );
}
