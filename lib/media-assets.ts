import path from "node:path";
import type { PoolClient } from "pg";
import { z } from "zod";
import { query, transaction } from "@/lib/db";
import { STATION_STORAGE_LIMIT_BYTES } from "@/lib/storage-quota";
import { HttpError } from "@/lib/http";

export type MediaAssetType = "AUDIO" | "VIDEO" | "IMAGE";
export type MediaAssetStatus = "PENDING_UPLOAD" | "UPLOADING" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED" | "ARCHIVED" | "DELETING" | "DELETED";

type MediaAssetRow = {
  id: string;
  media_type: MediaAssetType;
  status: MediaAssetStatus;
  archived_from_status: MediaAssetStatus | null;
  version: string;
  title: string;
  original_file_name: string | null;
  mime_type: string | null;
  quota_bytes: string;
  metadata: Record<string, unknown>;
  duration_ms: string | null;
  width: number | null;
  height: number | null;
  created_at: Date;
  updated_at: Date;
  variant_id: string | null;
  variant_role: string | null;
  variant_mime_type: string | null;
  variant_object_key: string | null;
};

export type MediaAssetSummary = {
  id: string;
  type: MediaAssetType;
  status: MediaAssetStatus;
  version: number;
  title: string;
  originalFileName: string | null;
  mimeType: string | null;
  quotaBytes: string;
  metadata: Record<string, unknown>;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  preview: { variantId: string; role: string; mimeType: string | null; url: string } | null;
};

export const mediaAssetListQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  type: z.enum(["ALL", "AUDIO", "VIDEO", "IMAGE"]).default("ALL"),
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  limit: z.coerce.number().int().min(1).max(100).default(60),
}).strict();

export const mediaAssetUpdateSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  archived: z.boolean().optional(),
  expectedVersion: z.number().int().positive(),
}).strict().refine((value) => value.title !== undefined || value.archived !== undefined, "Supply at least one media change.");

export function ownerMediaVariantPath(assetId: string, variantId: string, objectKey: string): string {
  return `/api/media/assets/${assetId}/variants/${variantId}/${encodeURIComponent(path.posix.basename(objectKey))}`;
}

function present(row: MediaAssetRow): MediaAssetSummary {
  return {
    id: row.id,
    type: row.media_type,
    status: row.status,
    version: Number(row.version),
    title: row.title,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    quotaBytes: row.quota_bytes,
    metadata: row.metadata ?? {},
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    width: row.width,
    height: row.height,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    preview: row.variant_id && row.variant_object_key ? {
      variantId: row.variant_id,
      role: row.variant_role ?? "SOURCE",
      mimeType: row.variant_mime_type,
      url: ownerMediaVariantPath(row.id, row.variant_id, row.variant_object_key),
    } : null,
  };
}

const assetSelect = `SELECT asset.id, asset.media_type, asset.status, asset.version::text,
       asset.archived_from_status,
       asset.title, asset.original_file_name, asset.mime_type, asset.quota_bytes::text,
       asset.metadata, asset.duration_ms::text, asset.width, asset.height,
       asset.created_at, asset.updated_at, preview.id AS variant_id,
       preview.role::text AS variant_role, preview.mime_type AS variant_mime_type,
       preview.object_key AS variant_object_key
  FROM media_assets asset
  LEFT JOIN LATERAL (
    SELECT variant.id, variant.role, variant.mime_type, variant.object_key
      FROM media_asset_variants variant
     WHERE variant.media_asset_id = asset.id AND variant.status = 'READY'
     ORDER BY CASE
       WHEN asset.media_type = 'AUDIO' AND variant.role = 'MEZZANINE' THEN 0
       WHEN asset.media_type = 'VIDEO' AND variant.role = 'HLS_MANIFEST' THEN 0
       WHEN asset.media_type = 'IMAGE' AND variant.role IN ('POSTER', 'PROXY', 'SOURCE') THEN 0
       WHEN variant.role = 'SOURCE' THEN 1 ELSE 2 END,
       variant.generation DESC
     LIMIT 1
  ) preview ON true`;

