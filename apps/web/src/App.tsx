import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorCode } from './api';
import { useI18n } from './i18n';
import { Alert, Button, Field, Input, Loading } from './ui';
import { DevicesPage, InvoicesPage, ProductsPage } from './pages';
import { TablesPage } from './tables';
import { AccountingSection } from './accounting';
import { InventoryPage } from './inventory';
import { KitchenPage } from './kitchen';
import { PurchasingPage } from './purchasing';

interface Me {
  user: { fullName: string; email: string };
  tenant: { displayName: string } | null;
  permissions: string[];
}

/** Tiny hash router: #/products, #/invoices/<id> … (no SSR, no deep server routes needed). */
function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/products';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [path, (p: string) => (window.location.hash = p)] as const;
}

export function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false });
  if (me.isPending) return <Loading />;
  if (me.isError) return <Login />;
  return <Shell me={me.data} />;
}

function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <Button
      variant="ghost"
      onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
      lang={locale === 'ar' ? 'en' : 'ar'}
    >
      {t.language}
    </Button>
  );
}

function Login() {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api('/auth/login', { method: 'POST', body: { email, password } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-white p-6"
      >
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t.appName}</h1>
          <LanguageToggle />
        </div>
        <Field label={t.email}>
          <Input
            type="email"
            autoComplete="username"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t.password}>
          <Input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {login.isError && <Alert tone="danger">{error(errorCode(login.error))}</Alert>}
        <Button type="submit" disabled={login.isPending}>
          {t.signIn}
        </Button>
      </form>
    </main>
  );
}

function Shell({ me }: { me: Me }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [path, go] = useHashRoute();
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => qc.clear(),
  });
  const can = (p: string) => me.permissions.includes(p);
  const nav = [
    { path: '/products', label: t.nav.products, show: can('catalog.view') },
    { path: '/devices', label: t.nav.devices, show: can('setup.devices.manage') },
    { path: '/tables', label: t.nav.tables, show: can('setup.branches.view') },
    { path: '/invoices', label: t.nav.invoices, show: can('sales.view') },
    { path: '/kitchen', label: t.nav.kitchen, show: can('kitchen.view') },
    { path: '/inventory', label: t.nav.inventory, show: can('inventory.view') },
    { path: '/purchasing', label: t.nav.purchasing, show: can('purchasing.view') },
    { path: '/accounting', label: t.nav.accounting, show: can('accounting.view') },
  ].filter((n) => n.show);
  const [, section, id, sub] = path.split('/');

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold text-brand-700">{t.appName}</span>
          <span className="text-sm text-muted">{me.tenant?.displayName}</span>
          <nav aria-label="Main" className="flex flex-wrap gap-1 sm:ms-4">
            {nav.map((n) => (
              <a
                key={n.path}
                href={`#${n.path}`}
                aria-current={`/${section}` === n.path ? 'page' : undefined}
                className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink aria-[current=page]:bg-brand-50 aria-[current=page]:font-medium aria-[current=page]:text-brand-700"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 ms-auto">
            <span className="hidden text-sm text-muted sm:inline">{me.user.fullName}</span>
            <LanguageToggle />
            <Button variant="secondary" onClick={() => logout.mutate()}>
              {t.signOut}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">
        {section === 'devices' ? (
          <DevicesPage />
        ) : section === 'tables' ? (
          <TablesPage canManage={can('setup.branches.manage')} />
        ) : section === 'invoices' ? (
          <InvoicesPage id={id} go={go} />
        ) : section === 'accounting' ? (
          <AccountingSection tab={id} id={sub} go={go} can={can} />
        ) : section === 'kitchen' ? (
          <KitchenPage tab={id} can={can} />
        ) : section === 'inventory' ? (
          <InventoryPage tab={id} id={sub} go={go} can={can} />
        ) : section === 'purchasing' ? (
          <PurchasingPage tab={id} id={sub} go={go} can={can} />
        ) : (
          <ProductsPage />
        )}
      </main>
    </div>
  );
}
