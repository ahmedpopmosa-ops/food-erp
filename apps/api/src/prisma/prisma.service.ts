import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { claimIdempotencyKey } from '../common/idempotency';

export type Tx = Prisma.TransactionClient;

interface TxOptions {
  /** Also expose the signed-in user's own memberships across tenants (memberships/tenants policies). */
  userId?: string;
}

/**
 * The only way application code reaches tenant data. Every helper opens a transaction and sets
 * transaction-local settings that the RLS policies read (migration 20261030000100_security), so a
 * pooled connection never carries one request's tenant into the next. Services still filter by
 * tenant explicitly; RLS is the safety net.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      if (opts.userId) await tx.$executeRaw`SELECT set_config('app.user_id', ${opts.userId}, true)`;
      // An @Idempotent() request claims its key in this transaction, so the key and the change commit together.
      const finish = await claimIdempotencyKey(tx, tenantId);
      const result = await fn(tx);
      if (finish) await finish(result);
      return result;
    });
  }

  /** The user's own memberships and tenants, without any active tenant (login, tenant picker). */
  withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Operator context. Optionally bound to one tenant for onboarding or support work, which then runs
   * under that tenant's policies like any tenant request.
   */
  withPlatform<T>(fn: (tx: Tx) => Promise<T>, opts: { tenantId?: string } = {}): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform', 'on', true)`;
      if (opts.tenantId) await tx.$executeRaw`SELECT set_config('app.tenant_id', ${opts.tenantId}, true)`;
      return fn(tx);
    });
  }
}
