import { randomUUID } from "node:crypto";
import { z } from "zod";
import { lockActiveUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { getMediaProcessingQueue } from "@/lib/queue";
import { assertStationStorageAvailable } from "@/lib/storage-quota";

export const createMediaClipSchema = z.object({
  stationId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict().refine((value) => value.endMs > value.startMs && value.endMs - value.startMs >= 1000 && value.endMs - value.startMs <= 7_200_000, {
  message: "Clips must be between one second and two hours.", path: ["endMs"],
});

export async function createMediaClip(ownerId: string, parentAssetId: string, input: z.infer<typeof createMediaClipSchema>) {
  const result = await transaction(async (client) => {
    await lockActiveUser(client, ownerId);
    const station = await client.query(
      "SELECT id FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE",
      [input.stationId, ownerId],
    );
    if (!station.rowCount) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    const existing = await client.query<{ child_media_asset_id: string }>(
      "SELECT child_media_asset_id FROM studio_asset_clips WHERE owner_id = $1 AND clip_request_id = $2",
      [ownerId, input.idempotencyKey],
    );
    if (existing.rows[0]) return { assetId: existing.rows[0].child_media_asset_id, jobId: null, created: false };
    const parent = await client.query<{ duration_ms: string; variant_id: string }>(
      `SELECT asset.duration_ms::text, variant.id AS variant_id
         FROM media_assets asset
         JOIN LATERAL (
           SELECT id FROM media_asset_variants WHERE media_asset_id = asset.id
             AND role = 'MEZZANINE' AND status = 'READY' ORDER BY generation DESC LIMIT 1
         ) variant ON true
         WHERE asset.id = $1 AND asset.owner_id = $2 AND asset.media_type = 'AUDIO'
           AND EXISTS (SELECT 1 FROM station_media_allocations allocation
                        WHERE allocation.station_id = $3 AND allocation.media_asset_id = asset.id)
           AND asset.status IN ('READY', 'PARTIAL') FOR UPDATE OF asset`,
      [parentAssetId, ownerId, input.stationId],
    );
    if (!parent.rows[0]) throw new HttpError(404, "Playable parent audio was not found.", "NOT_FOUND");
    if (input.endMs > Number(parent.rows[0].duration_ms)) throw new HttpError(400, "The clip range exceeds the parent duration.", "CLIP_RANGE_INVALID");
    const durationMs = input.endMs - input.startMs;
    const reservation = BigInt(Math.ceil(durationMs / 1000)) * 192_000n;
    await assertStationStorageAvailable(client, input.stationId, reservation);
    const childAssetId = randomUUID();
    const clipId = randomUUID();
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO media_assets
         (id, owner_id, media_type, status, storage_authority, source_kind, title, quota_bytes, metadata)
       VALUES ($1, $2, 'AUDIO', 'PROCESSING', 'CANONICAL', 'CLIP', $3, $4, $5::jsonb)`,
      [childAssetId, ownerId, input.title, reservation.toString(), JSON.stringify({ parentAssetId, startMs: input.startMs, endMs: input.endMs })],
    );
    await client.query(
      "INSERT INTO station_media_allocations (station_id, media_asset_id) VALUES ($1, $2)",
      [input.stationId, childAssetId],
    );
    await client.query(
      `INSERT INTO media_asset_provenance (media_asset_id, source_kind, parent_media_asset_id, details)
       VALUES ($1, 'CLIP', $2, $3::jsonb)`,
      [childAssetId, parentAssetId, JSON.stringify({ startMs: input.startMs, endMs: input.endMs })],
    );
    await client.query(
      `INSERT INTO studio_asset_clips
         (id, owner_id, parent_media_asset_id, child_media_asset_id, clip_request_id, start_ms, end_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clipId, ownerId, parentAssetId, childAssetId, input.idempotencyKey, input.startMs, input.endMs],
    );
    await client.query(
      `INSERT INTO media_processing_jobs
         (id, media_asset_id, job_type, idempotency_key, status, max_attempts, payload)
       VALUES ($1, $2, 'MATERIALIZE_CLIP', $3, 'QUEUED', 3, $4::jsonb)`,
      [jobId, childAssetId, clipId, JSON.stringify({ clipId })],
    );
    return { assetId: childAssetId, jobId, created: true };
  });
  if (result.jobId) await getMediaProcessingQueue().add("materialize-media-clip", { processingJobId: result.jobId }, { jobId: `media-processing-${result.jobId}` }).catch(() => undefined);
  return result;
}
