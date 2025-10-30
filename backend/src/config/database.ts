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

export const query = async <T = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> => {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (env.NODE_ENV === 'development') {
    console.log('Query executed:', { text, duration, rows: res.rowCount });
  }

  return res;
};

export const getClient = () => pool.connect();
