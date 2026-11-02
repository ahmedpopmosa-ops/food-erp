import { PrismaService } from '../src/prisma/prisma.service';
import { loadFixtures, ownerClient } from './fixtures';

/** Database-layer isolation, tested directly against PostgreSQL with the restricted application role. */
describe('row-level security', () => {
  const owner = ownerClient();
  const app = new PrismaService();
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  let tenantTables: string[];

  beforeAll(async () => {
    fx = await loadFixtures();
    const rows = await owner.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
        AND table_name NOT IN ('platform_audit_logs')
      ORDER BY table_name`;
    tenantTables = rows.map((r) => r.table_name);
  });
  afterAll(async () => {
    await app.$disconnect();
    await owner.$disconnect();
  });

  it('connects as a role that cannot bypass RLS', async () => {
    const [role] = await app.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; current_user: string }[]>`
      SELECT r.rolsuper, r.rolbypassrls, current_user FROM pg_roles r WHERE r.rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, current_user: 'ros_app' });
  });

  it('enables and forces RLS with a policy on every table that has tenant_id', async () => {
    expect(tenantTables.length).toBeGreaterThanOrEqual(9);
    const rows = await owner.$queryRaw<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policies: bigint }[]
    >`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
             (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${[...tenantTables, 'tenants']})`;
    for (const t of [...tenantTables, 'tenants']) {
      const row = rows.find((r) => r.relname === t);
      expect({
        table: t,
        rls: row?.relrowsecurity,
        forced: row?.relforcerowsecurity,
        policy: Number(row?.policies) > 0,
      }).toEqual({
        table: t,
        rls: true,
        forced: true,
        policy: true,
      });
    }
  });

  it('sees zero rows in every tenant table when no tenant is set (while the owner sees data)', async () => {
    for (const t of tenantTables) {
      const [visible] = await app.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
      const [all] = await owner.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
      expect({ table: t, visible: Number(visible.n) }).toEqual({ table: t, visible: 0 });
      expect({ table: t, hasData: Number(all.n) > 0 }).toEqual({ table: t, hasData: true });
    }
    const [tenants] = await app.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM tenants`;
    expect(Number(tenants.n)).toBe(0);
  });

  it('shows only the active tenant’s rows inside withTenant', async () => {
    const codes = await app.withTenant(fx.tenantA.id, (tx) =>
      tx.branch.findMany({ select: { code: true, tenantId: true } }),
    );
    expect(codes.map((b) => b.code).sort()).toEqual(['A1', 'A2']);
    expect(new Set(codes.map((b) => b.tenantId))).toEqual(new Set([fx.tenantA.id]));
    const leak = await app.withTenant(fx.tenantA.id, (tx) => tx.branch.findFirst({ where: { id: fx.branchB1.id } }));
    expect(leak).toBeNull();
  });

  it('does not leak tenant context across a reused pooled connection', async () => {
    const pooled = new PrismaService({ datasourceUrl: `${process.env.DATABASE_URL}&connection_limit=1` });
    try {
      for (let round = 0; round < 3; round++) {
        const a = await pooled.withTenant(fx.tenantA.id, (tx) => tx.branch.count());
        const none = await pooled.branch.count();
        const b = await pooled.withTenant(fx.tenantB.id, (tx) => tx.branch.count());
        const [setting] = await pooled.$queryRaw<
          { v: string | null }[]
        >`SELECT current_setting('app.tenant_id', true) AS v`;
        expect({ a, none, b, setting: setting.v || null }).toEqual({
          a: 2,
          none: 0,
          b: expect.any(Number),
          setting: null,
        });
        expect(b).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await pooled.$disconnect();
    }
  });

  it('rejects writing a row for another tenant (WITH CHECK)', async () => {
    await expect(
      app.withTenant(fx.tenantA.id, (tx) =>
        tx.role.create({ data: { tenantId: fx.tenantB.id, name: 'Smuggled role' } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('rejects cross-tenant references even for the owner role (composite foreign keys)', async () => {
    await expect(
      owner.membershipBranch.create({
        data: { tenantId: fx.tenantA.id, membershipId: fx.membershipManagerA.id, branchId: fx.branchB1.id },
      }),
    ).rejects.toThrow(/foreign key/i);
  });

  it('refuses any change to fully immutable rows, even for the owner role', async () => {
    // Regression: triggers declared without arguments used to let every UPDATE through.
    for (const sql of [
      `UPDATE invoice_taxes SET tax_amount = tax_amount + 1`,
      `UPDATE refund_lines SET qty = qty + 1`,
      `UPDATE approvals SET action = 'tampered'`,
      `UPDATE recipe_lines SET qty = qty + 1`,
      `UPDATE stock_adjustment_lines SET qty = qty + 1`,
    ]) {
      await expect(owner.$executeRawUnsafe(sql)).rejects.toThrow(/immutable/);
    }
  });

  it('keeps the audit log append-only for the application role', async () => {
    const run = (sql: string) => app.withTenant(fx.tenantA.id, (tx) => tx.$executeRawUnsafe(sql));
    await expect(run(`UPDATE audit_logs SET action = 'tampered'`)).rejects.toThrow(/permission denied/i);
    await expect(run(`DELETE FROM audit_logs`)).rejects.toThrow(/permission denied/i);
    await expect(app.$executeRawUnsafe(`DELETE FROM platform_audit_logs`)).rejects.toThrow(/permission denied/i);
  });

  it('hides operator tables outside the platform context and blocks permission catalog writes', async () => {
    const users = await app.withTenant(fx.tenantA.id, (tx) => tx.platformUser.count());
    expect(users).toBe(0);
    await expect(
      app.$executeRawUnsafe(`INSERT INTO permissions (key, module, is_sensitive) VALUES ('evil.grant', 'x', false)`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets tenants read but never write their subscription', async () => {
    const subs = await app.withTenant(fx.tenantA.id, (tx) => tx.subscription.findMany());
    expect(subs).toHaveLength(1);
    const changed = await app.withTenant(fx.tenantA.id, (tx) =>
      tx.subscription.updateMany({ data: { status: 'active' } }),
    );
    expect(changed.count).toBe(0);
  });

  it('cannot read another tenant even with the user context of a member of both', async () => {
    const multi = await owner.user.findUniqueOrThrow({ where: { email: 'multi@test.local' } });
    const visible = await app.withUser(multi.id, (tx) => tx.tenant.findMany({ select: { slug: true } }));
    expect(visible.map((t) => t.slug).sort()).toEqual(['tenant-a', 'tenant-b']);
    const branches = await app.withUser(multi.id, (tx) => tx.branch.count());
    expect(branches).toBe(0);
  });
});
