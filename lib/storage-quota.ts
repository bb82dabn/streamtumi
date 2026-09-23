import type { PoolClient } from "pg";
import { HttpError } from "@/lib/http";

export const STATION_STORAGE_LIMIT_BYTES = 10_737_418_240;

export async function stationRetainedSourceBytes(client: PoolClient, stationId: string): Promise<bigint> {
  const usage = await client.query<{ bytes: string }>(
    `SELECT COALESCE((
       SELECT quota_bytes FROM station_media_storage_usage_v WHERE station_id = $1
     ), 0)::text AS bytes`,
    [stationId],
  );
  return BigInt(usage.rows[0]?.bytes ?? "0");
}

export async function assertStationStorageAvailable(client: PoolClient, stationId: string, additionalBytes: bigint): Promise<void> {
  const used = await stationRetainedSourceBytes(client, stationId);
  if (used + additionalBytes > BigInt(STATION_STORAGE_LIMIT_BYTES)) {
    throw new HttpError(413, "This upload would exceed the station's 10 GB storage limit.", "STATION_STORAGE_LIMIT");
  }
}
