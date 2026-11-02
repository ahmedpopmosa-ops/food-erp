import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyInterceptor } from './common/idempotency';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { CoreModule } from './core.module';
import { IdentityModule } from './identity/identity.module';
import { SetupModule } from './setup/setup.module';
import { PlatformModule } from './platform/platform.module';
import { AccountingModule } from './accounting/accounting.module';
import { CatalogModule } from './catalog/catalog.module';
import { DevicesModule } from './devices/devices.module';
import { SyncModule } from './sync/sync.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { FinanceModule } from './finance/finance.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { SalesModule } from './sales/sales.controller';
import { PeopleModule } from './people/employees.controller';
import { HealthController } from './health.controller';
import { AccessGuard } from './common/access.guard';
import { ApiExceptionFilter } from './common/exception.filter';
import { config } from './config';

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config().LOG_LEVEL ?? (config().NODE_ENV === 'test' ? 'silent' : 'info'),
        transport:
          config().NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        // Secrets and personal data never reach logs (doc 05 §2).
        redact: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: config().NODE_ENV === 'test' ? 10_000 : 300 }]),
    PrismaModule,
    CoreModule,
    IdentityModule,
    SetupModule,
    PlatformModule,
    AccountingModule,
    CatalogModule,
    DevicesModule,
    SyncModule,
    InventoryModule,
    PurchasingModule,
    FinanceModule,
    KitchenModule,
    SalesModule,
    PeopleModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit → session, CSRF, tenant state, permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
