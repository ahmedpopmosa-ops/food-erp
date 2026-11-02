// Test-only seeding for POS-core suites (excluded from the build). Values are test data.
import { generateKeyPairSync, sign } from 'node:crypto';
import type { PullChange } from '@ros/contracts';
import { hashPin } from '@ros/domain';
import type { SqlDriver } from './driver';
import { ReferenceStore } from './catalog';

export const IDS = {
  tenant: '0192f0c4-0000-7000-8000-000000000001',
  branch: '0192f0c4-0000-7000-8000-000000000002',
  device: '0192f0c4-0000-7000-8000-000000000003',
  product: '0192f0c4-0000-7000-8000-000000000010',
  variant: '0192f0c4-0000-7000-8000-000000000011',
  price: '0192f0c4-0000-7000-8000-000000000012',
  taxCat: '0192f0c4-0000-7000-8000-000000000020',
  taxRate: '0192f0c4-0000-7000-8000-000000000021',
  link: '0192f0c4-0000-7000-8000-000000000022',
  cash: '0192f0c4-0000-7000-8000-000000000030',
  card: '0192f0c4-0000-7000-8000-000000000031',
  cashier: '0192f0c4-0000-7000-8000-000000000040',
  manager: '0192f0c4-0000-7000-8000-000000000041',
  cashierRole: '0192f0c4-0000-7000-8000-000000000050',
  managerRole: '0192f0c4-0000-7000-8000-000000000051',
  sizeGroup: '0192f0c4-0000-7000-8000-000000000060',
  large: '0192f0c4-0000-7000-8000-000000000061',
  noOnion: '0192f0c4-0000-7000-8000-000000000062',
  extrasGroup: '0192f0c4-0000-7000-8000-000000000063',
  link1: '0192f0c4-0000-7000-8000-000000000064',
  link2: '0192f0c4-0000-7000-8000-000000000065',
  hall: '0192f0c4-0000-7000-8000-000000000070',
  table1: '0192f0c4-0000-7000-8000-000000000071',
  table2: '0192f0c4-0000-7000-8000-000000000072',
};

export const TEST_PIN = '1357';

export const NOW = '2026-10-30T10:00:00.000Z';

