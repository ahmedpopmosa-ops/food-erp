import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SyncService } from '../src/sync/sync.service';
import { SaleFinalizedHandler } from '../src/sync/sale.handler';
import { CashMovementHandler, CashSessionClosedHandler, CashSessionOpenedHandler } from '../src/sync/cash.handlers';
import { RefundIssuedHandler } from '../src/sync/refund.handler';
import { OrderCancelledHandler } from '../src/sync/order-cancelled.handler';
import { ApprovalsService } from '../src/sync/approvals.service';
import { LedgerService } from '../src/inventory/ledger.service';
import { ConsumptionService } from '../src/inventory/consumption.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { PurchasingService } from '../src/purchasing/purchasing.service';
import { BankService } from '../src/finance/bank.service';
import { KitchenFiredHandler, KitchenVoidedHandler } from '../src/kitchen/kitchen.handlers';
import type { TenantContext } from '../src/common/auth-context';

/** SyncService wired without Nest (used to build fixtures through the real sync path). */
export function syncServiceFor(prisma: PrismaService) {
  const posting = new PostingService();
  const audit = new AuditService();
  const approvals = new ApprovalsService();
  const consumption = new ConsumptionService(new LedgerService(posting), posting);
  return new SyncService(
    prisma,
    new SaleFinalizedHandler(posting, audit, approvals, consumption),
    new CashSessionOpenedHandler(audit),
    new CashMovementHandler(posting, approvals),
    new CashSessionClosedHandler(posting, audit),
    new RefundIssuedHandler(posting, audit, approvals),
    new OrderCancelledHandler(audit, approvals, consumption),
    new KitchenFiredHandler(),
    new KitchenVoidedHandler(),
  );
}

export function inventoryServiceFor(prisma: PrismaService) {
  const posting = new PostingService();
  return new InventoryService(prisma, new AuditService(), new LedgerService(posting), posting);
}

export function purchasingServiceFor(prisma: PrismaService) {
  const posting = new PostingService();
  return new PurchasingService(prisma, new AuditService(), new LedgerService(posting), posting);
}

/** Back-office context of a tenant's owner, for building fixtures through the real services. */
async function ownerContext(owner: PrismaClient, tenantId: string, email: string): Promise<TenantContext> {
  const m = await owner.membership.findFirstOrThrow({ where: { tenantId, user: { email } }, include: { user: true } });
  return {
    sessionId: randomUUID(),
    userId: m.userId,
    email,
    fullName: m.user.fullName,
    locale: 'en-US',
    tenantId,
    tenantStatus: 'active',
    membershipId: m.id,
    roleId: m.roleId,
    roleTemplate: 'owner',
    permissions: [],
    allBranches: true,
    branchIds: [],
  };
}
import { PostingService } from '../src/accounting/posting.service';
import { randomToken, sha256 } from '../src/common/crypto';
import { buildSaleOp, envelope as envelopeFor, pushBody } from './sale-factory';
import { childId, hashPin, refundLineAmounts, uuidv7 } from '@ros/domain';
import { ROLE_TEMPLATES } from '@ros/contracts';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/identity/audit/audit.service';
import { TokensService } from '../src/identity/auth/tokens.service';
import { LogMailer } from '../src/common/mailer';
import { OnboardingService } from '../src/platform/onboarding.service';
import { AccountingSetupService } from '../src/accounting/accounting-setup.service';
import { CatalogSetupService } from '../src/catalog/catalog-setup.service';
import { hashPassword } from '../src/common/crypto';
import { seedPlans } from '../prisma/plans';
import { syncPermissions } from '../prisma/sync-permissions';

/** Test-only POS PIN for every fixture employee (test database only). */
export const TEST_PIN = '2468';

/** Test-only password for every fixture account (test database only). */
export const TEST_PASSWORD = 'Test-Password-0001';

export const EMAILS = {
  ownerA: 'owner-a@test.local',
  managerA: 'manager-a@test.local',
  nopermA: 'noperm-a@test.local',
  multi: 'multi@test.local',
  lockout: 'lockout@test.local',
  ownerB: 'owner-b@test.local',
  rolemgrB: 'rolemgr-b@test.local',
  ownerC: 'owner-c@test.local',
  operator: 'op@test.local',
  operatorReadonly: 'op-readonly@test.local',
} as const;

