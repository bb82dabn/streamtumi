import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { assertStationStorageAvailable } from "@/lib/storage-quota";

export function safeUploadFilename(value: string): string {
  return value.replace(/[\\/\u0000-\u001F\u007F]/g, "_").slice(0, 255);
}

export async function assertReplacementTarget(stationId: string, replacementForId?: string | null): Promise<void> {
  if (!replacementForId) return;
  const oldVideo = await query(
    "SELECT 1 FROM videos WHERE id = $1 AND station_id = $2 AND status NOT IN ('ARCHIVED', 'REPLACED')",
    [replacementForId, stationId],
  );
  if (!oldVideo.rowCount) throw new HttpError(404, "The video to replace was not found.", "NOT_FOUND");
}

type Reservation = {
  userId: string;
  stationId: string;
  filename: string;
  mimeType: string;
  size: number;
  replacementForId?: string | null;
  sourceKey: (videoId: string) => string;
};

export async function reserveVideoUpload(input: Reservation): Promise<{ videoId: string; sourceKey: string }> {
  const videoId = randomUUID();
  const sourceKey = input.sourceKey(videoId);
  const title = input.filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Untitled video";
  await transaction(async (client) => {
    const station = await client.query(
      "SELECT id FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE",
      [input.stationId, input.userId],
    );
    if (!station.rowCount) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    await assertStationStorageAvailable(client, input.stationId, BigInt(input.size));
    await client.query(
      `INSERT INTO videos
       (id, station_id, title, source_key, source_file_name, mime_type, size_bytes, replacement_for_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [videoId, input.stationId, title, sourceKey, input.filename, input.mimeType, input.size, input.replacementForId || null],
    );
  });
  return { videoId, sourceKey };
}