const catalog: PullChange[] = [
  {
    entity_type: 'branch',
    op: 'upsert',
    id: IDS.branch,
    data: {
      id: IDS.branch,
      code: 'NC1',
      nameEn: 'Nasr City',
      nameAr: 'مدينة نصر',
      currencyCode: 'EGP',
      timezone: 'Africa/Cairo',
    },
  },
  {
    entity_type: 'tenant_settings',
    op: 'upsert',
    id: IDS.tenant,
    data: { tenantId: IDS.tenant, priceIncludesTax: true },
  },
  {
    entity_type: 'product',
    op: 'upsert',
    id: IDS.product,
    data: { id: IDS.product, nameEn: 'Koshary', nameAr: 'كشري', taxCategoryId: IDS.taxCat, archivedAt: null },
  },
  {
    entity_type: 'product_variant',
    op: 'upsert',
    id: IDS.variant,
    data: { id: IDS.variant, productId: IDS.product, isDefault: true, archivedAt: null },
  },
  {
    entity_type: 'product_price',
    op: 'upsert',
    id: IDS.price,
    data: {
      id: IDS.price,
      variantId: IDS.variant,
      branchId: null,
      channel: null,
      price: '57',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: null,
    },
  },
  {
    entity_type: 'tax_rate',
    op: 'upsert',
    id: IDS.taxRate,
    data: { id: IDS.taxRate, rate: '0.14', validFrom: '2000-01-01T00:00:00.000Z', validTo: null },
  },
  {
    entity_type: 'tax_category_rate',
    op: 'upsert',
    id: IDS.link,
    data: { id: IDS.link, taxCategoryId: IDS.taxCat, taxRateId: IDS.taxRate, appliesTo: 'sale', sequence: 1 },
  },
  {
    entity_type: 'payment_method',
    op: 'upsert',
    id: IDS.cash,
    data: { id: IDS.cash, nameEn: 'Cash', kind: 'cash', allowsChange: true, isActive: true },
  },
  {
    entity_type: 'payment_method',
    op: 'upsert',
    id: IDS.card,
    data: { id: IDS.card, nameEn: 'Card', kind: 'card', allowsChange: false, isActive: true },
  },
  {
    entity_type: 'role',
    op: 'upsert',
    id: IDS.cashierRole,
    data: { id: IDS.cashierRole, permissions: ['pos.sell', 'pos.cash_session', 'pos.discount', 'pos.void_item'] },
  },
  {
    entity_type: 'role',
    op: 'upsert',
    id: IDS.managerRole,
    data: {
      id: IDS.managerRole,
      permissions: [
        'pos.sell',
        'pos.cash_session',
        'pos.cash_movement',
        'sales.refund',
        'pos.discount',
        'pos.discount_over_limit',
        'pos.void_item',
        'pos.void_sent_item',
      ],
    },
  },
  {
    entity_type: 'modifier_group',
    op: 'upsert',
    id: IDS.sizeGroup,
    data: { id: IDS.sizeGroup, nameAr: 'الحجم', nameEn: 'Size', minSelect: 0, maxSelect: 1, archivedAt: null },
  },
  {
    entity_type: 'modifier',
    op: 'upsert',
    id: IDS.large,
    data: {
      id: IDS.large,
      groupId: IDS.sizeGroup,
      nameAr: 'كبير',
      nameEn: 'Large',
      priceDelta: '11.4',
      sort: 0,
      archivedAt: null,
    },
  },
  {
    entity_type: 'modifier_group',
    op: 'upsert',
    id: IDS.extrasGroup,
    data: { id: IDS.extrasGroup, nameAr: 'إضافات', nameEn: 'Extras', minSelect: 0, maxSelect: 3, archivedAt: null },
  },
  {
    entity_type: 'modifier',
    op: 'upsert',
    id: IDS.noOnion,
    data: {
      id: IDS.noOnion,
      groupId: IDS.extrasGroup,
      nameAr: 'بدون بصل',
      nameEn: 'No onion',
      priceDelta: '0',
      sort: 0,
      archivedAt: null,
    },
  },
  {
    entity_type: 'product_modifier_group',
    op: 'upsert',
    id: IDS.link1,
    data: { id: IDS.link1, productId: IDS.product, groupId: IDS.sizeGroup, sort: 0 },
  },
  {
    entity_type: 'product_modifier_group',
    op: 'upsert',
    id: IDS.link2,
    data: { id: IDS.link2, productId: IDS.product, groupId: IDS.extrasGroup, sort: 1 },
  },
  {
    entity_type: 'service_area',
    op: 'upsert',
    id: IDS.hall,
    data: { id: IDS.hall, nameAr: 'الصالة', nameEn: 'Main hall', sort: 0 },
  },
  {
    entity_type: 'dining_table',
    op: 'upsert',
    id: IDS.table1,
    data: { id: IDS.table1, serviceAreaId: IDS.hall, label: 'T1', seats: 4, isActive: true },
  },
  {
    entity_type: 'dining_table',
    op: 'upsert',
    id: IDS.table2,
    data: { id: IDS.table2, serviceAreaId: IDS.hall, label: 'T2', seats: 2, isActive: true },
  },
];

/** A lease signed by a throw-away Ed25519 key, valid until `validUntil`. */
export function signedLease(validUntil: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const payload = Buffer.from(
    JSON.stringify({
      tenant_id: IDS.tenant,
      branch_id: IDS.branch,
      device_id: IDS.device,
      issued_at: NOW,
      valid_until: validUntil,
    }),
  ).toString('base64url');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    lease: { payload, signature: sign(null, Buffer.from(payload), privateKey).toString('base64url'), kid: 'test' },
  };
}

/** Catalog, staff with PINs, device identity and a valid lease — a paired, synced POS. */
export async function seedPos(db: SqlDriver, opts: { leaseValidUntil?: string } = {}) {
  const pinHash = await hashPin(TEST_PIN, 1000);
  const staff: PullChange[] = [
    {
      entity_type: 'employee',
      op: 'upsert',
      id: IDS.cashier,
      data: { id: IDS.cashier, employeeNo: 'C1', fullNameEn: 'Cashier One', roleId: IDS.cashierRole, pinHash },
    },
    {
      entity_type: 'employee',
      op: 'upsert',
      id: IDS.manager,
      data: { id: IDS.manager, employeeNo: 'M1', fullNameEn: 'Manager One', roleId: IDS.managerRole, pinHash },
    },
  ];
  const { publicKey, lease } = signedLease(opts.leaseValidUntil ?? '2026-11-06T10:00:00.000Z');
  const meta: Record<string, string> = {
    'device.tenantId': IDS.tenant,
    'device.branchId': IDS.branch,
    'device.deviceId': IDS.device,
    'device.branchCode': 'NC1',
    'device.deviceCode': 'D2',
    'lease.public_key': publicKey,
    'lease.value': JSON.stringify(lease),
  };
  await db.batch([
    ...new ReferenceStore(db).changeStatements([...catalog, ...staff]),
    ...Object.entries(meta).map(([key, value]) => ({
      sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      params: [key, value],
    })),
  ]);
}
