import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, listRoutes } from './helpers';

describe('OpenAPI and health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('documents every route, with Zod request bodies', async () => {
    const res = await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    const documented = new Set(
      Object.entries(res.body.paths as Record<string, Record<string, unknown>>).flatMap(([path, ops]) =>
        Object.keys(ops).map((m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
      ),
    );
    const missing = listRoutes(app)
      .map((r) => `${r.method} ${r.path}`)
      .filter((r) => !documented.has(r));
    expect(missing).toEqual([]);
    const login = res.body.paths['/api/v1/auth/login'].post;
    expect(login.requestBody.content['application/json'].schema.properties).toHaveProperty('email');
  });

  it('reports liveness and readiness', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200, { status: 'ok' });
    const ready = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(ready.body.checks.database).toBe('ok');
  });

  it('returns structured errors for unknown routes and a request id header', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'http.notFound' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