const TABLES = [
  'kitchen_ticket_events',
  'kitchen_ticket_items',
  'kitchen_tickets',
  'kitchen_station_routes',
  'kitchen_stations',
  'bank_statement_lines',
  'bank_statements',
  'supplier_return_lines',
  'supplier_returns',
  'supplier_payment_allocations',
  'supplier_payments',
  'supplier_invoice_lines',
  'supplier_invoices',
  'goods_receipt_lines',
  'goods_receipts',
  'purchase_order_lines',
  'purchase_orders',
  'suppliers',
  'stock_transfer_lines',
  'stock_transfers',
  'stock_count_lines',
  'stock_counts',
  'stock_adjustment_lines',
  'stock_adjustments',
  'stock_movements',
  'stock_balances',
  'recipe_lines',
  'recipe_versions',
  'recipes',
  'inventory_items',
  'product_modifier_groups',
  'modifiers',
  'modifier_groups',
  'dining_tables',
  'service_areas',
  'refund_lines',
  'refunds',
  'cash_movements',
  'approvals',
  'cash_sessions',
  'employee_branches',
  'employees',
  'sale_discrepancies',
  'payments',
  'invoice_taxes',
  'invoice_lines',
  'invoices',
  'order_items',
  'orders',
  'journal_lines',
  'journal_entries',
  'accounting_mappings',
  'accounting_periods',
  'fiscal_years',
  'document_sequences',
  'product_prices',
  'product_variants',
  'products',
  'categories',
  'payment_methods',
  'tax_category_rates',
  'tax_categories',
  'tax_rates',
  'accounts',
  'sync_operations',
  'sync_batches',
  'idempotency_keys',
  'change_log',
  'device_sync_state',
  'device_tokens',
  'devices',
  'audit_logs',
  'platform_audit_logs',
  'platform_sessions',
  'platform_users',
  'password_reset_tokens',
  'sessions',
  'membership_branches',
  'memberships',
  'role_permissions',
  'roles',
  'warehouses',
  'branches',
  'tenant_settings',
  'subscriptions',
  'tenants',
  'users',
  'plan_entitlements',
  'plans',
];

export const ownerClient = () => new PrismaClient({ datasourceUrl: process.env.DATABASE_OWNER_URL });

/**
 * Builds the fixture world. Tenants are onboarded through the real OnboardingService over the restricted
 * app role (so onboarding itself is exercised under RLS); extra rows that no Phase 2 endpoint creates are
 * inserted with the owner connection.
 */
