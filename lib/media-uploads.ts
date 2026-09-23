import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { getMediaProcessingQueue } from "@/lib/queue";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { readBoundedUploadBody } from "@/lib/upload-body";
import { chunkCountForSize, chunkSizeForIndex, UPLOAD_CHUNK_SIZE_BYTES, validateChunkLength } from "@/lib/upload-chunks";
import { assertStationStorageAvailable } from "@/lib/storage-quota";

export type OwnerMediaType = "AUDIO" | "VIDEO" | "IMAGE";

const rightsSchema = z.object({
  basis: z.enum(["OWNER", "LICENSED", "PUBLIC_DOMAIN", "PERMISSION", "OTHER"]),
  statement: z.string().trim().min(1).max(4000),
  territories: z.array(z.string().trim().min(1).max(80)).max(250).default([]),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  evidence: z.record(z.string(), z.unknown()).default({}),
}).strict().refine(
  (rights) => !rights.validFrom || !rights.validUntil || new Date(rights.validUntil) > new Date(rights.validFrom),
  { message: "Rights validity must end after it begins.", path: ["validUntil"] },
);

export const initiateOwnerMediaUploadSchema = z.object({
  stationId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  mediaType: z.enum(["AUDIO", "VIDEO", "IMAGE"]),
  filename: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  rights: rightsSchema,
}).strict();

type InitiateInput = z.infer<typeof initiateOwnerMediaUploadSchema>;

type UploadSessionRow = {
  id: string;
  media_asset_id: string;
  owner_id: string;
  station_id: string;
  media_type: OwnerMediaType;
  asset_status: string;
  original_file_name: string | null;
  mime_type: string | null;
  quota_bytes: string;
  status: string;
  object_key: string;
  expected_bytes: string;
  received_bytes: string;
  part_size_bytes: string;
  expected_parts: number;
  checksum_sha256: string | null;
  expires_at: Date;
};

type UploadPartRow = {
  part_number: number;
  size_bytes: string;
  etag: string;
  checksum_sha256: string | null;
};

export type OwnerMediaUploadReservation = {
  uploadId: string;
  mediaAssetId: string;
  status: string;
  chunkSize: number;
  chunkCount: number;
  expiresAt: string;
  created: boolean;
};

const acceptedDeclarations: Record<OwnerMediaType, { mimes: Set<string>; extensions: Set<string> }> = {
  AUDIO: {
    mimes: new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/x-aac", "audio/wav", "audio/x-wav", "audio/vnd.wave", "audio/flac", "audio/x-flac"]),
    extensions: new Set(["mp3", "m4a", "aac", "wav", "flac"]),
  },
  VIDEO: {
    mimes: new Set(["video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/x-msvideo", "video/mpeg"]),
    extensions: new Set(["mp4", "mov", "mkv", "webm", "avi", "mpeg", "mpg", "m4v"]),
  },
  IMAGE: {
    mimes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    extensions: new Set(["jpg", "jpeg", "png", "webp", "gif"]),
  },
};

function cleanFilename(value: string): string {
  return value.replace(/[\\/\u0000-\u001F\u007F]/g, "_").slice(0, 512);
}

function cleanMime(value: string): string {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function defaultTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 240) || "Untitled media";
}

function validateDeclaration(mediaType: OwnerMediaType, filename: string, mimeType: string, size: number): void {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const accepted = acceptedDeclarations[mediaType];
  if (!accepted.mimes.has(mimeType) || !accepted.extensions.has(extension)) {
    throw new HttpError(400, `The declared file is not a supported ${mediaType.toLowerCase()} upload.`, "INVALID_UPLOAD");
  }
  if (size > env().MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "The media file exceeds the upload limit.", "UPLOAD_TOO_LARGE");
  }
}

function assertActiveUpload(row: UploadSessionRow | undefined): UploadSessionRow {
  if (!row) throw new HttpError(404, "Media upload not found.", "NOT_FOUND");
  if (!Number.isSafeInteger(Number(row.expected_bytes)) || Number(row.expected_bytes) <= 0) {
    throw new HttpError(409, "The upload reservation is invalid.", "INVALID_UPLOAD_RESERVATION");
  }
  if (!Number.isSafeInteger(row.expected_parts) || row.expected_parts <= 0 || Number(row.part_size_bytes) !== UPLOAD_CHUNK_SIZE_BYTES) {
    throw new HttpError(409, "The upload part layout is invalid.", "INVALID_UPLOAD_RESERVATION");
  }
  if (row.object_key !== ownerMediaUploadPrefix(row.owner_id, row.media_asset_id, row.id)) {
    throw new HttpError(409, "The upload storage prefix is invalid.", "INVALID_UPLOAD_RESERVATION");
  }
  if (!["INITIATED", "UPLOADING"].includes(row.status)) {
    throw new HttpError(409, "This upload is no longer accepting parts.", "UPLOAD_NOT_ACTIVE");
  }
  if (row.expires_at.getTime() <= Date.now()) throw new HttpError(409, "This upload has expired.", "UPLOAD_EXPIRED");
  return row;
}

