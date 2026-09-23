import { randomUUID } from "node:crypto";
import { lockActiveUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { NormalizedYouTubeUrl } from "@/lib/youtube";
import { STATION_STORAGE_LIMIT_BYTES, stationRetainedSourceBytes } from "@/lib/storage-quota";

type ExistingImport = {
  id: string;
  normalized_source_url: string;
  external_source_id: string;
  status: string;
};

export type YouTubeReservation = {
  videoId: string;
  status: string;
  created: boolean;
};

export async function reserveYouTubeImport(input: {
  userId: string;
  stationId: string;
  source: NormalizedYouTubeUrl;
  requestId: string;
}): Promise<YouTubeReservation> {
  return transaction(async (client) => {
    await lockActiveUser(client, input.userId);
    const station = await client.query(
      "SELECT id FROM stations WHERE id = $1 AND owner_id = $2 AND station_kind = 'TV' AND deleted_at IS NULL FOR UPDATE",
      [input.stationId, input.userId],
    );
    if (!station.rowCount) throw new HttpError(404, "Station not found.", "NOT_FOUND");

    const existing = await client.query<ExistingImport>(
      `SELECT id, normalized_source_url, external_source_id, status
         FROM videos WHERE station_id = $1 AND ingestion_request_id = $2`,
      [input.stationId, input.requestId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].normalized_source_url !== input.source.url || existing.rows[0].external_source_id !== input.source.videoId) {
        throw new HttpError(409, "This import request ID was already used for another video.", "IMPORT_REQUEST_CONFLICT");
      }
      return { videoId: existing.rows[0].id, status: existing.rows[0].status, created: false };
    }

    const remaining = BigInt(STATION_STORAGE_LIMIT_BYTES) - await stationRetainedSourceBytes(client, input.stationId);
    if (remaining <= 0n) throw new HttpError(413, "This station's 10 GB storage limit is full.", "STATION_STORAGE_LIMIT");
    const reservationBytes = remaining < BigInt(env().MAX_UPLOAD_BYTES) ? remaining : BigInt(env().MAX_UPLOAD_BYTES);
    const videoId = randomUUID();
    const sourceKey = `stations/${input.stationId}/sources/${videoId}/youtube-source`;
    await client.query(
      `INSERT INTO videos
       (id, station_id, title, status, source_key, source_file_name, mime_type, size_bytes,
        processing_progress, source_kind, normalized_source_url, external_source_id,
        ingestion_status, ingestion_request_id, rights_attested_at, rights_attested_by,
        rights_attestation_version)
       VALUES ($1, $2, $3, 'QUEUED', $4, $5, 'application/octet-stream', $6, 1,
               'YOUTUBE', $7, $8, 'QUEUED', $9, now(), $10, 1)`,
      [
        videoId,
        input.stationId,
        `YouTube import ${input.source.videoId}`,
        sourceKey,
        `youtube-${input.source.videoId}`,
        reservationBytes.toString(),
        input.source.url,
        input.source.videoId,
        input.requestId,
        input.userId,
      ],
    );
    return { videoId, status: "QUEUED", created: true };
  });
}

export async function reserveYouTubeRetry(videoId: string, userId: string): Promise<boolean> {
  return transaction(async (client) => {
    await lockActiveUser(client, userId);
    const target = await client.query<{ size_bytes: string; station_id: string }>(
      `SELECT v.size_bytes::text, v.station_id
         FROM videos v JOIN stations s ON s.id = v.station_id
        WHERE v.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL
          AND v.source_kind = 'YOUTUBE' AND v.status = 'FAILED'
          AND v.ingestion_status = 'FAILED' AND v.processing_attempts < 12
        FOR UPDATE OF s, v`,
      [videoId, userId],
    );
    const video = target.rows[0];
    if (!video) return false;
    const usageWithoutTarget = await stationRetainedSourceBytes(client, video.station_id) - BigInt(video.size_bytes);
    const remaining = BigInt(STATION_STORAGE_LIMIT_BYTES) - usageWithoutTarget;
    if (remaining <= 0n) throw new HttpError(413, "This station's 10 GB storage limit is full.", "STATION_STORAGE_LIMIT");
    const reservationBytes = remaining < BigInt(env().MAX_UPLOAD_BYTES) ? remaining : BigInt(env().MAX_UPLOAD_BYTES);
    const updated = await client.query(
      `UPDATE videos SET status = 'QUEUED', ingestion_status = 'QUEUED',
              size_bytes = $2, processing_error = NULL, ingestion_error = NULL,
              processing_progress = 1, updated_at = now()
        WHERE id = $1 AND status = 'FAILED' AND ingestion_status = 'FAILED'`,
      [videoId, reservationBytes.toString()],
    );
    return Boolean(updated.rowCount);
  });
}
