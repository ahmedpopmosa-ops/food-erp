import type { SyncOperation } from '@ros/contracts';
import type { Tx } from '../prisma/prisma.service';
import type { DeviceContext } from '../common/auth-context';

/** The operation can never succeed as sent; it is kept server-side (quarantined) for human follow-up. */
export class PermanentRejection extends Error {
  constructor(
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

/** Not processable yet (e.g. its dependency has not arrived); the device retries after the delay. */
export class Retryable {
  constructor(
    readonly code: string,
    readonly retryAfterMs?: number,
    readonly details?: unknown,
  ) {}
}

/** One operation type of the sync contract; `versions` lists the schema versions it accepts. */
export interface OperationHandler {
  readonly type: string;
  readonly versions: number[];
  handle(tx: Tx, device: DeviceContext, op: SyncOperation): Promise<Record<string, unknown>>;
}

export function parseOrReject<T>(
  schema: {
    safeParse(
      v: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
  },
  payload: unknown,
): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new PermanentRejection(
      'payload_invalid',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return parsed.data;
}