function presentReservation(row: UploadSessionRow, created: boolean): OwnerMediaUploadReservation {
  return {
    uploadId: row.id,
    mediaAssetId: row.media_asset_id,
    status: row.status,
    chunkSize: Number(row.part_size_bytes),
    chunkCount: row.expected_parts,
    expiresAt: row.expires_at.toISOString(),
    created,
  };
}

function sameReservation(row: UploadSessionRow, input: InitiateInput, filename: string, mimeType: string): boolean {
  return row.station_id === input.stationId
    && row.media_type === input.mediaType
    && row.original_file_name === filename
    && row.mime_type === mimeType
    && row.expected_bytes === String(input.size)
    && row.checksum_sha256 === (input.checksumSha256 ?? null);
}

async function lockOwner(client: PoolClient, ownerId: string): Promise<void> {
  const owner = await client.query(
    `SELECT id FROM users WHERE id = $1 AND disabled_at IS NULL
       AND deletion_requested_at IS NULL AND anonymized_at IS NULL FOR UPDATE`,
    [ownerId],
  );
  if (!owner.rowCount) throw new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE");
}

async function ownerUploadByIdempotency(client: PoolClient, ownerId: string, idempotencyKey: string): Promise<UploadSessionRow | undefined> {
  const result = await client.query<UploadSessionRow>(
     `SELECT upload.id, upload.media_asset_id, asset.owner_id,
             COALESCE((asset.metadata->>'stationId')::uuid,
               (SELECT station_id FROM station_media_allocations WHERE media_asset_id = asset.id ORDER BY station_id LIMIT 1)) AS station_id,
             asset.media_type,
            asset.status AS asset_status, asset.original_file_name, asset.mime_type,
            asset.quota_bytes::text, upload.status, upload.object_key,
            upload.expected_bytes::text, upload.received_bytes::text,
            upload.part_size_bytes::text, upload.expected_parts,
            upload.checksum_sha256, upload.expires_at
       FROM media_upload_sessions upload
       JOIN media_assets asset ON asset.id = upload.media_asset_id
      WHERE asset.owner_id = $1 AND upload.idempotency_key = $2
      LIMIT 1`,
    [ownerId, idempotencyKey],
  );
  return result.rows[0];
}

async function lockedOwnerUpload(client: PoolClient, ownerId: string, uploadId: string): Promise<UploadSessionRow | undefined> {
  const result = await client.query<UploadSessionRow>(
     `SELECT upload.id, upload.media_asset_id, asset.owner_id,
             COALESCE((asset.metadata->>'stationId')::uuid,
               (SELECT station_id FROM station_media_allocations WHERE media_asset_id = asset.id ORDER BY station_id LIMIT 1)) AS station_id,
             asset.media_type,
            asset.status AS asset_status, asset.original_file_name, asset.mime_type,
            asset.quota_bytes::text, upload.status, upload.object_key,
            upload.expected_bytes::text, upload.received_bytes::text,
            upload.part_size_bytes::text, upload.expected_parts,
            upload.checksum_sha256, upload.expires_at
       FROM media_upload_sessions upload
       JOIN media_assets asset ON asset.id = upload.media_asset_id
      WHERE upload.id = $1 AND asset.owner_id = $2
      FOR UPDATE OF upload, asset`,
    [uploadId, ownerId],
  );
  return result.rows[0];
}

export function ownerMediaUploadPrefix(ownerId: string, mediaAssetId: string, uploadId: string): string {
  return `owners/${ownerId}/media/${mediaAssetId}/uploads/${uploadId}/parts/`;
}

export function ownerMediaPartKey(prefix: string, partNumber: number): string {
  if (!/^owners\/[^/]+\/media\/[^/]+\/uploads\/[^/]+\/parts\/$/.test(prefix)) {
    throw new RangeError("The media upload prefix is invalid.");
  }
  if (!Number.isSafeInteger(partNumber) || partNumber <= 0 || partNumber >= 100_000_000) {
    throw new RangeError("The media upload part number is invalid.");
  }
  return `${prefix}${String(partNumber).padStart(8, "0")}.part`;
}