export async function listOwnerMediaAssets(
  userId: string,
  input: z.infer<typeof mediaAssetListQuerySchema>,
): Promise<MediaAssetSummary[]> {
  const values: unknown[] = [userId];
  const conditions = ["asset.owner_id = $1"];
  if (input.type !== "ALL") { values.push(input.type); conditions.push(`asset.media_type = $${values.length}`); }
  if (input.status === "ACTIVE") conditions.push("asset.status NOT IN ('ARCHIVED', 'DELETING', 'DELETED')");
  if (input.status === "ARCHIVED") conditions.push("asset.status = 'ARCHIVED'");
  if (input.q) { values.push(`%${input.q}%`); conditions.push(`(asset.title ILIKE $${values.length} OR asset.original_file_name ILIKE $${values.length})`); }
  values.push(input.limit);
  const result = await query<MediaAssetRow>(
    `${assetSelect} WHERE ${conditions.join(" AND ")}
      ORDER BY asset.updated_at DESC, asset.id LIMIT $${values.length}`,
    values,
  );
  return result.rows.map(present);
}

export async function ownerMediaAsset(assetId: string, userId: string): Promise<MediaAssetSummary> {
  const result = await query<MediaAssetRow>(`${assetSelect} WHERE asset.id = $1 AND asset.owner_id = $2`, [assetId, userId]);
  if (!result.rows[0]) throw new HttpError(404, "Media asset not found.", "NOT_FOUND");
  return present(result.rows[0]);
}

export async function stationMediaQuota(stationId: string, userId: string): Promise<{ stationId: string; usedBytes: string; limitBytes: number; overLimit: boolean }> {
  const result = await query<{ quota_bytes: string }>(
    `SELECT usage.quota_bytes::text
       FROM stations station
       JOIN station_media_storage_usage_v usage ON usage.station_id = station.id
      WHERE station.id = $1 AND station.owner_id = $2 AND station.deleted_at IS NULL`,
    [stationId, userId],
  );
  if (!result.rows[0]) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  const usedBytes = result.rows[0].quota_bytes;
  return { stationId, usedBytes, limitBytes: STATION_STORAGE_LIMIT_BYTES, overLimit: BigInt(usedBytes) > BigInt(STATION_STORAGE_LIMIT_BYTES) };
}

export async function updateOwnerMediaAsset(assetId: string, userId: string, input: z.infer<typeof mediaAssetUpdateSchema>): Promise<MediaAssetSummary> {
  await transaction(async (client) => {
    const current = await client.query<{ version: string; status: MediaAssetStatus; archived_from_status: MediaAssetStatus | null }>(
      "SELECT version::text, status, archived_from_status FROM media_assets WHERE id = $1 AND owner_id = $2 FOR UPDATE",
      [assetId, userId],
    );
    if (!current.rows[0]) throw new HttpError(404, "Media asset not found.", "NOT_FOUND");
    if (Number(current.rows[0].version) !== input.expectedVersion) throw new HttpError(409, "Media changed. Refresh and try again.", "MEDIA_VERSION_CONFLICT");
    if (input.archived === false && current.rows[0].status !== "ARCHIVED") throw new HttpError(409, "Only archived media can be restored.", "MEDIA_STATUS_CONFLICT");
    if (input.archived === true && !(["READY", "PARTIAL", "FAILED"] as MediaAssetStatus[]).includes(current.rows[0].status)) {
      throw new HttpError(409, "Only terminal media can be archived.", "MEDIA_STATUS_CONFLICT");
    }
    const status = input.archived === true
      ? "ARCHIVED"
      : input.archived === false
        ? current.rows[0].archived_from_status
        : null;
    if (input.archived === false && !status) throw new HttpError(409, "Archived media has no restorable status.", "MEDIA_STATUS_CONFLICT");
    const updated = await client.query(
      `UPDATE media_assets SET title = COALESCE($1, title),
               status = COALESCE($2::media_asset_status, status),
               archived_from_status = CASE
                 WHEN $3::boolean IS TRUE THEN status
                 WHEN $3::boolean IS FALSE THEN NULL
                 ELSE archived_from_status END,
               archived_at = CASE WHEN $3::boolean IS TRUE THEN now() WHEN $3::boolean IS FALSE THEN NULL ELSE archived_at END,
               version = version + 1, updated_at = now()
        WHERE id = $4 AND owner_id = $5 AND version = $6
        RETURNING id`,
      [input.title ?? null, status, input.archived ?? null, assetId, userId, input.expectedVersion],
    );
    if (!updated.rowCount) throw new HttpError(409, "Media changed. Refresh and try again.", "MEDIA_VERSION_CONFLICT");
  });
  return ownerMediaAsset(assetId, userId);
}

