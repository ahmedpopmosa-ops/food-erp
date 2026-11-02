import {
  MAX_BATCH_OPS,
  SYNC_PROTOCOL,
  type DeviceTokens,
  type OperationResult,
  type PullResponse,
  type PushResponse,
  type SyncOperation,
} from '@ros/contracts';
import { uuidv7 } from '@ros/domain';
import { one, type SqlDriver, type Statement } from './driver';
import { ReferenceStore } from './catalog';
import { LOCAL_SCHEMA_VERSION } from './schema';

/** Where the device's secrets live: Windows Credential Manager in Tauri, memory in tests. */
export interface CredentialStore {
  get(): Promise<{ accessToken: string; refreshToken: string } | null>;
  set(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

/** Full-jitter exponential backoff: random in [0, min(cap, base × 2^attempt)] (docs/02 §6). */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
  baseMs = 2_000,
  capMs = 300_000,
): number {
  return Math.floor(random() * Math.min(capMs, baseMs * 2 ** Math.max(0, attempt)));
}

export type SyncState =
  'idle' | 'offline' | 'unauthorised' | 'device_disabled' | 'subscription_suspended' | 'upgrade_required';

export interface PushSummary {
  state: SyncState;
  sent: number;
  acked: number;
  rejected: number;
  retrying: number;
}

const APP_VERSION = '0.1.0';

/**
 * Talks to `/v1/sync`. Safe to call at any time and from a timer: operations stay in the outbox until the
 * server acknowledges them (`accepted` or `already_processed`), so lost responses, crashes and duplicate
 * deliveries never lose or duplicate a sale.
 */
export class SyncClient {
  private readonly refs: ReferenceStore;