export function parseOwnerMediaPartNumber(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new HttpError(400, "The part number must be a positive integer.", "INVALID_PART_NUMBER");
  const partNumber = Number(value);
  if (!Number.isSafeInteger(partNumber)) throw new HttpError(400, "The part number is invalid.", "INVALID_PART_NUMBER");
  return partNumber;
}

export async function initiateOwnerMediaUpload(ownerId: string, input: InitiateInput): Promise<OwnerMediaUploadReservation> {
  const filename = cleanFilename(input.filename);
  const mimeType = cleanMime(input.mimeType);
  validateDeclaration(input.mediaType, filename, mimeType, input.size);

  return transaction(async (client) => {
    await lockOwner(client, ownerId);
    const station = await client.query(
      "SELECT id FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE",
      [input.stationId, ownerId],
    );
    if (!station.rowCount) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    const existing = await ownerUploadByIdempotency(client, ownerId, input.idempotencyKey);
    if (existing) {
      if (!sameReservation(existing, input, filename, mimeType)) {
        throw new HttpError(409, "The idempotency key is already bound to a different upload.", "IDEMPOTENCY_CONFLICT");
      }
      return presentReservation(existing, false);
    }

    await assertStationStorageAvailable(client, input.stationId, BigInt(input.size));

    const mediaAssetId = randomUUID();
    const uploadId = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const prefix = ownerMediaUploadPrefix(ownerId, mediaAssetId, uploadId);
    const expectedParts = chunkCountForSize(input.size);
    await client.query(
      `INSERT INTO media_assets
       (id, owner_id, media_type, status, storage_authority, source_kind, title,
        original_file_name, mime_type, quota_bytes, metadata)
       VALUES ($1, $2, $3, 'UPLOADING', 'CANONICAL', 'UPLOAD', $4, $5, $6, $7, $8::jsonb)`,
      [mediaAssetId, ownerId, input.mediaType, input.title ?? defaultTitle(filename), filename, mimeType, input.size, JSON.stringify({ declaredMimeType: mimeType, stationId: input.stationId })],
    );
    await client.query(
      "INSERT INTO station_media_allocations (station_id, media_asset_id) VALUES ($1, $2)",
      [input.stationId, mediaAssetId],
    );
    await client.query(
      `INSERT INTO media_rights_attestations
       (media_asset_id, attestation_version, rights_basis, statement, territories,
        valid_from, valid_until, evidence, attested_by_user_id)
       VALUES ($1, 1, $2, $3, $4::text[], $5, $6, $7::jsonb, $8)`,
      [mediaAssetId, input.rights.basis, input.rights.statement, input.rights.territories, input.rights.validFrom ?? null, input.rights.validUntil ?? null, JSON.stringify(input.rights.evidence), ownerId],
    );
    const inserted = await client.query<UploadSessionRow>(
      `INSERT INTO media_upload_sessions
       (id, media_asset_id, initiated_by_user_id, idempotency_key, status,
        storage_authority, object_key, expected_bytes, part_size_bytes,
        expected_parts, checksum_sha256, expires_at)
       VALUES ($1, $2, $3, $4, 'INITIATED', 'CANONICAL', $5, $6, $7, $8, $9, $10)
        RETURNING id, media_asset_id, $3::uuid AS owner_id, $14::uuid AS station_id, $11::media_asset_type AS media_type,
         'UPLOADING'::text AS asset_status, $12::text AS original_file_name,
         $13::text AS mime_type, $6::bigint::text AS quota_bytes, status, object_key,
         expected_bytes::text, received_bytes::text, part_size_bytes::text,
         expected_parts, checksum_sha256, expires_at`,
      [uploadId, mediaAssetId, ownerId, input.idempotencyKey, prefix, input.size, UPLOAD_CHUNK_SIZE_BYTES, expectedParts, input.checksumSha256 ?? null, expiresAt, input.mediaType, filename, mimeType, input.stationId],
    );
    return presentReservation(inserted.rows[0], true);
  });
}

