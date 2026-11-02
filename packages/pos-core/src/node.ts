import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BatchGuardError, type SqlDriver, type SqlValue, type Statement } from './driver';
import type { Printer } from './receipt';

/**
 * SqlDriver on Node's built-in SQLite, configured like the production Tauri driver: WAL journal,
 * synchronous=FULL (a committed sale survives power loss), foreign keys on, BEGIN IMMEDIATE batches.
 */
export class NodeSqliteDriver implements SqlDriver {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    );
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async batch(statements: Statement[]): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      statements.forEach((s, i) => {
        const { changes } = this.db.prepare(s.sql).run(...(s.params ?? []));
        if (s.expectChanges !== undefined && Number(changes) !== s.expectChanges)
          throw new BatchGuardError(i, s.expectChanges, Number(changes));
      });
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/** Printer emulator: writes each job as .txt (readable) and .bin (raw ESC/POS) into a folder. */
export class FilePrinter implements Printer {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  async print(job: { id: string; invoiceNumber: string; text: string; escpos: Uint8Array }): Promise<void> {
    const base = join(this.dir, `${job.invoiceNumber}-${job.id.replace(/[^A-Za-z0-9-]/g, '_')}`);
    writeFileSync(`${base}.txt`, job.text, 'utf8');
    writeFileSync(`${base}.bin`, job.escpos);
  }
}
