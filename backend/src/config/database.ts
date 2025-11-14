import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

export const query = async <T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> => {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (env.NODE_ENV === 'development') {
    console.log('Query executed:', { text, duration, rows: res.rowCount });
  }

  return res;
};

export const getClient = () => pool.connect();

/**
 * Execute a callback within a database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 *
 * @param callback - Function that receives a database client and returns a promise
 * @returns The result from the callback
 * @throws Re-throws any error after rolling back the transaction
 *
 * @example
 * const result = await withTransaction(async (client) => {
 *   await client.query('INSERT INTO users ...', [params]);
 *   await client.query('INSERT INTO roles ...', [params]);
 *   return { success: true };
 * });
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a callback with a dedicated database client from the pool.
 * Does NOT create a transaction - use for read operations or when you need
 * a dedicated connection without transaction semantics.
 *
 * @param callback - Function that receives a database client and returns a promise
 * @returns The result from the callback
 *
 * @example
 * const result = await withClient(async (client) => {
 *   return await client.query('SELECT * FROM users WHERE id = $1', [id]);
 * });
 */
export async function withClient<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
