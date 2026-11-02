import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login } from './helpers';
import { EMAILS, loadFixtures, ownerClient, TEST_PASSWORD } from './fixtures';
import { LogMailer } from '../src/common/mailer';

describe('authentication', () => {
  let app: INestApplication;
  let fx: Awaited<ReturnType<typeof loadFixtures>>;
  const owner = ownerClient();

  beforeAll(async () => {
    app = await createApp();
    fx = await loadFixtures();
  });
  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  it('logs in with httpOnly session and readable CSRF cookies, and never returns the token in the body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: EMAILS.ownerA, password: TEST_PASSWORD })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    const cookies = ([] as string[]).concat(res.headers['set-cookie']);
    expect(cookies.find((c) => c.startsWith('ros_session='))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('ros_csrf='))).not.toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('ros_session='))).toMatch(/SameSite=Lax/i);
  });

  it('returns the same error for a wrong password and an unknown e-mail', async () => {
    const server = app.getHttpServer();
    const wrong = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: EMAILS.ownerB, password: 'wrong-password-123' })
      .expect(401);
    const unknown = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.local', password: 'wrong-password-123' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.code).toBe('auth.invalidCredentials');
    // The failed attempt is counted; reset so other suites are unaffected.
    await owner.user.update({ where: { email: EMAILS.ownerB }, data: { failedLoginCount: 0 } });
  });

  it('returns the profile, active tenant and permissions on /me', async () => {
    const s = await login(app, EMAILS.managerA);
    const me = await s.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.tenant.id).toBe(fx.tenantA.id);
    expect(me.body.allBranches).toBe(false);
    expect(me.body.branchIds).toEqual([fx.branchA1.id]);
    expect(me.body.permissions).toContain('setup.branches.view');
    expect(me.body.permissions).not.toContain('setup.branches.manage');
  });

  it('rejects writes without a valid CSRF token', async () => {
    const s = await login(app, EMAILS.ownerB);
    const missing = await s.agent.post('/api/v1/roles').send({ name: 'Csrf test', permissions: [] }).expect(403);
    expect(missing.body.code).toBe('auth.csrf');
    const wrong = await s.agent
      .post('/api/v1/roles')
      .set('x-csrf-token', 'not-the-token')
      .send({ name: 'Csrf test', permissions: [] })
      .expect(403);
    expect(wrong.body.code).toBe('auth.csrf');
  });

  it('logout revokes the session server-side', async () => {
    const s = await login(app, EMAILS.ownerB);
    await s.agent.post('/api/v1/auth/logout').set('x-csrf-token', s.csrf).expect(200);
    await s.agent.get('/api/v1/auth/me').expect(401);
  });

  it('switches between tenants the user belongs to, and refuses others', async () => {
    const s = await login(app, EMAILS.multi);
    let me = await s.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.tenant.id).toBe(fx.tenantA.id);
    expect(me.body.tenants.map((t: { id: string }) => t.id).sort()).toEqual([fx.tenantA.id, fx.tenantB.id].sort());

    await s.agent
      .post('/api/v1/auth/switch-tenant')
      .set('x-csrf-token', s.csrf)
      .send({ tenantId: fx.tenantB.id })
      .expect(200);
    me = await s.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.tenant.id).toBe(fx.tenantB.id);

    const denied = await s.agent
      .post('/api/v1/auth/switch-tenant')
      .set('x-csrf-token', s.csrf)
      .send({ tenantId: fx.tenantC.id })
      .expect(403);
    expect(denied.body.code).toBe('auth.notAMember');
  });

  it('locks an account after repeated failures, even from many IPs, without revealing the lock', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', `10.9.0.${i + 1}`)
        .send({ email: EMAILS.lockout, password: 'wrong-password-123' })
        .expect(401);
    }
    const locked = await request(server)
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '10.9.1.1')
      .send({ email: EMAILS.lockout, password: TEST_PASSWORD })
      .expect(401);
    expect(locked.body.code).toBe('auth.invalidCredentials');
    const user = await owner.user.findUniqueOrThrow({ where: { email: EMAILS.lockout } });
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  describe('password reset', () => {
    const mailer = () => app.get(LogMailer);
    const tokenFrom = (text: string) => decodeURIComponent(/token=([^\s]+)/.exec(text)![1]);

    it('always answers 202 and only mails real accounts', async () => {
      const before = mailer().outbox.length;
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'ghost@test.local' })
        .expect(202);
      expect(mailer().outbox.length).toBe(before);
    });

    it('is single-use, stores only a hash, and revokes existing sessions', async () => {
      const server = app.getHttpServer();
      const existing = await login(app, EMAILS.nopermA);
      await request(server).post('/api/v1/auth/password-reset/request').send({ email: EMAILS.nopermA }).expect(202);
      const message = mailer().lastTo(EMAILS.nopermA)!;
      expect(message.kind).toBe('password_reset');
      const token = tokenFrom(message.text);

      const stored = await owner.passwordResetToken.findMany({ where: { user: { email: EMAILS.nopermA } } });
      expect(stored.some((t) => t.tokenHash === token)).toBe(false);

      const newPassword = 'Brand-New-Password-42';
      await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, password: newPassword })
        .expect(200);
      await existing.agent.get('/api/v1/auth/me').expect(401);
      const reuse = await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, password: 'Another-Password-42' })
        .expect(400);
      expect(reuse.body.code).toBe('auth.invalidToken');
      await login(app, EMAILS.nopermA, newPassword);

      // Restore the fixture password for other suites.
      await request(server).post('/api/v1/auth/password-reset/request').send({ email: EMAILS.nopermA }).expect(202);
      await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: tokenFrom(mailer().lastTo(EMAILS.nopermA)!.text), password: TEST_PASSWORD })
        .expect(200);
    });

    it('rejects expired tokens', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/v1/auth/password-reset/request').send({ email: EMAILS.managerA }).expect(202);
      const token = tokenFrom(mailer().lastTo(EMAILS.managerA)!.text);
      await owner.passwordResetToken.updateMany({
        where: { user: { email: EMAILS.managerA }, usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, password: 'Whatever-Password-1' })
        .expect(400);
      expect(res.body.code).toBe('auth.invalidToken');
    });

    it('enforces the minimum password length', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: 'x'.repeat(43), password: 'short' })
        .expect(400);
      expect(res.body.code).toBe('validation');
    });
  });
});
