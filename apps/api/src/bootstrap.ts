import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Request, Response } from 'express';
import { config, PLATFORM_SESSION_COOKIE, SESSION_COOKIE } from './config';

/** Shared HTTP setup for the server entry point, the OpenAPI export and the e2e tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: [config().WEB_ORIGIN, config().ADMIN_ORIGIN], credentials: true });
  // Behind the reverse proxy (same-origin /api) the client IP comes from X-Forwarded-For.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 'loopback');
  return app;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('RestaurantOS API')
    .setDescription(
      'Errors are returned as { statusCode, code, message, details? }. Writes require the x-csrf-token header.',
    )
    .setVersion('1')
    .addCookieAuth(SESSION_COOKIE, { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE }, 'tenant-session')
    .addCookieAuth(
      PLATFORM_SESSION_COOKIE,
      { type: 'apiKey', in: 'cookie', name: PLATFORM_SESSION_COOKIE },
      'operator-session',
    )
    .build();
  return SwaggerModule.createDocument(app, doc);
}

/** Serves /api/openapi.json always and the interactive docs outside production. */
export function setupOpenApi(app: INestApplication) {
  const document = buildOpenApi(app);
  app.getHttpAdapter().get('/api/openapi.json', (_req: Request, res: Response) => res.json(document));
  if (config().NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, document);
  return document;
}
