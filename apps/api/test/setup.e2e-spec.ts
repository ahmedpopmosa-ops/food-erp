import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { call, createApp, login, type Session } from './helpers';
import { EMAILS, loadFixtures, ownerClient } from './fixtures';
import { LogMailer } from '../src/common/mailer';

describe('setup and identity management', () => {
  let app: INestApplication;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  let ownerB: Session;
  const owner = ownerClient();

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
    ownerB = await login(app, EMAILS.ownerB);
  });
  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  describe('branches', () => {
    it('creates a branch with its main warehouse and an audit entry in the same transaction', async () => {
      const res = await call(ownerB, 'POST', '/api/v1/branches')
        .send({ code: 'b2', nameAr: 'فرع ٢', nameEn: 'Branch 2' })
        .expect(201);
      expect(res.body).toMatchObject({
        code: 'B2',
        currencyCode: 'EGP',
        timezone: 'Africa/Cairo',
        status: 'active',
        rowVersion: 1,
      });
      const detail = await ownerB.agent.get(`/api/v1/branches/${res.body.id}`).expect(200);
      expect(detail.body.warehouses.map((w: { code: string; kind: string }) => [w.code, w.kind])).toEqual([
        ['B2-MAIN', 'main'],
      ]);
      const audit = await ownerB.agent.get(`/api/v1/audit-logs?entityType=branch&entityId=${res.body.id}`).expect(200);
      expect(audit.body.items.map((e: { action: string }) => e.action)).toEqual(['branch.created']);
    });

    it('rejects duplicate codes', async () => {
      const res = await call(ownerB, 'POST', '/api/v1/branches')
        .send({ code: 'B1', nameAr: 'x', nameEn: 'x' })
        .expect(409);
      expect(res.body.code).toBe('branches.duplicateCode');
    });

    it('validates input with field-level details', async () => {
      const res = await call(ownerB, 'POST', '/api/v1/branches')
        .send({ code: 'B-9', nameAr: '', nameEn: 'x', timezone: 'Mars/Base' })
        .expect(400);
      expect(res.body.code).toBe('validation');
      expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(['code', 'nameAr', 'timezone']);
    });

    it('uses optimistic locking on update and audits the diff', async () => {
      const ok = await call(ownerB, 'PATCH', `/api/v1/branches/${fx.branchB1.id}`)
        .send({ nameEn: 'Downtown', rowVersion: 1 })
        .expect(200);
      expect(ok.body).toMatchObject({ nameEn: 'Downtown', rowVersion: 2 });
      const stale = await call(ownerB, 'PATCH', `/api/v1/branches/${fx.branchB1.id}`)
        .send({ nameEn: 'Old view', rowVersion: 1 })
        .expect(409);
      expect(stale.body.code).toBe('conflict.stale');
      const audit = await ownerB.agent
        .get(`/api/v1/audit-logs?entityType=branch&entityId=${fx.branchB1.id}&action=branch.updated`)
        .expect(200);
      expect(audit.body.items[0].changes).toEqual({ nameEn: { from: 'Branch B1', to: 'Downtown' } });
    });

    it('enforces the plan branch limit', async () => {
      const ownerA = await login(app, EMAILS.ownerA);
      const res = await call(ownerA, 'POST', '/api/v1/branches')
        .send({ code: 'A3', nameAr: 'x', nameEn: 'x' })
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'entitlements.limitReached',
        details: { key: 'limit.branches', limit: 2, current: 2 },
      });
    });

    it('refuses a currency that differs from the tenant base currency at the database level', async () => {
      await expect(
        owner.branch.create({
          data: {
            tenantId: fx.tenantB.id,
            code: 'USD1',
            nameAr: 'x',
            nameEn: 'x',
            timezone: 'Africa/Cairo',
            currencyCode: 'USD',
          },
        }),
      ).rejects.toThrow(/base currency/);
    });
  });

  describe('settings', () => {
    it('reads defaults and updates with optimistic locking', async () => {
      const current = await ownerB.agent.get('/api/v1/settings').expect(200);
      expect(current.body).toMatchObject({
        priceIncludesTax: true,
        allowNegativeStock: true,
        valuationMethod: 'weighted_average',
        businessDayCutoff: '04:00',
      });
      const updated = await call(ownerB, 'PATCH', '/api/v1/settings')
        .send({ businessDayCutoff: '05:00', rowVersion: current.body.rowVersion })
        .expect(200);
      expect(updated.body.businessDayCutoff).toBe('05:00');
      await call(ownerB, 'PATCH', '/api/v1/settings')
        .send({ leaseDays: 3, rowVersion: current.body.rowVersion })
        .expect(409);
    });

    it('does not accept the valuation method (changing it needs a revaluation procedure)', async () => {
      const current = await ownerB.agent.get('/api/v1/settings').expect(200);
      const res = await call(ownerB, 'PATCH', '/api/v1/settings')
        .send({ valuationMethod: 'fifo', rowVersion: current.body.rowVersion })
        .expect(200);
      expect(res.body.valuationMethod).toBe('weighted_average');
    });
  });

  describe('roles', () => {
    it('creates, updates and deletes a custom role; system roles stay', async () => {
      const created = await call(ownerB, 'POST', '/api/v1/roles')
        .send({ name: 'Shift leads', permissions: ['pos.sell', 'pos.void_item'] })
        .expect(201);
      const dup = await call(ownerB, 'POST', '/api/v1/roles')
        .send({ name: 'shift LEADS', permissions: [] })
        .expect(409);
      expect(dup.body.code).toBe('roles.duplicateName');
      const updated = await call(ownerB, 'PATCH', `/api/v1/roles/${created.body.id}`)
        .send({ permissions: ['pos.sell'], rowVersion: 1 })
        .expect(200);
      expect(updated.body).toMatchObject({ permissions: ['pos.sell'], rowVersion: 2 });
      await call(ownerB, 'DELETE', `/api/v1/roles/${created.body.id}`).expect(200);
      const cashier = await owner.role.findFirstOrThrow({ where: { tenantId: fx.tenantB.id, templateKey: 'cashier' } });
      const sys = await call(ownerB, 'DELETE', `/api/v1/roles/${cashier.id}`).expect(403);
      expect(sys.body.code).toBe('roles.systemRole');
    });

    it('rejects unknown permission keys', async () => {
      const res = await call(ownerB, 'POST', '/api/v1/roles')
        .send({ name: 'Bad', permissions: ['everything.all'] })
        .expect(400);
      expect(res.body.code).toBe('validation');
    });
  });

  describe('members', () => {
    const tokenFrom = (text: string) => decodeURIComponent(/token=([^\s]+)/.exec(text)![1]);

    it('invites a new person, who sets a password through the link and can sign in', async () => {
      const cashier = await owner.role.findFirstOrThrow({ where: { tenantId: fx.tenantB.id, templateKey: 'cashier' } });
      const email = 'new-cashier@test.local';
      const res = await call(ownerB, 'POST', '/api/v1/members')
        .send({ email, fullName: 'New Cashier', roleId: cashier.id, allBranches: false, branchIds: [fx.branchB1.id] })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'invited', allBranches: false, branchIds: [fx.branchB1.id] });

      const again = await call(ownerB, 'POST', '/api/v1/members')
        .send({ email, fullName: 'New Cashier', roleId: cashier.id, allBranches: true })
        .expect(409);
      expect(again.body.code).toBe('members.alreadyMember');

      const mail = app.get(LogMailer).lastTo(email)!;
      expect(mail.kind).toBe('invite');
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: tokenFrom(mail.text), password: 'Cashier-Password-77' })
        .expect(200);
      const cashierSession = await login(app, email, 'Cashier-Password-77');
      const me = await cashierSession.agent.get('/api/v1/auth/me').expect(200);
      expect(me.body.tenant.id).toBe(fx.tenantB.id);
      expect(me.body.branchIds).toEqual([fx.branchB1.id]);
    });

    it('rejects branches from another tenant', async () => {
      const cashier = await owner.role.findFirstOrThrow({ where: { tenantId: fx.tenantB.id, templateKey: 'cashier' } });
      const res = await call(ownerB, 'POST', '/api/v1/members')
        .send({
          email: 'other@test.local',
          fullName: 'Other',
          roleId: cashier.id,
          allBranches: false,
          branchIds: [fx.branchA1.id],
        })
        .expect(400);
      expect(res.body.code).toBe('members.unknownBranch');
    });

    it('disabling a member takes effect on their next request', async () => {
      const multi = await login(app, EMAILS.multi);
      await multi.agent
        .post('/api/v1/auth/switch-tenant')
        .set('x-csrf-token', multi.csrf)
        .send({ tenantId: fx.tenantB.id })
        .expect(200);
      const membership = await owner.membership.findFirstOrThrow({
        where: { tenantId: fx.tenantB.id, user: { email: EMAILS.multi } },
      });
      await call(ownerB, 'PATCH', `/api/v1/members/${membership.id}`).send({ status: 'disabled' }).expect(200);
      const me = await multi.agent.get('/api/v1/auth/me').expect(200);
      expect(me.body.tenant).toBeNull();
      await multi.agent.get('/api/v1/branches').expect(403);
      await call(ownerB, 'PATCH', `/api/v1/members/${membership.id}`).send({ status: 'active' }).expect(200);
    });
  });
});
