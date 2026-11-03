import { Pool, types } from "pg";

// One pool per server process (kept on globalThis so dev hot reloads don't leak connections).
const globalForPool = globalThis as unknown as { pool?: Pool };
// Neon's string says sslmode=require, which pg already treats as verify-full but warns about on
// every cold start. Say verify-full outright: same behaviour, quiet logs.
const connectionString = process.env.DATABASE_URL?.replace(/sslmode=(?:prefer|require|verify-ca)\b/, "sslmode=verify-full");
const pool = globalForPool.pool ?? new Pool({ connectionString, max: 5 });
globalForPool.pool = pool;

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// Postgres "date" columns come back as plain "YYYY-MM-DD" strings, not midnight-UTC Dates.
types.setTypeParser(1082, (value: string) => value);
// bigint (strava ids) as strings, int8 counts from count(*) too - callers Number() what they need.
