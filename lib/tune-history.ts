import { z } from "zod";
import { query } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { PublicStation } from "@/lib/public-access";

export const TUNE_HISTORY_RETENTION_DAYS = 90;
export const tuneClients = ["MOBILE", "WEB", "ROKU", "TV"] as const;
export type TuneClient = (typeof tuneClients)[number];

export const mobileTuneSchema = z.object({
  id: z.string().uuid(),
  stationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

export type StationTune = {
  id: string;
  stationId: string;
  client: TuneClient;
  tunedAt: string;
  created: boolean;
};

type StationTuneRow = {
  id: string;
  station_id: string;
  client: TuneClient;
  tuned_at: Date;
};

export function assertCanRecordTune(station: PublicStation, userId: string): void {
  if (station.visibility !== "PUBLIC" || station.access_password_hash !== null) {
    throw new HttpError(404, "Station not found.", "NOT_FOUND");
  }
  if (station.owner_id === userId && station.playback_type !== "WEATHERSTAR_4000") {
    throw new HttpError(409, "Station owners cannot record tune history for their own station.", "OWNER_TUNE");
  }
}

function presentTune(row: StationTuneRow, created: boolean): StationTune {
  return {
    id: row.id,
    stationId: row.station_id,
    client: row.client,
    tunedAt: row.tuned_at.toISOString(),
    created,
  };
}

export async function recordTune(
  id: string,
  userId: string,
  stationId: string,
  client: TuneClient,
): Promise<StationTune> {
  const inserted = await query<StationTuneRow>(
    `INSERT INTO station_tunes (id, user_id, station_id, client)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, station_id, client, tuned_at`,
    [id, userId, stationId, client],
  );
  if (inserted.rows[0]) return presentTune(inserted.rows[0], true);

  const existing = await query<StationTuneRow>(
    `SELECT id, station_id, client, tuned_at FROM station_tunes
      WHERE id = $1 AND user_id = $2 AND station_id = $3 AND client = $4`,
    [id, userId, stationId, client],
  );
  if (!existing.rows[0]) {
    throw new HttpError(409, "This tune event id was already used.", "TUNE_ID_CONFLICT");
  }
  return presentTune(existing.rows[0], false);
}

export async function recentTuneStationIds(userId: string, limit = 12): Promise<string[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const result = await query<{ station_id: string }>(
    `SELECT station_id
       FROM station_tunes
      WHERE user_id = $1 AND tuned_at >= now() - ($3 * interval '1 day')
      GROUP BY station_id
      ORDER BY max(tuned_at) DESC, station_id ASC
      LIMIT $2`,
    [userId, safeLimit, TUNE_HISTORY_RETENTION_DAYS],
  );
  return result.rows.map((row) => row.station_id);
}

export async function clearTuneHistory(userId: string): Promise<number> {
  const result = await query("DELETE FROM station_tunes WHERE user_id = $1", [userId]);
  return result.rowCount ?? 0;
}
