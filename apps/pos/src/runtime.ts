import {
  migrate,
  one,
  PosCore,
  SyncClient,
  type CredentialStore,
  type Printer,
  type SqlDriver,
  type SyncState,
} from '@ros/pos-core';
import { BrowserSqliteDriver } from './db/browser-driver';

/** Same-origin API (the dev server proxies /api); sync paths are appended to it (`/v1/sync/...`). */
const API_BASE = '/api';
const SYNC_EVERY_MS = 15_000;

/**
 * Device secrets in the local database. In this browser build they live in the origin-private storage of
 * this site (like the sales themselves); the Tauri build keeps them in Windows Credential Manager.
 */
class LocalCredentialStore implements CredentialStore {
  constructor(private readonly db: SqlDriver) {}
  async get() {
    const rows = await this.db.all<{ key: string; value: string }>(
      "SELECT key, value FROM meta WHERE key IN ('cred.access', 'cred.refresh')",
    );
    const access = rows.find((r) => r.key === 'cred.access')?.value;
    const refresh = rows.find((r) => r.key === 'cred.refresh')?.value;
    return access && refresh ? { accessToken: access, refreshToken: refresh } : null;
  }
  async set(t: { accessToken: string; refreshToken: string }) {
    await this.db.batch(
      [
        ['cred.access', t.accessToken],
        ['cred.refresh', t.refreshToken],
      ].map(([k, v]) => ({
        sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        params: [k!, v!],
      })),
    );
  }
}

export interface PrintJob {
  id: string;
  invoiceNumber: string;
  text: string;
  kind: 'receipt' | 'kitchen';
}

/** "Prints" by handing the job to the screen, which shows it and can send it to the browser's printer. */
class ScreenPrinter implements Printer {
  private listeners = new Set<(job: PrintJob) => void>();
  onJob(fn: (job: PrintJob) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  async print(job: { id: string; invoiceNumber: string; text: string }) {
    const kind = job.invoiceNumber.startsWith('kitchen-') ? 'kitchen' : 'receipt';
    for (const fn of this.listeners) fn({ id: job.id, invoiceNumber: job.invoiceNumber, text: job.text, kind });
  }
}

export interface SyncStatus {
  state: SyncState | 'syncing';
  pending: number;
  rejected: number;
  lastSyncAt: string | null;
  leaseValidUntil: string | null;
  leaseValid: boolean;
}

/** One device: storage, POS core, sync client, printer and the background sync loop. */
export class Runtime {
  readonly printer = new ScreenPrinter();
  readonly pos: PosCore;
  readonly sync: SyncClient;
  private status: SyncStatus = {
    state: 'idle',
    pending: 0,
    rejected: 0,
    lastSyncAt: null,
    leaseValidUntil: null,
    leaseValid: false,
  };
  private listeners = new Set<(s: SyncStatus) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;

  private constructor(readonly db: SqlDriver) {
    // The browser prints through its own print dialog, which draws Arabic, so receipts are in Arabic here.
    this.pos = new PosCore(db, this.printer, undefined, { receiptLocale: 'ar' });
    this.sync = new SyncClient(db, API_BASE, new LocalCredentialStore(db), (url, init) => fetch(url, init));
  }

  static async start(): Promise<Runtime> {
    const db = new BrowserSqliteDriver();
    await migrate(db);
    return new Runtime(db);
  }

  async isPaired() {
    return !!(await one<{ value: string }>(this.db, "SELECT value FROM meta WHERE key = 'device.deviceId'"));
  }

  async pair(code: string) {
    await this.sync.pair(code.trim().toUpperCase());
    await this.syncNow();
  }

  onStatus(fn: (s: SyncStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Push then pull, one run at a time; safe to call often (after every sale, on reconnect, on a timer). */
  syncNow(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      this.emit({ state: 'syncing' });
      try {
        const pushed = await this.sync.push();
        const pulled = pushed.state === 'idle' ? await this.sync.pull() : { state: pushed.state };
        const ok = pulled.state === 'idle';
        this.emit({ state: pulled.state, ...(ok ? { lastSyncAt: new Date().toISOString() } : {}) });
      } catch {
        this.emit({ state: 'offline' });
      } finally {
        await this.refreshCounts();
        this.running = null;
      }
    })();
    return this.running;
  }

  startLoop() {
    if (this.timer) return;
    void this.syncNow();
    this.timer = setInterval(() => void this.syncNow(), SYNC_EVERY_MS);
    window.addEventListener('online', () => void this.syncNow());
  }

  private async refreshCounts() {
    const s = await this.sync.status();
    let lease = { valid: false, validUntil: null as string | null };
    try {
      lease = await this.pos.leaseStatus();
    } catch {
      /* not paired yet */
    }
    this.emit({
      pending: s.pending + s.blocked,
      rejected: s.rejected,
      leaseValid: lease.valid,
      leaseValidUntil: lease.validUntil,
    });
  }

  private emit(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }
}
