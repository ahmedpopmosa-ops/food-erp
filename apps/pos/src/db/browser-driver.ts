import { BatchGuardError, type SqlDriver, type SqlValue, type Statement } from '@ros/pos-core';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

/** SqlDriver backed by the SQLite worker (OPFS). Same contract as the Node driver: atomic batches, async reads. */
export class BrowserSqliteDriver implements SqlDriver {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, Pending>();
  private next = 1;

  constructor() {
    this.worker.onmessage = (
      e: MessageEvent<{
        id: number;
        ok: boolean;
        rows?: unknown[];
        error?: { name: string; message: string; guard?: { statementIndex: number; expected: number; actual: number } };
      }>,
    ) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) return p.resolve(e.data.rows);
      const g = e.data.error?.guard;
      p.reject(
        g
          ? new BatchGuardError(g.statementIndex, g.expected, g.actual)
          : new StorageError(e.data.error?.message ?? 'Storage error'),
      );
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new StorageError(e.message || 'Storage worker failed'));
      this.pending.clear();
    };
  }

  private call<T>(msg: Record<string, unknown>): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, ...msg });
    });
  }

  all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.call<T[]>({ op: 'all', sql, params });
  }

  batch(statements: Statement[]): Promise<void> {
    return this.call<void>({ op: 'batch', statements });
  }

  async close(): Promise<void> {
    await this.call<void>({ op: 'close' });
    this.worker.terminate();
  }
}

export class StorageError extends Error {}
