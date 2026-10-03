import pg from 'pg';
import type { SqlClient } from './gateway';

export interface ReadOnlyPool extends SqlClient {
  close(): Promise<void>;
}

/**
 * A pool whose every session is read-only. The shadowrates database is another application's
 * source of truth: even a bug here must not be able to change it.
 */
export function createReadOnlyPool(connectionString: string): ReadOnlyPool {
  const pool = new pg.Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    options: '-c default_transaction_read_only=on -c statement_timeout=15000',
  });
  // An idle client that errors (database restarted) must not crash the process.
  pool.on('error', () => undefined);

  return {
    query: async <Row>(text: string, values: readonly unknown[] = []) => {
      const result = await pool.query(text, [...values]);
      return { rows: result.rows as Row[] };
    },
    close: () => pool.end(),
  };
}