export async function ownerVariantObject(
  assetId: string,
  variantId: string,
  userId: string,
  requestedPath: string[],
): Promise<string> {
  const result = await query<{ object_key: string }>(
    `SELECT variant.object_key FROM media_asset_variants variant
      JOIN media_assets asset ON asset.id = variant.media_asset_id
     WHERE variant.id = $1 AND variant.media_asset_id = $2 AND asset.owner_id = $3
       AND variant.status = 'READY' AND asset.status NOT IN ('DELETING', 'DELETED')`,
    [variantId, assetId, userId],
  );
  const entryKey = result.rows[0]?.object_key;
  if (!entryKey) throw new HttpError(404, "Media variant not found.", "NOT_FOUND");
  const clean = requestedPath.map((segment) => decodeURIComponent(segment));
  if (!clean.length || clean.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    throw new HttpError(404, "Media path not found.", "NOT_FOUND");
  }
  const base = path.posix.dirname(entryKey);
  const requested = clean.join("/");
  const entryName = path.posix.basename(entryKey);
  const key = requested === entryName ? entryKey : path.posix.join(base, requested);
  if (key !== entryKey && !key.startsWith(`${base}/`)) throw new HttpError(404, "Media path not found.", "NOT_FOUND");
  return key;
}

export async function validateOwnerAssetReferences(
  client: PoolClient,
  userId: string,
  references: Array<{ key: string; assetId: string; expectedType: MediaAssetType }>,
): Promise<Array<{ key: string; assetId: string; variantId: string }>> {
  if (!references.length) return [];
  const ids = [...new Set(references.map((reference) => reference.assetId))];
  const result = await client.query<{ id: string; media_type: MediaAssetType; variant_id: string | null }>(
    `SELECT asset.id, asset.media_type, variant.id AS variant_id
       FROM media_assets asset
       LEFT JOIN LATERAL (
         SELECT id FROM media_asset_variants
          WHERE media_asset_id = asset.id AND status = 'READY'
            AND role = CASE asset.media_type
              WHEN 'AUDIO' THEN 'MEZZANINE'::media_asset_variant_role
              WHEN 'VIDEO' THEN 'HLS_MANIFEST'::media_asset_variant_role
              ELSE 'SOURCE'::media_asset_variant_role END
          ORDER BY generation DESC LIMIT 1
       ) variant ON true
      WHERE asset.owner_id = $1 AND asset.id = ANY($2::uuid[])
        AND asset.status IN ('READY', 'PARTIAL', 'ARCHIVED')`,
    [userId, ids],
  );
  const available = new Map(result.rows.map((row) => [row.id, row]));
  return references.map((reference) => {
    const asset = available.get(reference.assetId);
    if (!asset || asset.media_type !== reference.expectedType || !asset.variant_id) {
      throw new HttpError(409, `Project media ${reference.key} is unavailable or incompatible.`, "STUDIO_ASSET_UNAVAILABLE");
    }
    return { key: reference.key, assetId: reference.assetId, variantId: asset.variant_id };
  });
}
