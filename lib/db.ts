import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new DatabaseNotConfiguredError();
  if (!global.__pgPool) {
    const url = process.env.DATABASE_URL;
    global.__pgPool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1|host=\//.test(url) ? false : { rejectUnauthorized: true },
      max: 5,
    });
  }
  return global.__pgPool;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL no está configurada");
  }
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

/**
 * Ejecuta una función dentro de una transacción. Si se pasa `userId`, queda disponible para los
 * triggers (historial de estados) mediante `app.user_id`.
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>, userId?: string): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    if (userId) await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
