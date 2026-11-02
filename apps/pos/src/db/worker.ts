/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

/**
 * SQLite for the browser POS, in a dedicated worker. The database file lives in the origin-private file system
 * through the "opfs-sahpool" VFS: durable across reloads and crashes, no cross-origin isolation needed, one
 * connection per origin (a second tab cannot open it — the page reports that). Every batch runs in one
 * BEGIN IMMEDIATE … COMMIT with synchronous=FULL, like the Node and Tauri drivers.
 */

type Request =
  | { id: number; op: 'all'; sql: string; params: (string | number | null)[] }
  | {
      id: number;
      op: 'batch';
      statements: { sql: string; params?: (string | number | null)[]; expectChanges?: number }[];
    }
  | { id: number; op: 'close' };

const DB_FILE = '/restaurantos-pos.sqlite3';

const ready = (async () => {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'restaurantos-pos' });
  const db = new pool.OpfsSAHPoolDb(DB_FILE);
  db.exec('PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  return db;
})();

const reply = (msg: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    const db = await ready;
    if (req.op === 'all') {
      const rows = db.exec({ sql: req.sql, bind: req.params, rowMode: 'object', returnValue: 'resultRows' });
      reply({ id: req.id, ok: true, rows });
    } else if (req.op === 'batch') {
      db.exec('BEGIN IMMEDIATE');
      try {
        req.statements.forEach((s, i) => {
          db.exec({ sql: s.sql, bind: s.params ?? [] });
          const changes = db.changes();
          if (s.expectChanges !== undefined && changes !== s.expectChanges) {
            throw Object.assign(new Error('batch guard'), {
              guard: { statementIndex: i, expected: s.expectChanges, actual: changes },
            });
          }
        });
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      reply({ id: req.id, ok: true });
    } else {
      db.close();
      reply({ id: req.id, ok: true });
    }
  } catch (err) {
    const e2 = err as Error & { guard?: unknown };
    reply({ id: req.id, ok: false, error: { name: e2.name, message: String(e2.message ?? err), guard: e2.guard } });
  }
};
