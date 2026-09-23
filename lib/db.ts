import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as { channelLoopPool?: Pool };

export const db =
  globalForDb.channelLoopPool ??
  new Pool({
    connectionString: env().DATABASE_URL,
    max: 15,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.channelLoopPool = db;

export function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  return db.query<T>(text, values);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