  constructor(
    private readonly db: SqlDriver,
    private readonly baseUrl: string,
    private readonly credentials: CredentialStore,
    private readonly fetch: FetchLike = globalThis.fetch as unknown as FetchLike,
    private readonly clock: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {
    this.refs = new ReferenceStore(db);
  }

  /** Exchanges the dashboard's pairing code for credentials and stores the device identity. */
  async pair(pairingCode: string): Promise<DeviceTokens> {
    const res = await this.fetch(`${this.baseUrl}/v1/devices/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairingCode, appVersion: APP_VERSION }),
    });
    const body = (await res.json()) as DeviceTokens & { code?: string };
    if (res.status !== 200) throw new Error(`Pairing failed: ${body.code ?? res.status}`);
    await this.credentials.set({ accessToken: body.accessToken, refreshToken: body.refreshToken });
    const meta: [string, string][] = [
      ['device.tenantId', body.tenantId],
      ['device.branchId', body.branchId],
      ['device.deviceId', body.deviceId],
      ['device.branchCode', body.branchCode],
      ['device.deviceCode', body.deviceCode],
      ['sync.pull_cursor', '0'],
      ['lease.public_key', body.leasePublicKey],
      ['lease.value', JSON.stringify(body.lease)],
    ];
    await this.db.batch(
      meta.map(([k, v]) => ({
        sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        params: [k, v],
      })),
    );
    return body;
  }

  /** Downloads all reference changes since the stored cursor; each page commits atomically with its cursor. */
  async pull(): Promise<{ state: SyncState; changes: number }> {
    let total = 0;
    for (;;) {
      const cursor = Number(
        (await one<{ value: string }>(this.db, "SELECT value FROM meta WHERE key = 'sync.pull_cursor'"))?.value ?? 0,
      );
      const res = await this.request('GET', `/v1/sync/pull?cursor=${cursor}&limit=500`);
      if ('state' in res) return { state: res.state, changes: total };
      const page = res.body as PullResponse;
      await this.db.batch([
        ...this.refs.changeStatements(page.changes),
        {
          sql: "INSERT INTO meta (key, value) VALUES ('sync.pull_cursor', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          params: [String(page.next_cursor)],
        },
      ]);
      total += page.changes.length;
      if (!page.has_more) return { state: 'idle', changes: total };
    }
  }

  /** Sends due outbox operations in local order and applies the per-operation results. */
  async push(): Promise<PushSummary> {
    const summary: PushSummary = { state: 'idle', sent: 0, acked: 0, rejected: 0, retrying: 0 };
    const nowIso = new Date(this.clock()).toISOString();
    const due = await this.db.all<{ local_seq: number; envelope: string; attempts: number }>(
      `SELECT local_seq, envelope, attempts FROM outbox
       WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY local_seq LIMIT ?`,
      [nowIso, MAX_BATCH_OPS],
    );
    if (due.length === 0) return summary;
    const ops = due.map((d) => JSON.parse(d.envelope) as SyncOperation);
    summary.sent = ops.length;

    const res = await this.request('POST', '/v1/sync/push', {
      protocol: SYNC_PROTOCOL,
      batch_id: uuidv7(this.clock()),
      device_time: nowIso,
      client: { app_version: APP_VERSION, local_schema_version: LOCAL_SCHEMA_VERSION },
      operations: ops,
    });
    if ('state' in res) {
      // Whole batch not processed: everything stays pending, retried later with backoff.
      await this.db.batch(due.map((d) => this.retryStatement(d.local_seq, d.attempts, res.state)));
      return { ...summary, state: res.state, retrying: due.length };
    }

    const response = res.body as PushResponse;
    const results = new Map(response.results.map((r) => [r.operation_id, r]));
    const statements: Statement[] = [];
    if (response.lease) {
      statements.push({
        sql: "INSERT INTO meta (key, value) VALUES ('lease.value', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params: [JSON.stringify(response.lease)],
      });
    }
    for (const d of due) {
      const r: OperationResult | undefined = results.get(JSON.parse(d.envelope).operation_id);
      if (!r || r.status === 'retryable' || r.status === 'blocked') {
        statements.push(
          this.retryStatement(
            d.local_seq,
            d.attempts,
            r?.error?.code ?? 'missing_result',
            r?.retry_after_ms,
            r?.status === 'blocked',
          ),
        );
        summary.retrying++;
      } else if (r.status === 'accepted' || r.status === 'already_processed') {
        statements.push({
          sql: `UPDATE outbox SET status = 'acked', server_refs = ?, last_error = NULL WHERE local_seq = ?`,
          params: [JSON.stringify(r.server_refs ?? {}), d.local_seq],
        });
        summary.acked++;
      } else {
        statements.push({
          sql: `UPDATE outbox SET status = 'rejected', last_error = ? WHERE local_seq = ?`,
          params: [JSON.stringify(r.error ?? {}), d.local_seq],
        });
        summary.rejected++;
      }
    }
    await this.db.batch(statements);
    return summary;
  }

  async status() {
    const rows = await this.db.all<{ status: string; n: number; oldest: string | null }>(
      'SELECT status, count(*) AS n, min(created_at) AS oldest FROM outbox GROUP BY status',
    );
    const by = (s: string) => rows.find((r) => r.status === s);
    return {
      pending: by('pending')?.n ?? 0,
      rejected: by('rejected')?.n ?? 0,
      blocked: by('blocked')?.n ?? 0,
      acked: by('acked')?.n ?? 0,
      oldestPendingAt: by('pending')?.oldest ?? null,
    };
  }

  private retryStatement(
    localSeq: number,
    attempts: number,
    error: string,
    retryAfterMs?: number,
    blocked = false,
  ): Statement {
    const delay = retryAfterMs ?? backoffDelay(attempts, this.random);
    return {
      sql: `UPDATE outbox SET status = ?, attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE local_seq = ?`,
      params: [blocked ? 'blocked' : 'pending', new Date(this.clock() + delay).toISOString(), error, localSeq],
    };
  }

  /** HTTP with one transparent token refresh; maps whole-request failures to a sync state. */
  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<{ body: unknown } | { state: SyncState }> {
    const creds = await this.credentials.get();
    if (!creds) return { state: 'unauthorised' };
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${creds.accessToken}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { state: 'offline' };
    }
    if (res.status === 200) return { body: await res.json() };
    if (res.status === 401 && !retried && (await this.refresh(creds.refreshToken)))
      return this.request(method, path, body, true);
    if (res.status === 401) return { state: 'unauthorised' };
    if (res.status === 403) return { state: 'device_disabled' };
    if (res.status === 402) return { state: 'subscription_suspended' };
    if (res.status === 426) return { state: 'upgrade_required' };
    return { state: 'offline' };
  }

  private async refresh(refreshToken: string): Promise<boolean> {
    const deviceId = (await one<{ value: string }>(this.db, "SELECT value FROM meta WHERE key = 'device.deviceId'"))
      ?.value;
    if (!deviceId) return false;
    try {
      const res = await this.fetch(`${this.baseUrl}/v1/devices/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, refreshToken }),
      });
      if (res.status !== 200) return false;
      const t = (await res.json()) as DeviceTokens;
      await this.credentials.set({ accessToken: t.accessToken, refreshToken: t.refreshToken });
      return true;
    } catch {
      return false;
    }
  }
}

export class MemoryCredentialStore implements CredentialStore {
  private tokens: { accessToken: string; refreshToken: string } | null = null;
  async get() {
    return this.tokens;
  }
  async set(t: { accessToken: string; refreshToken: string }) {
    this.tokens = t;
  }
}
