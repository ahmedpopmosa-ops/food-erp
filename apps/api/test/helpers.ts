import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp, setupOpenApi } from '../src/bootstrap';
import {
  AUTHENTICATED,
  DEVICE_ACCESS,
  IS_PUBLIC,
  PLATFORM_ROLES,
  REQUIRED_PERMISSIONS,
} from '../src/common/auth-context';
import { TEST_PASSWORD } from './fixtures';

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    providers: [DiscoveryService, MetadataScanner],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  setupOpenApi(app);
  await app.init();
  return app;
}

export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

const cookieValue = (cookies: string[], name: string) =>
  cookies
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]
    .split('=')[1];

/** Logs in and returns a cookie-keeping agent plus the CSRF token to echo on writes. */
export async function login(app: INestApplication, email: string, password = TEST_PASSWORD): Promise<Session> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  const csrf = cookieValue(([] as string[]).concat(res.headers['set-cookie'] ?? []), 'ros_csrf');
  if (!csrf) throw new Error('No CSRF cookie set');
  return { agent, csrf };
}

export async function loginOperator(app: INestApplication, email: string, password = TEST_PASSWORD): Promise<Session> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/v1/platform/auth/login').send({ email, password }).expect(200);
  const csrf = cookieValue(([] as string[]).concat(res.headers['set-cookie'] ?? []), 'ros_op_csrf');
  if (!csrf) throw new Error('No operator CSRF cookie set');
  return { agent, csrf };
}

export type Access =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: string[] }
  | { kind: 'platform'; roles: string[] }
  | { kind: 'device' }
  | { kind: 'unclassified' };

export interface RouteInfo {
  method: string;
  path: string;
  access: Access;
}

/**
 * Every HTTP route registered in the application with its access rule, read from Nest metadata.
 * Authorization tests iterate this list, so a new route is covered (or fails a test) automatically.
 */
export function listRoutes(app: INestApplication): RouteInfo[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const basePath = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const classVersion = Reflect.getMetadata(VERSION_METADATA, metatype);
    const proto = Object.getPrototypeOf(instance);
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = proto[name];
      const subPath = Reflect.getMetadata(PATH_METADATA, handler);
      if (subPath === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
      const version = Reflect.getMetadata(VERSION_METADATA, handler) ?? classVersion;
      const neutral = typeof version === 'symbol';
      const path = [
        '/api',
        neutral ? '' : `/v${version ?? '1'}`,
        `/${basePath}`,
        subPath && subPath !== '/' ? `/${subPath}` : '',
      ]
        .join('')
        .replace(/\/+/g, '/');
      const targets = [handler, metatype];
      const get = <T>(key: string) => reflector.getAllAndOverride<T | undefined>(key, targets);
      let access: Access = { kind: 'unclassified' };
      if (get<boolean>(IS_PUBLIC)) access = { kind: 'public' };
      else if (get<string[]>(PLATFORM_ROLES)) access = { kind: 'platform', roles: get<string[]>(PLATFORM_ROLES)! };
      else if (get<boolean>(DEVICE_ACCESS)) access = { kind: 'device' };
      else if (get<boolean>(AUTHENTICATED)) access = { kind: 'authenticated' };
      else if (get<string[]>(REQUIRED_PERMISSIONS))
        access = { kind: 'permissions', permissions: get<string[]>(REQUIRED_PERMISSIONS)! };
      routes.push({ method, path, access });
    }
  }
  return routes;
}

/** A request as the dashboard sends it: writes echo the CSRF token and carry a fresh Idempotency-Key. */
export function call(session: Session, method: string, path: string, idempotencyKey: string = randomUUID()) {
  const m = method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
  const req = session.agent[m](path);
  return method === 'GET' ? req : req.set('x-csrf-token', session.csrf).set('idempotency-key', idempotencyKey);
}
