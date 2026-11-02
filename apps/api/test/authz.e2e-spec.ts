import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { call, createApp, listRoutes, login, loginOperator, type RouteInfo, type Session } from './helpers';
import { EMAILS, loadFixtures } from './fixtures';

const RANDOM_ID = '0192f0c4-7b1e-7c3a-8a4e-1f2d3c4b5a69';

describe('authorization', () => {
  let app: INestApplication;
  let routes: RouteInfo[];
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  let ownerA: Session;
  let nopermA: Session;
  let managerA: Session;

  beforeAll(async () => {
    app = await createApp();
    routes = listRoutes(app);
    fx = await loadFixtures();
    ownerA = await login(app, EMAILS.ownerA);
    nopermA = await login(app, EMAILS.nopermA);
    managerA = await login(app, EMAILS.managerA);
  });
  afterAll(() => app.close());

  const tenantRoutes = () => routes.filter((r) => r.access.kind === 'permissions');
  const fill = (path: string, id: string) => path.replace(/:[A-Za-z]+/g, id);

  it('classifies every route with exactly one access rule', () => {
    expect(routes.length).toBeGreaterThan(20);
    const unclassified = routes.filter((r) => r.access.kind === 'unclassified').map((r) => `${r.method} ${r.path}`);
    expect(unclassified).toEqual([]);
    const publicRoutes = routes
      .filter((r) => r.access.kind === 'public')
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(publicRoutes).toEqual(
      [
        'GET /api/health/live',
        'GET /api/health/ready',
        'POST /api/v1/auth/login',
        'POST /api/v1/auth/password-reset/confirm',
        'POST /api/v1/auth/password-reset/request',
        'POST /api/v1/platform/auth/login',
        'POST /api/v1/devices/pair',
        'POST /api/v1/devices/token',
      ].sort(),
    );
  });

  it('rejects every permission-guarded route for a member without permissions (403)', async () => {
    for (const r of tenantRoutes()) {
      const res = await call(nopermA, r.method, fill(r.path, RANDOM_ID)).send({});
      expect({ route: `${r.method} ${r.path}`, status: res.status, code: res.body.code }).toEqual({
        route: `${r.method} ${r.path}`,
        status: 403,
        code: 'auth.forbidden',
      });
    }
  });

  it('rejects every non-public route without a session (401)', async () => {
    const server = app.getHttpServer();
    for (const r of routes.filter((x) => x.access.kind !== 'public')) {
      const m = r.method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
      const res = await request(server)[m](fill(r.path, RANDOM_ID)).send({});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({
        route: `${r.method} ${r.path}`,
        status: 401,
      });
    }
  });

  /**
   * IDOR suite: tenant A's owner (all permissions) addresses tenant B's records by id. Every tenant route
   * with a path parameter must be listed here — a new route without an entry fails the test.
   */
  it('returns 404 for every tenant route addressed with another tenant’s id', async () => {
    const cases: Record<string, { id: () => string; body?: () => object }> = {
      'GET /api/v1/branches/:id': { id: () => fx.branchB1.id },
      'PATCH /api/v1/branches/:id': { id: () => fx.branchB1.id, body: () => ({ nameEn: 'Hijacked', rowVersion: 1 }) },
      'GET /api/v1/roles/:id': { id: () => fx.roleOwnerB.id },
      'PATCH /api/v1/roles/:id': { id: () => fx.roleOwnerB.id, body: () => ({ name: 'Hijacked', rowVersion: 1 }) },
      'DELETE /api/v1/roles/:id': { id: () => fx.roleOwnerB.id },
      'PATCH /api/v1/members/:id': { id: () => fx.membershipOwnerB.id, body: () => ({ status: 'disabled' }) },
      'PATCH /api/v1/tables/:id': { id: () => fx.tableB.id, body: () => ({ isActive: false }) },
      'PATCH /api/v1/catalog/categories/:id': {
        id: () => fx.categoryB.id,
        body: () => ({ nameEn: 'Hijacked', rowVersion: 1 }),
      },
      'PATCH /api/v1/catalog/products/:id': {
        id: () => fx.productB.id,
        body: () => ({ nameEn: 'Hijacked', rowVersion: 1 }),
      },
      'POST /api/v1/catalog/variants/:id/prices': { id: () => fx.variantB.id, body: () => ({ price: '1.00' }) },
      'POST /api/v1/devices/:id/pairing-code': { id: () => fx.deviceB.id },
      'POST /api/v1/devices/:id/disable': { id: () => fx.deviceB.id },
      'GET /api/v1/sales/invoices/:id': { id: () => fx.invoiceB.id },
      'PUT /api/v1/catalog/products/:id/modifier-groups': { id: () => fx.productB.id, body: () => ({ groupIds: [] }) },
      'GET /api/v1/branches/:id/tables': { id: () => fx.branchB1.id },
      'POST /api/v1/branches/:id/tables': { id: () => fx.branchB1.id, body: () => ({ label: 'X1' }) },
      'PATCH /api/v1/employees/:id': {
        id: () => fx.employeeB.id,
        body: () => ({ fullNameEn: 'Hijacked', rowVersion: 1 }),
      },
      'POST /api/v1/employees/:id/pin': { id: () => fx.employeeB.id, body: () => ({ pin: '1111' }) },
      'GET /api/v1/inventory/counts/:id': { id: () => fx.countB.id },
      'PUT /api/v1/inventory/counts/:id/lines': {
        id: () => fx.countB.id,
        body: () => ({ lines: [{ itemId: fx.itemB.id, countedQty: '1', unit: 'g' }] }),
      },
      'POST /api/v1/inventory/counts/:id/approve': { id: () => fx.countB.id },
      'GET /api/v1/inventory/transfers/:id': { id: () => fx.transferB.id },
      'POST /api/v1/inventory/transfers/:id/dispatch': { id: () => fx.transferB.id },
      'POST /api/v1/inventory/transfers/:id/receive': {
        id: () => fx.transferB.id,
        body: () => ({ lines: [{ itemId: fx.itemB.id, qtyReceived: '1', unit: 'g' }] }),
      },
      'GET /api/v1/purchasing/suppliers/:id/statement': { id: () => fx.supplierB.id },
      'GET /api/v1/purchasing/orders/:id': { id: () => fx.orderB.id },
      'POST /api/v1/purchasing/orders/:id/approve': { id: () => fx.orderB.id },
      'POST /api/v1/purchasing/orders/:id/cancel': { id: () => fx.orderB.id },
      'GET /api/v1/purchasing/receipts/:id': { id: () => fx.receiptB.id },
      'GET /api/v1/purchasing/invoices/:id': { id: () => fx.supplierInvoiceB.id },
      'GET /api/v1/accounting/journal-entries/:id': { id: () => fx.journalB.id },
      'POST /api/v1/accounting/journal-entries/:id/reverse': { id: () => fx.journalB.id, body: () => ({}) },
      'POST /api/v1/accounting/fiscal-years/:id/close': { id: () => fx.fiscalYearB.id },
      'GET /api/v1/accounting/periods/:id/checklist': { id: () => fx.periodB.id },
      'POST /api/v1/accounting/periods/:id/soft-close': { id: () => fx.periodB.id },
      'POST /api/v1/accounting/periods/:id/close': { id: () => fx.periodB.id },
      'GET /api/v1/kitchen/tickets/:id': { id: () => fx.kitchenTicketB.id },
      'POST /api/v1/kitchen/tickets/:id/status': {
        id: () => fx.kitchenTicketB.id,
        body: () => ({ from: 'new', to: 'preparing' }),
      },
      'PATCH /api/v1/kitchen/stations/:id': { id: () => fx.kitchenStationB.id, body: () => ({ nameEn: 'Hijacked' }) },
      'GET /api/v1/accounting/bank-statements/:id': { id: () => fx.bankStatementB.id },
      'POST /api/v1/accounting/bank-statements/:id/auto-match': { id: () => fx.bankStatementB.id },
      'POST /api/v1/accounting/bank-statements/:id/match': {
        id: () => fx.bankStatementB.id,
        body: () => ({ lineId: fx.bankStatementB.lines[0]!.id, journalLineId: fx.bankStatementB.lines[0]!.id }),
      },
      'POST /api/v1/accounting/bank-statements/:id/unmatch': {
        id: () => fx.bankStatementB.id,
        body: () => ({ lineId: fx.bankStatementB.lines[0]!.id }),
      },
      'POST /api/v1/accounting/bank-statements/:id/post-line': {
        id: () => fx.bankStatementB.id,
        body: () => ({ lineId: fx.bankStatementB.lines[0]!.id, accountId: fx.bankStatementB.accountId }),
      },
      'POST /api/v1/accounting/bank-statements/:id/complete': { id: () => fx.bankStatementB.id },
      'POST /api/v1/accounting/periods/:id/reopen': {
        id: () => fx.periodB.id,
        body: () => ({ reason: 'Probe from another tenant' }),
      },
    };
    const parameterised = tenantRoutes().filter((r) => r.path.includes(':'));
    const missing = parameterised.map((r) => `${r.method} ${r.path}`).filter((k) => !cases[k]);
    expect(missing).toEqual([]);

    for (const r of parameterised) {
      const c = cases[`${r.method} ${r.path}`];
      const res = await call(ownerA, r.method, fill(r.path, c.id())).send(c.body?.() ?? {});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({
        route: `${r.method} ${r.path}`,
        status: 404,
      });
    }
  });

  it('never lists another tenant’s records', async () => {
    const branches = await ownerA.agent.get('/api/v1/branches').expect(200);
    expect(branches.body.map((b: { tenantId: string }) => b.tenantId)).toEqual([fx.tenantA.id, fx.tenantA.id]);
    const members = await ownerA.agent.get('/api/v1/members').expect(200);
    expect(members.body.items.map((m: { user: { email: string } }) => m.user.email)).not.toContain(EMAILS.ownerB);
    const audit = await ownerA.agent.get('/api/v1/audit-logs').expect(200);
    expect(audit.body.items.every((e: { tenantId: string }) => e.tenantId === fx.tenantA.id)).toBe(true);
  });

  describe('branch scope', () => {
    it('lists only assigned branches and hides the others', async () => {
      const list = await managerA.agent.get('/api/v1/branches').expect(200);
      expect(list.body.map((b: { code: string }) => b.code)).toEqual(['A1']);
      await managerA.agent.get(`/api/v1/branches/${fx.branchA1.id}`).expect(200);
      await managerA.agent.get(`/api/v1/branches/${fx.branchA2.id}`).expect(404);
    });

    it('cannot grant access beyond its own scope', async () => {
      // Manager template has users.view but not users.manage: blocked at the permission layer first.
      const res = await call(managerA, 'POST', '/api/v1/members').send({
        email: 'x@test.local',
        fullName: 'X',
        roleId: fx.roleCashierA.id,
        allBranches: true,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('privilege escalation', () => {
    it('a role manager cannot create a role with permissions it does not hold', async () => {
      const rolemgr = await login(app, EMAILS.rolemgrB);
      const res = await call(rolemgr, 'POST', '/api/v1/roles')
        .send({ name: 'Payroll peekers', permissions: ['payroll.view'] })
        .expect(403);
      expect(res.body.code).toBe('roles.escalation');
      await call(rolemgr, 'POST', '/api/v1/roles')
        .send({ name: 'Viewers', permissions: ['roles.view'] })
        .expect(201);
    });

    it('a role manager cannot assign the owner role or edit the owner', async () => {
      const rolemgr = await login(app, EMAILS.rolemgrB);
      const invite = await call(rolemgr, 'POST', '/api/v1/members')
        .send({ email: 'sneaky@test.local', fullName: 'Sneaky', roleId: fx.roleOwnerB.id, allBranches: true })
        .expect(403);
      expect(invite.body.code).toBe('members.ownerProtected');
      const edit = await call(rolemgr, 'PATCH', `/api/v1/members/${fx.membershipOwnerB.id}`)
        .send({ status: 'disabled' })
        .expect(403);
      expect(edit.body.code).toBe('members.ownerProtected');
    });

    it('the owner role itself cannot be modified', async () => {
      const ownerB = await login(app, EMAILS.ownerB);
      const res = await call(ownerB, 'PATCH', `/api/v1/roles/${fx.roleOwnerB.id}`)
        .send({ permissions: [], rowVersion: 1 })
        .expect(403);
      expect(res.body.code).toBe('roles.ownerImmutable');
    });

    it('members cannot change their own access', async () => {
      const ownerB = await login(app, EMAILS.ownerB);
      const res = await call(ownerB, 'PATCH', `/api/v1/members/${fx.membershipOwnerB.id}`)
        .send({ status: 'disabled' })
        .expect(403);
      expect(res.body.code).toBe('members.cannotEditSelf');
    });
  });

  describe('tenant and operator separation', () => {
    it('a tenant session is not accepted on operator routes', async () => {
      for (const r of routes.filter((x) => x.access.kind === 'platform')) {
        const res = await call(ownerA, r.method, fill(r.path, RANDOM_ID)).send({});
        expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({
          route: `${r.method} ${r.path}`,
          status: 401,
        });
      }
    });

    it('an operator session is not accepted on tenant routes', async () => {
      const op = await loginOperator(app, EMAILS.operator);
      for (const r of tenantRoutes()) {
        const res = await call(op, r.method, fill(r.path, RANDOM_ID)).send({});
        expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({
          route: `${r.method} ${r.path}`,
          status: 401,
        });
      }
    });
  });

  describe('suspended tenant', () => {
    it('is read-only', async () => {
      const ownerC = await login(app, EMAILS.ownerC);
      await ownerC.agent.get('/api/v1/branches').expect(200);
      const res = await call(ownerC, 'POST', '/api/v1/roles').send({ name: 'Anything', permissions: [] }).expect(403);
      expect(res.body.code).toBe('tenant.suspended');
    });
  });
});