export async function buildFixtures() {
  const owner = ownerClient();
  const app = new PrismaService();
  try {
    await owner.$executeRawUnsafe(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
    await syncPermissions(owner);
    await seedPlans(owner);
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await owner.platformUser.createMany({
      data: [
        { email: EMAILS.operator, fullName: 'Operator', role: 'owner', passwordHash },
        { email: EMAILS.operatorReadonly, fullName: 'Read-only operator', role: 'readonly', passwordHash },
      ],
    });

    const accountingSetup = new AccountingSetupService();
    const onboarding = new OnboardingService(
      app,
      new AuditService(),
      new TokensService(app, new LogMailer()),
      accountingSetup,
      new CatalogSetupService(accountingSetup),
    );
    const onboard = (slug: string, plan: string, ownerEmail: string, branchCode: string) =>
      onboarding.onboard(null, {
        legalName: `${slug} LLC`,
        displayName: slug,
        slug,
        countryCode: 'EG',
        baseCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        defaultLocale: 'en-US',
        planCode: plan,
        owner: { email: ownerEmail, fullName: `Owner ${slug}` },
        firstBranch: { code: branchCode, nameAr: `فرع ${branchCode}`, nameEn: `Branch ${branchCode}` },
      });
    const a = await onboard('tenant-a', 'starter', EMAILS.ownerA, 'A1');
    const b = await onboard('tenant-b', 'growth', EMAILS.ownerB, 'B1');
    const c = await onboard('tenant-c', 'starter', EMAILS.ownerC, 'C1');

    // Tenant A: second branch (fills the starter limit of 2), branch-scoped manager, member with no permissions.
    const a2 = await owner.branch.create({
      data: {
        tenantId: a.tenantId,
        code: 'A2',
        nameAr: 'فرع A2',
        nameEn: 'Branch A2',
        timezone: 'Africa/Cairo',
        currencyCode: 'EGP',
      },
    });
    await owner.warehouse.create({
      data: { tenantId: a.tenantId, branchId: a2.id, code: 'A2-MAIN', name: 'A2 main store', kind: 'main' },
    });
    const rolesA = await owner.role.findMany({ where: { tenantId: a.tenantId } });
    const roleA = (key: string) => rolesA.find((r) => r.templateKey === key)!.id;
    const noPermRoleA = await owner.role.create({ data: { tenantId: a.tenantId, name: 'No permissions' } });

    const user = (email: string, fullName: string) => owner.user.create({ data: { email, fullName, passwordHash } });
    const managerA = await user(EMAILS.managerA, 'Manager A');
    const nopermA = await user(EMAILS.nopermA, 'No-perm A');
    const multi = await user(EMAILS.multi, 'Multi tenant');
    const lockout = await user(EMAILS.lockout, 'Lockout target');
    const rolemgrB = await user(EMAILS.rolemgrB, 'Role manager B');

    await owner.membership.create({
      data: {
        tenantId: a.tenantId,
        userId: managerA.id,
        roleId: roleA('manager'),
        allBranches: false,
        branches: { create: [{ tenantId: a.tenantId, branchId: a.branchId }] },
      },
    });
    await owner.membership.create({ data: { tenantId: a.tenantId, userId: nopermA.id, roleId: noPermRoleA.id } });
    await owner.membership.create({ data: { tenantId: a.tenantId, userId: multi.id, roleId: roleA('cashier') } });

    // Tenant B: multi-tenant user and a role manager lacking payroll permissions (escalation tests).
    const rolesB = await owner.role.findMany({ where: { tenantId: b.tenantId } });
    await owner.membership.create({
      data: { tenantId: b.tenantId, userId: multi.id, roleId: rolesB.find((r) => r.templateKey === 'cashier')!.id },
    });
    const roleMgrRole = await owner.role.create({
      data: {
        tenantId: b.tenantId,
        name: 'Role managers',
        rolePermissions: {
          create: ['roles.view', 'roles.manage', 'users.view', 'users.manage', 'setup.branches.view'].map(
            (permissionKey) => ({
              tenantId: b.tenantId,
              permissionKey,
            }),
          ),
        },
      },
    });
    await owner.membership.create({ data: { tenantId: b.tenantId, userId: rolemgrB.id, roleId: roleMgrRole.id } });
    await owner.membership.create({
      data: {
        tenantId: c.tenantId,
        userId: lockout.id,
        roleId: (await owner.role.findFirstOrThrow({ where: { tenantId: c.tenantId, templateKey: 'cashier' } })).id,
      },
    });

    // Owners get passwords; their invitations are treated as accepted.
    for (const email of [EMAILS.ownerA, EMAILS.ownerB, EMAILS.ownerC]) {
      const u = await owner.user.update({ where: { email }, data: { passwordHash } });
      await owner.membership.updateMany({ where: { userId: u.id }, data: { status: 'active' } });
    }
    await owner.tenant.update({ where: { id: c.tenantId }, data: { status: 'suspended' } });

    // Tenant A: one product, one paired device and one synced sale recorded through the real sync service
    // (sold at an outdated price, so a discrepancy exists too). Every Phase 3 table then holds data.
    const category = await owner.category.create({
      data: { tenantId: a.tenantId, nameAr: 'مشروبات', nameEn: 'Drinks' },
    });
    const standard = await owner.taxCategory.findFirstOrThrow({
      where: { tenantId: a.tenantId, code: 'STANDARD' },
      include: { rates: { include: { taxRate: true } } },
    });
    const product = await owner.product.create({
      data: { tenantId: a.tenantId, categoryId: category.id, taxCategoryId: standard.id, nameAr: 'شاي', nameEn: 'Tea' },
    });
    const variant = await owner.productVariant.create({
      data: { tenantId: a.tenantId, productId: product.id, isDefault: true },
    });
    await owner.productPrice.create({
      data: {
        tenantId: a.tenantId,
        variantId: variant.id,
        price: '20.00',
        currencyCode: 'EGP',
        validFrom: new Date(Date.now() - 3600_000),
      },
    });

    // Tenant A stock through the real inventory service: tea leaves with an opening balance, a recipe for the
    // fixture product (the fixture sale then consumes it), wastage, a received transfer and an approved count.
    const inventory = inventoryServiceFor(app);
    const ctxA = await ownerContext(owner, a.tenantId, EMAILS.ownerA);
    const mainA1 = await owner.warehouse.findFirstOrThrow({ where: { tenantId: a.tenantId, code: 'A1-MAIN' } });
    const mainA2 = await owner.warehouse.findFirstOrThrow({ where: { tenantId: a.tenantId, code: 'A2-MAIN' } });
    const leaves = await inventory.createItem(ctxA, {
      code: 'TEA-LEAF',
      nameAr: 'شاي سائب',
      nameEn: 'Tea leaves',
      kind: 'ingredient',
      baseUnit: 'g',
      standardCost: '0.5',
      conversions: {},
      minQty: '200',
    });
    await inventory.createAdjustment(ctxA, {
      warehouseId: mainA1.id,
      kind: 'opening_balance',
      reason: 'Opening stock',
      lines: [{ itemId: leaves.id, qty: '1', unit: 'kg', unitCost: '500' }],
    });
    await inventory.createRecipeVersion(ctxA, {
      variantId: variant.id,
      yieldQty: '1',
      lines: [{ itemId: leaves.id, qty: '5', unit: 'g', wastePct: '0' }],
    });
    await inventory.createAdjustment(ctxA, {
      warehouseId: mainA1.id,
      kind: 'wastage',
      reason: 'Spilled',
      lines: [{ itemId: leaves.id, qty: '10', unit: 'g' }],
    });
    const transferA = await inventory.createTransfer(ctxA, {
      fromWarehouseId: mainA1.id,
      toWarehouseId: mainA2.id,
      lines: [{ itemId: leaves.id, qty: '100', unit: 'g' }],
    });
    await inventory.dispatchTransfer(ctxA, transferA.id);
    await inventory.receiveTransfer(ctxA, transferA.id, {
      lines: [{ itemId: leaves.id, qtyReceived: '100', unit: 'g' }],
    });
    const countA = await inventory.startCount(ctxA, mainA2.id);
    await inventory.enterCount(ctxA, countA.id, { lines: [{ itemId: leaves.id, countedQty: '98', unit: 'g' }] });
    await inventory.approveCount(ctxA, countA.id);

    const device = await owner.device.create({
      data: { tenantId: a.tenantId, branchId: a.branchId, code: 'P1', name: 'Fixture POS', status: 'active' },
    });
    await owner.deviceToken.create({
      data: {
        tenantId: a.tenantId,
        deviceId: device.id,
        kind: 'refresh',
        tokenHash: sha256(randomToken()),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const cash = await owner.paymentMethod.findFirstOrThrow({ where: { tenantId: a.tenantId, code: 'CASH' } });
    const deviceCtx = {
      tenantId: a.tenantId,
      branchId: a.branchId,
      deviceId: device.id,
      branchCode: 'A1',
      deviceCode: 'P1',
    };
    const sync = syncServiceFor(app);
    const res = await sync.push(
      deviceCtx,
      pushBody([
        buildSaleOp(deviceCtx, {
          seq: 1,
          paymentMethodId: cash.id,
          items: [
            {
              variantId: variant.id,
              taxCategoryId: standard.id,
              taxes: standard.rates.map((r) => ({ taxRateId: r.taxRateId, rate: '0.14' })),
              unitPrice: '18.00',
              nameAr: 'شاي',
              nameEn: 'Tea',
            },
          ],
        }),
      ]),
    );
    if (res.results[0]?.status !== 'accepted')
      throw new Error(`Fixture sale not accepted: ${JSON.stringify(res.results)}`);

    // Tenant B: one product, device and synced sale, the targets of the cross-tenant (IDOR) suite.
    const categoryB = await owner.category.create({ data: { tenantId: b.tenantId, nameAr: 'أطباق', nameEn: 'Mains' } });
    const standardB = await owner.taxCategory.findFirstOrThrow({
      where: { tenantId: b.tenantId, code: 'STANDARD' },
      include: { rates: true },
    });
    const productB = await owner.product.create({
      data: {
        tenantId: b.tenantId,
        categoryId: categoryB.id,
        taxCategoryId: standardB.id,
        nameAr: 'كشري',
        nameEn: 'Koshary',
      },
    });
    const variantB = await owner.productVariant.create({
      data: { tenantId: b.tenantId, productId: productB.id, isDefault: true },
    });
    await owner.productPrice.create({
      data: {
        tenantId: b.tenantId,
        variantId: variantB.id,
        price: '60.00',
        currencyCode: 'EGP',
        validFrom: new Date(Date.now() - 3600_000),
      },
    });
    const deviceB = await owner.device.create({
      data: { tenantId: b.tenantId, branchId: b.branchId, code: 'P1', name: 'B POS', status: 'active' },
    });
    const cashB = await owner.paymentMethod.findFirstOrThrow({ where: { tenantId: b.tenantId, code: 'CASH' } });
    const deviceCtxB = {
      tenantId: b.tenantId,
      branchId: b.branchId,
      deviceId: deviceB.id,
      branchCode: 'B1',
      deviceCode: 'P1',
    };
    const resB = await sync.push(
      deviceCtxB,
      pushBody([
        buildSaleOp(deviceCtxB, {
          seq: 1,
          paymentMethodId: cashB.id,
          items: [
            {
              variantId: variantB.id,
              taxCategoryId: standardB.id,
              taxes: standardB.rates.map((r) => ({ taxRateId: r.taxRateId, rate: '0.14' })),
              unitPrice: '60.00',
            },
          ],
        }),
      ]),
    );
    if (resB.results[0]?.status !== 'accepted')
      throw new Error(`Fixture sale B not accepted: ${JSON.stringify(resB.results)}`);

    // Tenant B stock documents: an open count and a draft transfer (IDOR targets).
    const ctxB = await ownerContext(owner, b.tenantId, EMAILS.ownerB);
    const mainB1 = await owner.warehouse.findFirstOrThrow({ where: { tenantId: b.tenantId, code: 'B1-MAIN' } });
    const barB1 = await owner.warehouse.create({
      data: { tenantId: b.tenantId, branchId: b.branchId, code: 'B1-BAR', name: 'B1 bar', kind: 'bar' },
    });
    const riceB = await inventory.createItem(ctxB, {
      code: 'RICE',
      nameAr: 'أرز',
      nameEn: 'Rice',
      kind: 'ingredient',
      baseUnit: 'g',
      standardCost: '0.03',
      conversions: {},
      minQty: null,
    });
    await inventory.startCount(ctxB, mainB1.id);
    await inventory.createTransfer(ctxB, {
      fromWarehouseId: mainB1.id,
      toWarehouseId: barB1.id,
      lines: [{ itemId: riceB.id, qty: '1', unit: 'kg' }],
    });

    // Tenant B purchasing (IDOR targets, and a row in every purchasing table): a supplier, a draft order, a
    // direct receipt of 5 kg rice (150.00), an invoice for 4 kg (120.00 + 16.80 VAT), a return of 0.5 kg and a
    // part payment of 36.80. Left open: 100.00 payable, 0.5 kg (15.00) received and not invoiced.
    const purchasing = purchasingServiceFor(app);
    const supplierB = await purchasing.createSupplier(ctxB, {
      code: 'SUP-B',
      nameAr: 'مورد ب',
      nameEn: 'Supplier B',
      paymentTermsDays: 30,
    });
    await purchasing.createOrder(ctxB, {
      supplierId: supplierB.id,
      warehouseId: mainB1.id,
      lines: [{ itemId: riceB.id, qty: '10', unit: 'kg', unitPrice: '30' }],
    });
    const receiptB = await purchasing.createReceipt(ctxB, {
      supplierId: supplierB.id,
      warehouseId: mainB1.id,
      charges: [],
      lines: [{ itemId: riceB.id, qty: '5', unit: 'kg', unitPrice: '30' }],
    });
    const invoiceB = await purchasing.createInvoice(ctxB, {
      supplierId: supplierB.id,
      supplierInvoiceNo: 'B-INV-1',
      invoiceDate: new Date().toISOString().slice(0, 10),
      total: '136.80',
      lines: [{ receiptLineId: receiptB.lines[0]!.id, qty: '4', unit: 'kg', amount: '120.00', taxAmount: '16.80' }],
    });
    await purchasing.createReturn(ctxB, {
      receiptId: receiptB.id,
      reason: 'Torn sack',
      lines: [{ receiptLineId: receiptB.lines[0]!.id, qty: '500', unit: 'g' }],
    });
    await purchasing.createPayment(ctxB, {
      supplierId: supplierB.id,
      method: 'cash',
      amount: '36.80',
      allocations: [{ invoiceId: invoiceB.id, amount: '36.80' }],
    });

    // Tenant B: one firing to the kitchen through the real sync path (IDOR targets: its station and ticket).
    const fireB = await sync.push(
      deviceCtxB,
      pushBody([
        envelopeFor(deviceCtxB, 2, 'kitchen.fired', {
          fireId: uuidv7(),
          orderId: uuidv7(),
          label: 'T9',
          channel: 'dine_in',
          tableId: null,
          employeeId: uuidv7(),
          firedAt: new Date().toISOString(),
          items: [
            {
              orderItemId: uuidv7(),
              variantId: variantB.id,
              nameAr: 'كشري',
              nameEn: 'Koshary',
              qty: '2',
              modifiers: [],
            },
          ],
        }),
      ]),
    );
    if (fireB.results[0]?.status !== 'accepted')
      throw new Error(`Fixture kitchen firing not accepted: ${JSON.stringify(fireB.results)}`);
    await owner.kitchenStation.create({
      data: {
        tenantId: b.tenantId,
        branchId: b.branchId,
        code: 'HOT',
        nameAr: 'الساخن',
        nameEn: 'Hot line',
        routes: { create: [{ tenantId: b.tenantId, branchId: b.branchId, categoryId: categoryB.id }] },
      },
    });

    // Tenant B: an open bank statement with one unmatched line (IDOR target).
    const postingB = new PostingService();
    const bank = new BankService(app, new AuditService(), postingB);
    const bankAccountB = await owner.account.findFirstOrThrow({ where: { tenantId: b.tenantId, code: '1150' } });
    const today = new Date().toISOString().slice(0, 10);
    await bank.create(ctxB, {
      accountId: bankAccountB.id,
      reference: 'FX-1',
      startDate: today,
      endDate: today,
      openingBalance: '0.00',
      closingBalance: '100.00',
      lines: [{ date: today, description: 'Fixture deposit', amount: '100.00' }],
    });

    // Tenant A: a modifier group on the fixture product and a floor plan (one area, one table).
    const sizes = await owner.modifierGroup.create({
      data: {
        tenantId: a.tenantId,
        nameAr: 'الحجم',
        nameEn: 'Size',
        minSelect: 0,
        maxSelect: 1,
        modifiers: { create: [{ tenantId: a.tenantId, nameAr: 'كبير', nameEn: 'Large', priceDelta: '5.00' }] },
      },
    });
    await owner.productModifierGroup.create({
      data: { tenantId: a.tenantId, productId: product.id, groupId: sizes.id },
    });
    const hall = await owner.serviceArea.create({
      data: { tenantId: a.tenantId, branchId: a.branchId, nameAr: 'الصالة', nameEn: 'Main hall' },
    });
    await owner.diningTable.create({
      data: { tenantId: a.tenantId, branchId: a.branchId, serviceAreaId: hall.id, label: 'T1' },
    });
    // A tenant-B table: IDOR target for table edits. Stopped, so B's tills (dine-in suite) do not show it.
    const hallB = await owner.serviceArea.create({
      data: { tenantId: b.tenantId, branchId: b.branchId, nameAr: 'الصالة', nameEn: 'Main hall' },
    });
    await owner.diningTable.create({
      data: { tenantId: b.tenantId, branchId: b.branchId, serviceAreaId: hallB.id, label: 'B1', isActive: false },
    });

    // POS staff with PINs (A: cashier + manager; B: one cashier, an IDOR target).
    const pinHash = await hashPin(TEST_PIN, 1000);
    const employee = (tenantId: string, branchId: string, employeeNo: string, roleId: string) =>
      owner.employee.create({
        data: {
          tenantId,
          employeeNo,
          fullNameAr: `موظف ${employeeNo}`,
          fullNameEn: `Employee ${employeeNo}`,
          roleId,
          posPinHash: pinHash,
          branches: { create: [{ tenantId, branchId }] },
        },
      });
    const cashierA = await employee(a.tenantId, a.branchId, 'C1', roleA('cashier'));
    const managerEmpA = await employee(a.tenantId, a.branchId, 'M1', roleA('manager'));
    await employee(b.tenantId, b.branchId, 'C1', rolesB.find((r) => r.templateKey === 'cashier')!.id);

    // Tenant A: a POS day through the real sync path — open session, pay-out, refund of the fixture sale, close.
    const now = new Date().toISOString();
    const sessionId = uuidv7();
    const invoiceA = await owner.invoice.findFirstOrThrow({
      where: { tenantId: a.tenantId },
      include: { lines: true },
    });
    const lineA = invoiceA.lines[0]!;
    const refundAmounts = refundLineAmounts(
      {
        qty: lineA.qty.toString(),
        netAmount: lineA.netAmount.toFixed(2),
        taxes: lineA.taxes as { taxRateId: string; amount: string }[],
      },
      { qty: '0', netAmount: '0', taxes: [] },
      '1',
      'EGP',
    );
    const approval = (action: string) => ({
      id: uuidv7(),
      action,
      approverEmployeeId: managerEmpA.id,
      occurredAt: now,
    });
    const envelope = (seq: number, type: string, payload: object) => ({
      operation_id: uuidv7(),
      tenant_id: a.tenantId,
      branch_id: a.branchId,
      device_id: device.id,
      operation_type: type,
      schema_version: 1,
      occurred_at: now,
      local_seq: seq,
      depends_on: [],
      refs: {},
      payload,
    });
    const refundId = uuidv7();
    const day = await sync.push(
      deviceCtx,
      pushBody([
        envelope(2, 'cash_session.opened', {
          id: sessionId,
          employeeId: cashierA.id,
          openedAt: now,
          openingFloat: '500.00',
        }),
        envelope(3, 'cash_movement.recorded', {
          id: uuidv7(),
          cashSessionId: sessionId,
          kind: 'pay_out',
          amount: '50.00',
          reason: 'Bank deposit',
          employeeId: cashierA.id,
          approval: approval('pos.cash_movement'),
          occurredAt: now,
        }),
        envelope(4, 'refund.issued', {
          id: refundId,
          number: 'A1-P1-R00001',
          invoiceId: invoiceA.id,
          issuedAt: now,
          reason: 'Customer complaint',
          employeeId: cashierA.id,
          cashSessionId: sessionId,
          approval: approval('sales.refund'),
          lines: [{ id: childId(refundId, 'line:1'), invoiceLineId: lineA.id, qty: '1', ...refundAmounts }],
          payment: { id: childId(refundId, 'payment'), paymentMethodId: cash.id, amount: refundAmounts.grossAmount },
        }),
        envelope(5, 'cash_session.closed', {
          id: sessionId,
          employeeId: cashierA.id,
          closedAt: now,
          countedCash: '420.00',
          expectedCash: '432.00',
          countedBreakdown: {},
        }),
      ] as never),
    );
    if (day.results.some((r) => r.status !== 'accepted'))
      throw new Error(`Fixture POS day not accepted: ${JSON.stringify(day.results)}`);

    if (ROLE_TEMPLATES.length !== rolesA.length) throw new Error('Onboarding did not create every role template');
  } finally {
    await app.$disconnect();
    await owner.$disconnect();
  }
}

/** Ids of fixture records, looked up with the owner connection. */
export async function loadFixtures() {
  const owner = ownerClient();
  try {
    const tenant = (slug: string) => owner.tenant.findUniqueOrThrow({ where: { slug } });
    const [a, b, c] = await Promise.all([tenant('tenant-a'), tenant('tenant-b'), tenant('tenant-c')]);
    const branch = (tenantId: string, code: string) => owner.branch.findFirstOrThrow({ where: { tenantId, code } });
    const membership = (tenantId: string, email: string) =>
      owner.membership.findFirstOrThrow({ where: { tenantId, user: { email } } });
    return {
      tenantA: a,
      tenantB: b,
      tenantC: c,
      branchA1: await branch(a.id, 'A1'),
      branchA2: await branch(a.id, 'A2'),
      branchB1: await branch(b.id, 'B1'),
      roleOwnerB: await owner.role.findFirstOrThrow({ where: { tenantId: b.id, templateKey: 'owner' } }),
      roleCashierA: await owner.role.findFirstOrThrow({ where: { tenantId: a.id, templateKey: 'cashier' } }),
      membershipOwnerB: await membership(b.id, EMAILS.ownerB),
      membershipManagerA: await membership(a.id, EMAILS.managerA),
      membershipNopermA: await membership(a.id, EMAILS.nopermA),
      categoryB: await owner.category.findFirstOrThrow({ where: { tenantId: b.id } }),
      tableB: await owner.diningTable.findFirstOrThrow({ where: { tenantId: b.id } }),
      productB: await owner.product.findFirstOrThrow({ where: { tenantId: b.id } }),
      variantB: await owner.productVariant.findFirstOrThrow({ where: { tenantId: b.id } }),
      deviceB: await owner.device.findFirstOrThrow({ where: { tenantId: b.id } }),
      invoiceB: await owner.invoice.findFirstOrThrow({ where: { tenantId: b.id } }),
      employeeB: await owner.employee.findFirstOrThrow({ where: { tenantId: b.id } }),
      countB: await owner.stockCount.findFirstOrThrow({ where: { tenantId: b.id } }),
      transferB: await owner.stockTransfer.findFirstOrThrow({ where: { tenantId: b.id } }),
      itemB: await owner.inventoryItem.findFirstOrThrow({ where: { tenantId: b.id } }),
      supplierB: await owner.supplier.findFirstOrThrow({ where: { tenantId: b.id } }),
      orderB: await owner.purchaseOrder.findFirstOrThrow({ where: { tenantId: b.id } }),
      receiptB: await owner.goodsReceipt.findFirstOrThrow({ where: { tenantId: b.id } }),
      supplierInvoiceB: await owner.supplierInvoice.findFirstOrThrow({ where: { tenantId: b.id } }),
      journalB: await owner.journalEntry.findFirstOrThrow({ where: { tenantId: b.id } }),
      periodB: await owner.accountingPeriod.findFirstOrThrow({ where: { tenantId: b.id } }),
      fiscalYearB: await owner.fiscalYear.findFirstOrThrow({ where: { tenantId: b.id } }),
      kitchenTicketB: await owner.kitchenTicket.findFirstOrThrow({ where: { tenantId: b.id } }),
      kitchenStationB: await owner.kitchenStation.findFirstOrThrow({ where: { tenantId: b.id } }),
      bankStatementB: await owner.bankStatement.findFirstOrThrow({
        where: { tenantId: b.id },
        include: { lines: true },
      }),
    };
  } finally {
    await owner.$disconnect();
  }
}
