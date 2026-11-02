import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers';

describe('login rate limit', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('returns 429 on the 11th login attempt within a minute from one IP', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', '10.8.0.1')
        .send({ email: 'nobody@test.local', password: 'x' })
        .expect(401);
    }
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '10.8.0.1')
      .send({ email: 'nobody@test.local', password: 'x' })
      .expect(429);
    expect(res.body.code).toBe('http.tooManyRequests');
    // Another client is unaffected.
    await request(server)
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '10.8.0.2')
      .send({ email: 'nobody@test.local', password: 'x' })
      .expect(401);
  });
});
