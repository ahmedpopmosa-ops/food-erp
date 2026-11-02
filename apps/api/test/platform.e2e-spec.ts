import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { call, createApp, login, loginOperator, type Session } from './helpers';
import { EMAILS, ownerClient } from './fixtures';
import { LogMailer } from '../src/common/mailer';

describe('operator console', () => {
  let app: INestApplication;
  let op: Session;
  const owner = ownerClient();

  beforeAll(async () => {
    app = await createApp();
    op = await loginOperator(app, EMAILS.operator);
  });
  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  const onboardBody = (slug: string) => ({
    legalName: `${slug} LLC`,
    displayName: `Restaurant ${slug}`,
    slug,
    planCode: 'starter',
    owner: { email: `${slug}@owner.test`, fullName: 'New Owner' },
    firstBranch: { code: 'HQ', nameAr: 'الفرع الرئيسي', nameEn: 'Main branch' },
  });

  it('scopes the operator cookie to the platform API path', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .send({ email: EMAILS.operator, password: 'Test-Password-0001' })
      .expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('ros_op_session='))!;
    expect(cookie).toMatch(/Path=\/api\/v1\/platform/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('onboards a tenant end to end: roles, branch, warehouses, trial, invitation, first login', async () => {
    const res = await call(op, 'POST', '/api/v1/platform/tenants').send(onboardBody('fresh-kitchen')).expect(201);
    expect(res.body.invitationSent).toBe(true);

    const tenant = await owner.tenant.findUniqueOrThrow({
      where: { id: res.body.tenantId },
      include: { subscriptions: true, settings: true },
    });
    expect(tenant).toMatchObject({
      baseCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      defaultLocale: 'ar-EG',
      status: 'active',
    });
    expect(tenant.subscriptions[0].status).toBe('trialing');
    expect(tenant.settings).not.toBeNull();
    expect(await owner.role.count({ where: { tenantId: tenant.id, isSystem: true } })).toBe(9);
    const warehouses = await owner.warehouse.findMany({ where: { tenantId: tenant.id }, orderBy: { code: 'asc' } });
    expect(warehouses.map((w) => [w.code, w.kind])).toEqual([
      ['HQ-MAIN', 'main'],
      ['TRANSIT', 'transit'],
    ]);
    const platformAudit = await owner.platformAuditLog.findMany({ where: { tenantId: tenant.id } });
    expect(platformAudit.map((a) => a.action)).toEqual(['tenant.onboarded']);

    const mail = app.get(LogMailer).lastTo('fresh-kitchen@owner.test')!;
    const token = decodeURIComponent(/token=([^\s]+)/.exec(mail.text)![1]);
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'Owner-Password-123' })
      .expect(200);
    const newOwner = await login(app, 'fresh-kitchen@owner.test', 'Owner-Password-123');
    const me = await newOwner.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.tenant.id).toBe(tenant.id);
    expect(me.body.roleTemplate).toBe('owner');
    const branches = await newOwner.agent.get('/api/v1/branches').expect(200);
    expect(branches.body.map((b: { code: string }) => b.code)).toEqual(['HQ']);
  });

  it('rejects duplicate slugs and unknown plans', async () => {
    const dup = await call(op, 'POST', '/api/v1/platform/tenants').send(onboardBody('tenant-a')).expect(409);
    expect(dup.body.code).toBe('tenants.duplicateSlug');
    const plan = await call(op, 'POST', '/api/v1/platform/tenants')
      .send({ ...onboardBody('no-plan'), planCode: 'platinum' })
      .expect(400);
    expect(plan.body.code).toBe('plans.unknown');
  });

  it('lists tenants with their subscription', async () => {
    const res = await op.agent.get('/api/v1/platform/tenants?search=tenant-').expect(200);
    expect(res.body.items.map((t: { slug: string }) => t.slug).sort()).toEqual(['tenant-a', 'tenant-b', 'tenant-c']);
    expect(res.body.items[0].subscription).toHaveProperty('plan');
  });

  it('suspends and reactivates a tenant, enforcing the state machine and recording the reason', async () => {
    const created = await call(op, 'POST', '/api/v1/platform/tenants').send(onboardBody('to-suspend')).expect(201);
    const id = created.body.tenantId;
    await call(op, 'POST', `/api/v1/platform/tenants/${id}/suspend`)
      .send({ reason: 'Payment overdue 30 days' })
      .expect(200);
    const again = await call(op, 'POST', `/api/v1/platform/tenants/${id}/suspend`)
      .send({ reason: 'Payment overdue 30 days' })
      .expect(400);
    expect(again.body.code).toBe('invalid_state_transition');
    await call(op, 'POST', `/api/v1/platform/tenants/${id}/reactivate`)
      .send({ reason: 'Payment received' })
      .expect(200);
    const tenantAudit = await owner.auditLog.findMany({
      where: { tenantId: id, action: { startsWith: 'tenant.' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(tenantAudit.map((a) => a.action)).toEqual(['tenant.onboarded', 'tenant.suspended', 'tenant.active']);
  });

  it('enforces operator roles', async () => {
    const readonly = await loginOperator(app, EMAILS.operatorReadonly);
    await readonly.agent.get('/api/v1/platform/tenants').expect(200);
    await call(readonly, 'POST', '/api/v1/platform/tenants').send(onboardBody('readonly-try')).expect(403);
  });

  it('requires CSRF on operator writes', async () => {
    const res = await op.agent.post('/api/v1/platform/tenants').send(onboardBody('no-csrf')).expect(403);
    expect(res.body.code).toBe('auth.csrf');
  });
});