export async function writeOwnerMediaPart(
  ownerId: string,
  uploadId: string,
  partNumber: number,
  request: Request,
): Promise<{ partNumber: number; size: number; etag: string; checksumSha256: string }> {
  const initial = await transaction((client) => lockedOwnerUpload(client, ownerId, uploadId));
  const upload = assertActiveUpload(initial);
  if (partNumber > upload.expected_parts) throw new HttpError(400, "The part number is outside this upload's range.", "PART_OUT_OF_RANGE");
  const expectedSize = chunkSizeForIndex(Number(upload.expected_bytes), partNumber - 1);
  const length = validateChunkLength(request.headers.get("content-length"), expectedSize);
  if (!length.ok) {
    if (length.reason === "too-large") throw new HttpError(413, "The part exceeds the 512 KiB limit.", "PART_TOO_LARGE");
    throw new HttpError(400, "Content-Length must exactly match the expected part size.", "PART_SIZE_MISMATCH");
  }
  const body = await readBoundedUploadBody(request.body, expectedSize, UPLOAD_CHUNK_SIZE_BYTES);
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  await ensureBucket();

  return transaction(async (client) => {
    const current = assertActiveUpload(await lockedOwnerUpload(client, ownerId, uploadId));
    if (current.object_key !== upload.object_key || current.expected_bytes !== upload.expected_bytes || current.expected_parts !== upload.expected_parts) {
      throw new HttpError(409, "The upload changed while this part was being sent.", "UPLOAD_CHANGED");
    }
    const objectKey = ownerMediaPartKey(current.object_key, partNumber);
    const stored = await storage.putObject(bucket, objectKey, body, body.length, { "Content-Type": "application/octet-stream" });
    const etag = stored.etag || checksumSha256;
    await client.query(
      `INSERT INTO media_upload_parts
       (upload_session_id, part_number, size_bytes, etag, checksum_sha256)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (upload_session_id, part_number) DO UPDATE
         SET size_bytes = EXCLUDED.size_bytes, etag = EXCLUDED.etag,
             checksum_sha256 = EXCLUDED.checksum_sha256, uploaded_at = now()`,
      [uploadId, partNumber, body.length, etag, checksumSha256],
    );
    await client.query(
      `UPDATE media_upload_sessions upload SET status = 'UPLOADING',
              received_bytes = parts.received_bytes, updated_at = now()
         FROM (SELECT COALESCE(sum(size_bytes), 0)::bigint AS received_bytes
                 FROM media_upload_parts WHERE upload_session_id = $1) parts
        WHERE upload.id = $1`,
      [uploadId],
    );
    return { partNumber, size: body.length, etag, checksumSha256 };
  });
}

function verifyReceipts(upload: UploadSessionRow, parts: UploadPartRow[]): void {
  if (parts.length !== upload.expected_parts) {
    throw new HttpError(409, "The upload is missing one or more part receipts.", "INCOMPLETE_UPLOAD");
  }
  let totalBytes = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const expectedNumber = index + 1;
    const expectedSize = chunkSizeForIndex(Number(upload.expected_bytes), index);
    if (part.part_number !== expectedNumber || Number(part.size_bytes) !== expectedSize || !part.checksum_sha256) {
      throw new HttpError(409, "An upload part receipt is invalid.", "INCOMPLETE_UPLOAD");
    }
    totalBytes += Number(part.size_bytes);
  }
  if (totalBytes !== Number(upload.expected_bytes)) {
    throw new HttpError(409, "The upload part receipts do not match the reserved size.", "INCOMPLETE_UPLOAD");
  }
}

async function verifyStoredParts(upload: UploadSessionRow, parts: UploadPartRow[]): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(12, parts.length) }, async () => {
    while (cursor < parts.length) {
      const part = parts[cursor++];
      let stat: Awaited<ReturnType<typeof storage.statObject>>;
      try {
        stat = await storage.statObject(bucket, ownerMediaPartKey(upload.object_key, part.part_number));
      } catch {
        throw new HttpError(409, "A receipted upload part is missing from storage.", "INCOMPLETE_UPLOAD");
      }
      if (stat.size !== Number(part.size_bytes) || (stat.etag && stat.etag !== part.etag)) {
        throw new HttpError(409, "A stored upload part no longer matches its receipt.", "INCOMPLETE_UPLOAD");
      }
    }
  }));
}

