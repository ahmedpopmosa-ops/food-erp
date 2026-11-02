import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  HttpStatus,
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable, catchError, of } from 'rxjs';
import type { Tx } from '../prisma/prisma.service';
import { AppError } from './errors';
import type { AppRequest } from './auth-context';

/**
 * HTTP idempotency (doc 02 §5, doc 07 I6) for back-office writes. A route marked `@Idempotent()` requires an
 * `Idempotency-Key` header. The key is claimed in the **same transaction** as the business change (the first
 * `withTenant` of the request), so either both commit or neither does:
 * - first request: key stored with the request hash and, on commit, the response body;
 * - repeat with the same key and body: the stored response is returned, nothing runs again;
 * - concurrent repeat: PostgreSQL makes it wait for the first to commit, then it is a replay;
 * - same key, different request: 422 `idempotency.keyReused`.
 * Keys are per user (`scope = http:<userId>`), so one user cannot replay another's response.
 */
export const IDEMPOTENT = 'idempotency:required';
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

const KEY = /^[A-Za-z0-9_-]{8,100}$/;

interface IdempotencyClaim {
  tenantId: string;
  scope: string;
  key: string;
  hash: string;
  claimed: boolean;
}

const store = new AsyncLocalStorage<IdempotencyClaim>();

/** A repeat of a completed request: the interceptor answers with the stored response. */
export class IdempotentReplay extends Error {
  constructor(readonly response: unknown) {
    super('idempotent replay');
  }
}

/**
 * Called by `PrismaService.withTenant` at the start of its transaction. Only the request's first tenant
 * transaction claims the key; it returns a finisher that stores the response before that transaction commits.
 */
export async function claimIdempotencyKey(tx: Tx, tenantId: string) {
  const claim = store.getStore();
  if (!claim || claim.claimed || claim.tenantId !== tenantId) return null;
  claim.claimed = true;
  const inserted = await tx.$queryRaw<{ key: string }[]>`
    INSERT INTO idempotency_keys (tenant_id, scope, key, request_hash, status)
    VALUES (${tenantId}::uuid, ${claim.scope}, ${claim.key}, ${claim.hash}, 'in_progress')
    ON CONFLICT DO NOTHING RETURNING key`;
  if (inserted.length === 0) {
    // The conflicting insert has committed (an uncommitted one makes the INSERT above wait): it is complete.
    const [existing] = await tx.$queryRaw<{ request_hash: string; status: string; resource_refs: unknown }[]>`
      SELECT request_hash, status, resource_refs FROM idempotency_keys
      WHERE tenant_id = ${tenantId}::uuid AND scope = ${claim.scope} AND key = ${claim.key}`;
    if (!existing || existing.request_hash !== claim.hash)
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'idempotency.keyReused',
        'This Idempotency-Key was already used for a different request',
      );
    throw new IdempotentReplay((existing.resource_refs as { body?: unknown } | null)?.body ?? null);
  }
  return async (result: unknown) => {
    // Stored as the client received it (Decimals and dates already serialised).
    const body = result === undefined ? null : (JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue);
    await tx.$executeRaw`
      UPDATE idempotency_keys SET status = 'completed', resource_refs = ${JSON.stringify({ body })}::jsonb
      WHERE tenant_id = ${tenantId}::uuid AND scope = ${claim.scope} AND key = ${claim.key}`;
  };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.getAllAndOverride<boolean>(IDEMPOTENT, [ctx.getHandler(), ctx.getClass()]))
      return next.handle();
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const auth = req.auth as { tenantId?: string; userId?: string } | undefined;
    const key = req.header('idempotency-key');
    if (!key || !KEY.test(key))
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'idempotency.keyRequired',
        'This request needs an Idempotency-Key header (8–100 letters, digits, - or _)',
      );
    if (!auth?.tenantId || !auth.userId) return next.handle();
    const hash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl.split('?')[0]} ${JSON.stringify(req.body ?? null)}`)
      .digest('hex');
    const claim: IdempotencyClaim = {
      tenantId: auth.tenantId,
      scope: `http:${auth.userId}`,
      key,
      hash,
      claimed: false,
    };
    const res = ctx.switchToHttp().getResponse<{ setHeader: (n: string, v: string) => void }>();
    return new Observable((subscriber) =>
      store.run(claim, () =>
        next
          .handle()
          .pipe(
            catchError((err: unknown) => {
              if (!(err instanceof IdempotentReplay)) throw err;
              res.setHeader('Idempotent-Replayed', 'true');
              return of(err.response);
            }),
          )
          .subscribe(subscriber),
      ),
    );
  }
}
