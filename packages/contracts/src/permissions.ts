/**
 * Canonical permission catalog (`<resource>.<action>`). The API syncs this list into the `permissions`
 * table on migrate; roles may only reference keys defined here. Keys for later phases are declared now so
 * role templates are stable, but an endpoint exists only when its module is implemented.
 */
export const PERMISSIONS = [
  // Setup
  { key: 'setup.settings.view', module: 'setup', sensitive: false },
  { key: 'setup.settings.manage', module: 'setup', sensitive: true },
  { key: 'setup.branches.view', module: 'setup', sensitive: false },
  { key: 'setup.branches.manage', module: 'setup', sensitive: true },
  { key: 'setup.devices.manage', module: 'setup', sensitive: true },
  // Identity
  { key: 'users.view', module: 'identity', sensitive: false },
  { key: 'users.manage', module: 'identity', sensitive: true },
  { key: 'roles.view', module: 'identity', sensitive: false },
  { key: 'roles.manage', module: 'identity', sensitive: true },
  { key: 'audit.view', module: 'identity', sensitive: true },
  { key: 'data.export', module: 'identity', sensitive: true },
  { key: 'billing.view', module: 'identity', sensitive: false },
  { key: 'billing.manage', module: 'identity', sensitive: true },
  // Menu
  { key: 'catalog.view', module: 'catalog', sensitive: false },
  { key: 'catalog.manage', module: 'catalog', sensitive: false },
  { key: 'catalog.prices.manage', module: 'catalog', sensitive: true },
  // POS / sales
  { key: 'pos.sell', module: 'sales', sensitive: false },
  { key: 'pos.discount', module: 'sales', sensitive: false },
  { key: 'pos.discount_over_limit', module: 'sales', sensitive: true },
  { key: 'pos.void_item', module: 'sales', sensitive: false },
  { key: 'pos.void_sent_item', module: 'sales', sensitive: true },
  { key: 'pos.reopen_order', module: 'sales', sensitive: true },
  { key: 'pos.cash_session', module: 'sales', sensitive: false },
  { key: 'pos.cash_movement', module: 'sales', sensitive: true },
  { key: 'sales.view', module: 'sales', sensitive: false },
  { key: 'sales.refund', module: 'sales', sensitive: true },
  { key: 'sales.discrepancies.resolve', module: 'sales', sensitive: true },
  // Kitchen
  { key: 'kitchen.view', module: 'kitchen', sensitive: false },
  { key: 'kitchen.update', module: 'kitchen', sensitive: false },
  // Inventory
  { key: 'inventory.view', module: 'inventory', sensitive: false },
  { key: 'inventory.manage', module: 'inventory', sensitive: false },
  { key: 'inventory.adjust', module: 'inventory', sensitive: true },
  { key: 'inventory.count.approve', module: 'inventory', sensitive: true },
  { key: 'recipes.manage', module: 'inventory', sensitive: false },
  // Purchasing
  { key: 'purchasing.view', module: 'purchasing', sensitive: false },
  { key: 'purchasing.manage', module: 'purchasing', sensitive: false },
  { key: 'purchasing.approve', module: 'purchasing', sensitive: true },
  { key: 'suppliers.payments', module: 'purchasing', sensitive: true },
  // Customers
  { key: 'customers.view', module: 'customers', sensitive: false },
  { key: 'customers.manage', module: 'customers', sensitive: false },
  { key: 'loyalty.manage', module: 'customers', sensitive: false },
  // Accounting
  { key: 'accounting.view', module: 'accounting', sensitive: false },
  { key: 'accounting.journal.post', module: 'accounting', sensitive: true },
  { key: 'accounting.settings.manage', module: 'accounting', sensitive: true },
  { key: 'accounting.period_close', module: 'accounting', sensitive: true },
  { key: 'accounting.period_reopen', module: 'accounting', sensitive: true },
  { key: 'accounting.post_in_soft_closed', module: 'accounting', sensitive: true },
  // People
  { key: 'hr.view', module: 'people', sensitive: false },
  { key: 'hr.manage', module: 'people', sensitive: false },
  { key: 'hr.view_sensitive', module: 'people', sensitive: true },
  { key: 'payroll.view', module: 'people', sensitive: true },
  { key: 'payroll.manage', module: 'people', sensitive: true },
  // Reports
  { key: 'reports.sales', module: 'reports', sensitive: false },
  { key: 'reports.inventory', module: 'reports', sensitive: false },
  { key: 'reports.financial', module: 'reports', sensitive: true },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly Permission[] = PERMISSIONS.map((p) => p.key);

export function isPermission(value: string): value is Permission {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

/** True when every permission in `required` is granted. */
export function hasPermission(granted: readonly string[], required: readonly Permission[]): boolean {
  return required.every((p) => granted.includes(p));
}

const all = (): Permission[] => [...PERMISSION_KEYS];
const only = (...keys: Permission[]): Permission[] => keys;

export type RoleTemplateKey =
  'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'storekeeper' | 'purchasing' | 'accountant' | 'hr';

export interface RoleTemplate {
  key: RoleTemplateKey;
  nameEn: string;
  nameAr: string;
  permissions: Permission[];
}

/** Seeded into every new tenant. Tenants may edit all of them except `owner`. */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  { key: 'owner', nameEn: 'Owner', nameAr: 'المالك', permissions: all() },
  {
    key: 'manager',
    nameEn: 'Branch manager',
    nameAr: 'مدير الفرع',
    permissions: only(
      'setup.settings.view',
      'setup.branches.view',
      'setup.devices.manage',
      'users.view',
      'roles.view',
      'catalog.view',
      'catalog.manage',
      'pos.sell',
      'pos.discount',
      'pos.discount_over_limit',
      'pos.void_item',
      'pos.void_sent_item',
      'pos.reopen_order',
      'pos.cash_session',
      'pos.cash_movement',
      'sales.view',
      'sales.refund',
      'sales.discrepancies.resolve',
      'kitchen.view',
      'kitchen.update',
      'inventory.view',
      'inventory.manage',
      'inventory.adjust',
      'inventory.count.approve',
      'purchasing.view',
      'customers.view',
      'customers.manage',
      'hr.view',
      'reports.sales',
      'reports.inventory',
    ),
  },
  {
    key: 'cashier',
    nameEn: 'Cashier',
    nameAr: 'كاشير',
    permissions: only(
      'catalog.view',
      'pos.sell',
      'pos.discount',
      'pos.void_item',
      'pos.cash_session',
      'customers.view',
    ),
  },
  { key: 'waiter', nameEn: 'Waiter', nameAr: 'نادل', permissions: only('catalog.view', 'pos.sell', 'customers.view') },
  { key: 'kitchen', nameEn: 'Kitchen staff', nameAr: 'المطبخ', permissions: only('kitchen.view', 'kitchen.update') },
  {
    key: 'storekeeper',
    nameEn: 'Storekeeper',
    nameAr: 'أمين المخزن',
    permissions: only(
      'catalog.view',
      'inventory.view',
      'inventory.manage',
      'recipes.manage',
      'purchasing.view',
      'reports.inventory',
    ),
  },
  {
    key: 'purchasing',
    nameEn: 'Purchasing officer',
    nameAr: 'مسؤول المشتريات',
    permissions: only('inventory.view', 'purchasing.view', 'purchasing.manage', 'reports.inventory'),
  },
  {
    key: 'accountant',
    nameEn: 'Accountant',
    nameAr: 'محاسب',
    permissions: only(
      'setup.branches.view',
      'sales.view',
      'inventory.view',
      'purchasing.view',
      'suppliers.payments',
      'accounting.view',
      'accounting.journal.post',
      'accounting.settings.manage',
      'accounting.period_close',
      'reports.sales',
      'reports.inventory',
      'reports.financial',
      'data.export',
    ),
  },
  {
    key: 'hr',
    nameEn: 'HR & payroll',
    nameAr: 'الموارد البشرية والرواتب',
    permissions: only(
      'setup.branches.view',
      'hr.view',
      'hr.manage',
      'hr.view_sensitive',
      'payroll.view',
      'payroll.manage',
    ),
  },
];