export async function completeOwnerMediaUpload(
  ownerId: string,
  uploadId: string,
): Promise<{ uploadId: string; mediaAssetId: string; processingJobId: string; status: "PROCESSING" }> {
  await ensureBucket();
  const completed = await transaction(async (client) => {
    const upload = await lockedOwnerUpload(client, ownerId, uploadId);
    if (!upload) throw new HttpError(404, "Media upload not found.", "NOT_FOUND");
    if (upload.status === "COMPLETE") {
      const existingJob = await client.query<{ id: string }>(
        "SELECT id FROM media_processing_jobs WHERE media_asset_id = $1 AND job_type = 'PROCESS_UPLOAD' AND idempotency_key = $2",
        [upload.media_asset_id, upload.id],
      );
      if (!existingJob.rows[0]) throw new HttpError(409, "The completed upload has no processing job.", "PROCESSING_JOB_MISSING");
      return { upload, processingJobId: existingJob.rows[0].id };
    }
    assertActiveUpload(upload);
    const receipts = await client.query<UploadPartRow>(
      `SELECT part_number, size_bytes::text, etag, checksum_sha256
         FROM media_upload_parts WHERE upload_session_id = $1 ORDER BY part_number`,
      [uploadId],
    );
    verifyReceipts(upload, receipts.rows);
    await verifyStoredParts(upload, receipts.rows);

    const processingJobId = randomUUID();
    const job = await client.query<{ id: string }>(
      `INSERT INTO media_processing_jobs
       (id, media_asset_id, job_type, idempotency_key, status, max_attempts, payload)
       VALUES ($1, $2, 'PROCESS_UPLOAD', $3, 'QUEUED', 3, $4::jsonb)
       ON CONFLICT (media_asset_id, job_type, idempotency_key) DO UPDATE
         SET updated_at = media_processing_jobs.updated_at
       RETURNING id`,
      [processingJobId, upload.media_asset_id, upload.id, JSON.stringify({ uploadSessionId: upload.id })],
    );
    await client.query(
      `UPDATE media_upload_sessions SET status = 'COMPLETE', received_bytes = expected_bytes,
              completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('INITIATED', 'UPLOADING')`,
      [upload.id],
    );
    const asset = await client.query(
      `UPDATE media_assets SET status = 'PROCESSING', version = version + 1, updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND status = 'UPLOADING' RETURNING id`,
      [upload.media_asset_id, ownerId],
    );
    if (!asset.rowCount) throw new HttpError(409, "The media asset is no longer processable.", "MEDIA_STATUS_CONFLICT");
    return { upload, processingJobId: job.rows[0].id };
  });

  try {
    await getMediaProcessingQueue().add(
      "process-owner-media",
      { processingJobId: completed.processingJobId },
      { jobId: `media-processing-${completed.processingJobId}` },
    );
  } catch (error) {
    console.error(`Media job ${completed.processingJobId} is durable but could not be dispatched:`, error);
  }
  return {
    uploadId: completed.upload.id,
    mediaAssetId: completed.upload.media_asset_id,
    processingJobId: completed.processingJobId,
    status: "PROCESSING",
  };
}

export async function abortOwnerMediaUpload(
  ownerId: string,
  uploadId: string,
): Promise<{ uploadId: string; mediaAssetId: string; status: "ABORTED" }> {
  return transaction(async (client) => {
    const upload = await lockedOwnerUpload(client, ownerId, uploadId);
    if (!upload) throw new HttpError(404, "Media upload not found.", "NOT_FOUND");
    if (upload.status === "COMPLETE") throw new HttpError(409, "A completed upload cannot be aborted.", "UPLOAD_COMPLETE");
    if (upload.status !== "ABORTED") {
      if (!["INITIATED", "UPLOADING", "EXPIRED", "FAILED"].includes(upload.status)) {
        throw new HttpError(409, "This upload cannot be aborted from its current state.", "UPLOAD_STATUS_CONFLICT");
      }
      await client.query(
        `UPDATE media_upload_sessions SET status = 'ABORTED', aborted_at = COALESCE(aborted_at, now()),
                error_detail = COALESCE(error_detail, 'Upload aborted by owner.'), updated_at = now()
          WHERE id = $1`,
        [upload.id],
      );
      await client.query(
        `UPDATE media_assets SET status = 'ARCHIVED', archived_at = COALESCE(archived_at, now()),
                version = version + 1, updated_at = now()
          WHERE id = $1 AND owner_id = $2 AND status IN ('PENDING_UPLOAD', 'UPLOADING', 'FAILED')`,
        [upload.media_asset_id, ownerId],
      );
      await client.query(
        `INSERT INTO media_gc_tasks
         (owner_id, media_asset_id, task_kind, storage_authority, object_key, reason)
         VALUES ($1, $2, 'DELETE_PREFIX', 'CANONICAL', $3, 'owner aborted canonical upload')
         ON CONFLICT (storage_authority, object_key) DO NOTHING`,
        [ownerId, upload.media_asset_id, upload.object_key],
      );
    }
    return { uploadId: upload.id, mediaAssetId: upload.media_asset_id, status: "ABORTED" };
  });
}
