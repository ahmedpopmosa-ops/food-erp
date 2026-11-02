export type SqlValue = string | number | null;

export interface Statement {
  sql: string;
  params?: SqlValue[];
  /**
   * Exact number of rows the statement must change; otherwise the whole batch rolls back. Used for
   * optimistic guards such as `UPDATE sequences SET next_value = ? WHERE … AND next_value = ?`.
   */
  expectChanges?: number;
}

export class BatchGuardError extends Error {
  constructor(
    readonly statementIndex: number,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Statement ${statementIndex} changed ${actual} row(s), expected ${expected}; batch rolled back`);
  }
}

/**
 * The only storage interface the POS core uses. Every write is an atomic batch, so the same core runs on
 * Node's SQLite (development, tests) and inside Tauri, where a small Rust command executes the batch in one
 * SQLite transaction (WAL, synchronous=FULL). Reads never hold a transaction open across an await.
 */
export interface SqlDriver {
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs all statements in one transaction (BEGIN IMMEDIATE … COMMIT); all or nothing. */
  batch(statements: Statement[]): Promise<void>;
  close(): Promise<void>;
}

export async function one<T>(driver: SqlDriver, sql: string, params?: SqlValue[]): Promise<T | undefined> {
  return (await driver.all<T>(sql, params))[0];
}
