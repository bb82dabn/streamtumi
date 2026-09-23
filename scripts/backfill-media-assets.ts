import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { db, query, transaction } from "@/lib/db";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 10_000;

type MediaTable = "media_assets" | "media_asset_variants" | "media_asset_provenance";
export type MediaSchema = Record<MediaTable, ReadonlySet<string>>;
type BackfillKind = "video" | "radioTrack";

type VideoRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  status: string;
  source_key: string;
  source_file_name: string;
  mime_type: string;
  size_bytes: string;
  duration_ms: string | null;
  width: number | null;
  height: number | null;
  hls_key: string | null;
  thumbnail_key: string | null;
  captions_key: string | null;
  processing_progress: number;
  processing_attempts: number;
  processing_error: string | null;
  processing_started_at: Date | null;
  processing_finished_at: Date | null;
  processing_duration_ms: string | null;
  processing_encoder: string | null;
  processing_rendition_count: number | null;
  source_kind: string;
  normalized_source_url: string | null;
  external_source_id: string | null;
  ingestion_status: string | null;
  ingestion_error: string | null;
  ingestion_request_id: string | null;
  rights_attested_at: Date | null;
  rights_attested_by: string | null;
  rights_attestation_version: number | null;
  created_at: Date;
  updated_at: Date;
};

type RadioTrackRow = {
  id: string;
  owner_id: string;
  upload_request_id: string;
  title: string;
  artist: string;
  album: string;
  status: string;
  source_key: string;
  source_file_name: string;
  mime_type: string;
  size_bytes: string;
  duration_ms: string | null;
  source_codec: string | null;
  source_sample_rate: number | null;
  source_channels: number | null;
  integrated_lufs: number | null;
  true_peak_db: number | null;
  loudness_range_lu: number | null;
  mezzanine_key: string | null;
  artwork_key: string | null;
  audio_hls_key: string | null;
  audio_hls_segment_ms: number;
  processing_progress: number;
  processing_attempts: number;
  processing_error: string | null;
  processing_started_at: Date | null;
  processing_finished_at: Date | null;
  processing_duration_ms: string | null;
  metadata_edited_at: Date | null;
  rights_attested_at: Date;
  rights_attested_by: string | null;
  rights_attestation_version: number;
  created_at: Date;
  updated_at: Date;
};

type Variant = {
  kind: "SOURCE" | "HLS" | "THUMBNAIL" | "CAPTIONS" | "MEZZANINE" | "ARTWORK" | "AUDIO_HLS";
  objectKey: string | null;
  mimeType: string | null;
  sizeBytes?: string;
  metadata?: Record<string, unknown>;
};

export type MediaBackfillResult = {
  videos: number;
  radioTracks: number;
};

function positiveBatchSize(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error("Batch size must be a positive integer.");
  const parsed = Number(value);
  if (parsed < 1 || parsed > MAX_BATCH_SIZE) {
    throw new Error(`Batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return parsed;
}

export function parseBatchSize(argv: string[]): number {
  if (argv.length === 0) return DEFAULT_BATCH_SIZE;
  if (argv.length === 1 && !argv[0].startsWith("--")) return positiveBatchSize(argv[0]);
  if (argv.length === 1 && argv[0].startsWith("--batch-size=")) {
    return positiveBatchSize(argv[0].slice("--batch-size=".length));
  }
  if (argv.length === 2 && argv[0] === "--batch-size") return positiveBatchSize(argv[1]);
  throw new Error("Usage: npm run media:backfill -- [--batch-size] <positive integer>");
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function firstColumn(columns: ReadonlySet<string>, candidates: string[], description: string): string {
  const column = candidates.find((candidate) => columns.has(candidate));
  if (!column) throw new Error(`sql/033 is missing the ${description} column.`);
  return column;
}

function assignFirst(
  target: Record<string, unknown>,
  columns: ReadonlySet<string>,
  candidates: string[],
  value: unknown,
  description?: string,
): void {
  const column = description
    ? firstColumn(columns, candidates, description)
    : candidates.find((candidate) => columns.has(candidate));
  if (column) target[column] = value;
}

function assignPresent(target: Record<string, unknown>, columns: ReadonlySet<string>, values: Record<string, unknown>): void {
  for (const [column, value] of Object.entries(values)) {
    if (columns.has(column)) target[column] = value;
  }
}

export async function loadMediaSchema(): Promise<MediaSchema> {
  const result = await query<{ table_name: MediaTable; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    [["media_assets", "media_asset_variants", "media_asset_provenance"]],
  );
  const schema: Record<MediaTable, Set<string>> = {
    media_assets: new Set(),
    media_asset_variants: new Set(),
    media_asset_provenance: new Set(),
  };
  for (const row of result.rows) schema[row.table_name]?.add(row.column_name);
  for (const [table, columns] of Object.entries(schema)) {
    if (columns.size === 0) throw new Error(`${table} is missing; apply sql/033 before running this backfill.`);
  }
  return schema;
}

async function insertRecord(
  client: PoolClient,
  table: MediaTable,
  columns: ReadonlySet<string>,
  record: Record<string, unknown>,
  returningId = false,
): Promise<string | null> {
  const entries = Object.entries(record).filter(([column, value]) => columns.has(column) && value !== undefined);
  if (entries.length === 0) throw new Error(`No compatible columns found for ${table}.`);
  const placeholders = entries.map((_entry, index) => `$${index + 1}`).join(", ");
  const result = await client.query<{ id: string }>(
    `INSERT INTO ${identifier(table)} (${entries.map(([column]) => identifier(column)).join(", ")})
     VALUES (${placeholders})${returningId ? " RETURNING id" : ""}`,
    entries.map(([, value]) => value),
  );
  return returningId ? result.rows[0]?.id ?? null : null;
}

function canonicalStatus(status: string): string {
  if (status === "QUEUED") return "PROCESSING";
  if (status === "REPLACED") return "ARCHIVED";
  return status;
}

function assetRecord(
  columns: ReadonlySet<string>,
  kind: "VIDEO" | "AUDIO",
  row: VideoRow | RadioTrackRow,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const status = canonicalStatus(row.status);
  const legacyKind = kind === "VIDEO" ? "LEGACY_VIDEO" : "LEGACY_RADIO_TRACK";
  const record: Record<string, unknown> = { id: randomUUID(), owner_id: row.owner_id };
  assignFirst(record, columns, ["media_type", "media_kind", "asset_kind", "kind"], kind, "media asset kind");
  assignPresent(record, columns, {
    title: row.title,
    status,
    storage_authority: legacyKind,
    source_kind: legacyKind,
    original_file_name: row.source_file_name,
    source_object_key: row.source_key,
    source_file_name: row.source_file_name,
    file_name: row.source_file_name,
    source_mime_type: row.mime_type,
    mime_type: row.mime_type,
    source_size_bytes: row.size_bytes,
    size_bytes: row.size_bytes,
    quota_bytes: row.size_bytes,
    duration_ms: row.duration_ms,
    audio_codec: "source_codec" in row ? row.source_codec : null,
    audio_sample_rate_hz: "source_sample_rate" in row ? row.source_sample_rate : null,
    audio_channels: "source_channels" in row ? row.source_channels : null,
    ready_at: status === "READY" ? row.updated_at : null,
    archived_at: status === "ARCHIVED" ? row.updated_at : null,
    processing_progress: row.processing_progress,
    processing_attempts: row.processing_attempts,
    processing_error: row.processing_error,
    processing_started_at: row.processing_started_at,
    processing_finished_at: row.processing_finished_at,
    processing_duration_ms: row.processing_duration_ms,
    metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  if ("description" in row) assignPresent(record, columns, { description: row.description, width: row.width, height: row.height });
  if ("artist" in row) assignPresent(record, columns, { artist: row.artist, album: row.album });
  return record;
}

async function insertVariant(
  client: PoolClient,
  schema: MediaSchema,
  mediaAssetId: string,
  variant: Variant,
  createdAt: Date,
  updatedAt: Date,
): Promise<string | null> {
  if (!variant.objectKey) return null;
  const columns = schema.media_asset_variants;
  const record: Record<string, unknown> = { id: randomUUID() };
  assignFirst(record, columns, ["media_asset_id", "asset_id"], mediaAssetId, "variant asset reference");
  const role = variant.kind === "HLS" || variant.kind === "AUDIO_HLS" ? "HLS_MANIFEST" : variant.kind;
  assignFirst(record, columns, ["role", "variant_kind", "kind"], role, "variant kind");
  assignFirst(record, columns, ["object_key", "storage_key", "media_key"], variant.objectKey, "variant object key");
  assignPresent(record, columns, {
    generation: 1,
    status: "READY",
    storage_authority: variant.metadata?.legacyKind,
    mime_type: variant.mimeType,
    size_bytes: variant.sizeBytes ?? "0",
    technical_metadata: variant.metadata,
    metadata: variant.metadata,
    ready_at: updatedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  });
  return insertRecord(client, "media_asset_variants", columns, record, true);
}

async function insertProvenance(
  client: PoolClient,
  schema: MediaSchema,
  mediaAssetId: string,
  sourceKind: string,
  row: VideoRow | RadioTrackRow,
  values: Record<string, unknown>,
): Promise<void> {
  const columns = schema.media_asset_provenance;
  const record: Record<string, unknown> = { id: randomUUID() };
  assignFirst(record, columns, ["media_asset_id", "asset_id"], mediaAssetId, "provenance asset reference");
  assignFirst(record, columns, ["source_kind", "kind"], sourceKind, "provenance source kind");
  assignPresent(record, columns, {
    ...values,
    rights_attested_at: row.rights_attested_at,
    rights_attested_by: row.rights_attested_by,
    rights_attestation_version: row.rights_attestation_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  await insertRecord(client, "media_asset_provenance", columns, record);
}

async function insertVideoMediaAsset(
  client: PoolClient,
  schema: MediaSchema,
  video: VideoRow,
): Promise<{ mediaAssetId: string; sourceVariantId: string; sourceGeneration: number }> {
  const metadata = {
    processingEncoder: video.processing_encoder,
    processingRenditionCount: video.processing_rendition_count,
  };
  const mediaAssetId = await insertRecord(
    client,
    "media_assets",
    schema.media_assets,
    assetRecord(schema.media_assets, "VIDEO", video, metadata),
    true,
  );
  if (!mediaAssetId) throw new Error(`Failed to create a media asset for video ${video.id}.`);

  const variants: Variant[] = [
    { kind: "SOURCE", objectKey: video.source_key, mimeType: video.mime_type, sizeBytes: video.size_bytes, metadata: { legacyKind: "LEGACY_VIDEO" } },
    { kind: "HLS", objectKey: video.hls_key, mimeType: "application/vnd.apple.mpegurl", metadata: { legacyKind: "LEGACY_VIDEO" } },
    { kind: "THUMBNAIL", objectKey: video.thumbnail_key, mimeType: "image/jpeg", metadata: { legacyKind: "LEGACY_VIDEO" } },
    { kind: "CAPTIONS", objectKey: video.captions_key, mimeType: "text/vtt", metadata: { legacyKind: "LEGACY_VIDEO" } },
  ];
  let sourceVariantId: string | null = null;
  for (const variant of variants) {
    const variantId = await insertVariant(client, schema, mediaAssetId, variant, video.created_at, video.updated_at);
    if (variant.kind === "SOURCE") sourceVariantId = variantId;
  }
  if (!sourceVariantId) throw new Error(`Failed to create a source variant for video ${video.id}.`);
  await insertProvenance(client, schema, mediaAssetId, "LEGACY_VIDEO", video, {
    legacy_video_id: video.id,
    normalized_source_url: video.normalized_source_url,
    source_url: video.normalized_source_url,
    external_source_id: video.external_source_id,
    ingestion_status: video.ingestion_status,
    ingestion_error: video.ingestion_error,
    ingestion_request_id: video.ingestion_request_id,
    request_id: video.ingestion_request_id,
  });
  await client.query(
    "UPDATE videos SET media_asset_id = $2 WHERE id = $1 AND media_asset_id IS NULL",
    [video.id, mediaAssetId],
  );
  return { mediaAssetId, sourceVariantId, sourceGeneration: 1 };
}

export async function projectLegacyVideoMediaAsset(
  client: PoolClient,
  schema: MediaSchema,
  videoId: string,
): Promise<{ mediaAssetId: string; sourceVariantId: string; sourceGeneration: number }> {
  const existing = await client.query<{ media_asset_id: string; source_variant_id: string; source_generation: number }>(
    `SELECT video.media_asset_id, source.id AS source_variant_id, source.generation AS source_generation
       FROM videos video
       JOIN media_asset_variants source ON source.media_asset_id = video.media_asset_id
        AND source.role = 'SOURCE' AND source.status = 'READY'
      WHERE video.id = $1
      ORDER BY source.generation DESC LIMIT 1`,
    [videoId],
  );
  if (existing.rows[0]) return {
    mediaAssetId: existing.rows[0].media_asset_id,
    sourceVariantId: existing.rows[0].source_variant_id,
    sourceGeneration: existing.rows[0].source_generation,
  };
  const result = await client.query<VideoRow>(
    `SELECT video.id, station.owner_id, video.title, video.description, video.status::text,
            video.source_key, video.source_file_name, video.mime_type, video.size_bytes::text,
            video.duration_ms::text, video.width, video.height, video.hls_key, video.thumbnail_key,
            video.captions_key, video.processing_progress, video.processing_attempts,
            video.processing_error, video.processing_started_at, video.processing_finished_at,
            video.processing_duration_ms::text, video.processing_encoder, video.processing_rendition_count,
            video.source_kind, video.normalized_source_url, video.external_source_id,
            video.ingestion_status, video.ingestion_error, video.ingestion_request_id,
            video.rights_attested_at, video.rights_attested_by, video.rights_attestation_version,
            video.created_at, video.updated_at
       FROM videos video
       JOIN stations station ON station.id = video.station_id
      WHERE video.id = $1 AND video.media_asset_id IS NULL AND video.status = 'READY'
      FOR UPDATE OF video`,
    [videoId],
  );
  if (!result.rows[0]) throw new Error(`Ready legacy video ${videoId} is unavailable for media projection.`);
  return insertVideoMediaAsset(client, schema, result.rows[0]);
}

async function backfillVideoBatch(client: PoolClient, schema: MediaSchema, batchSize: number): Promise<number> {
  const result = await client.query<VideoRow>(
    `SELECT video.id, station.owner_id, video.title, video.description, video.status::text,
            video.source_key, video.source_file_name, video.mime_type, video.size_bytes::text,
            video.duration_ms::text, video.width, video.height, video.hls_key, video.thumbnail_key,
            video.captions_key, video.processing_progress, video.processing_attempts,
            video.processing_error, video.processing_started_at, video.processing_finished_at,
            video.processing_duration_ms::text, video.processing_encoder, video.processing_rendition_count,
            video.source_kind, video.normalized_source_url, video.external_source_id,
            video.ingestion_status, video.ingestion_error, video.ingestion_request_id,
            video.rights_attested_at, video.rights_attested_by, video.rights_attestation_version,
            video.created_at, video.updated_at
       FROM videos video
       JOIN stations station ON station.id = video.station_id
      WHERE video.media_asset_id IS NULL
      ORDER BY video.created_at, video.id
      LIMIT $1
        FOR UPDATE OF video SKIP LOCKED`,
    [batchSize],
  );

  for (const video of result.rows) await insertVideoMediaAsset(client, schema, video);
  return result.rows.length;
}

async function backfillRadioTrackBatch(client: PoolClient, schema: MediaSchema, batchSize: number): Promise<number> {
  const result = await client.query<RadioTrackRow>(
    `SELECT track.id, station.owner_id, track.upload_request_id, track.title, track.artist, track.album,
            track.status::text, track.source_key, track.source_file_name, track.mime_type,
            track.size_bytes::text, track.duration_ms::text, track.source_codec,
            track.source_sample_rate, track.source_channels, track.integrated_lufs, track.true_peak_db,
            track.loudness_range_lu, track.mezzanine_key, track.artwork_key, track.audio_hls_key,
            track.audio_hls_segment_ms, track.processing_progress, track.processing_attempts,
            track.processing_error, track.processing_started_at, track.processing_finished_at,
            track.processing_duration_ms::text, track.metadata_edited_at, track.rights_attested_at,
            track.rights_attested_by, track.rights_attestation_version, track.created_at, track.updated_at
       FROM radio_tracks track
       JOIN stations station ON station.id = track.station_id
      WHERE track.media_asset_id IS NULL
      ORDER BY track.created_at, track.id
      LIMIT $1
        FOR UPDATE OF track SKIP LOCKED`,
    [batchSize],
  );

  for (const track of result.rows) {
    const metadata = {
      artist: track.artist,
      album: track.album,
      sourceCodec: track.source_codec,
      sourceSampleRate: track.source_sample_rate,
      sourceChannels: track.source_channels,
      integratedLufs: track.integrated_lufs,
      truePeakDb: track.true_peak_db,
      loudnessRangeLu: track.loudness_range_lu,
      metadataEditedAt: track.metadata_edited_at,
    };
    const mediaAssetId = await insertRecord(
      client,
      "media_assets",
      schema.media_assets,
      assetRecord(schema.media_assets, "AUDIO", track, metadata),
      true,
    );
    if (!mediaAssetId) throw new Error(`Failed to create a media asset for Radio track ${track.id}.`);

    const variants: Variant[] = [
      { kind: "SOURCE", objectKey: track.source_key, mimeType: track.mime_type, sizeBytes: track.size_bytes, metadata: { legacyKind: "LEGACY_RADIO_TRACK" } },
      { kind: "MEZZANINE", objectKey: track.mezzanine_key, mimeType: "audio/flac", metadata: { legacyKind: "LEGACY_RADIO_TRACK" } },
      { kind: "ARTWORK", objectKey: track.artwork_key, mimeType: "image/jpeg", metadata: { legacyKind: "LEGACY_RADIO_TRACK" } },
      {
        kind: "AUDIO_HLS",
        objectKey: track.audio_hls_key,
        mimeType: "application/vnd.apple.mpegurl",
        metadata: { segmentDurationMs: track.audio_hls_segment_ms, legacyKind: "LEGACY_RADIO_TRACK" },
      },
    ];
    for (const variant of variants) {
      await insertVariant(client, schema, mediaAssetId, variant, track.created_at, track.updated_at);
    }
    await insertProvenance(client, schema, mediaAssetId, "LEGACY_RADIO_TRACK", track, {
      legacy_radio_track_id: track.id,
      upload_request_id: track.upload_request_id,
      ingestion_request_id: track.upload_request_id,
      request_id: track.upload_request_id,
    });
    await client.query(
      "UPDATE radio_tracks SET media_asset_id = $2 WHERE id = $1 AND media_asset_id IS NULL",
      [track.id, mediaAssetId],
    );
  }
  return result.rows.length;
}

async function drain(kind: BackfillKind, schema: MediaSchema, batchSize: number): Promise<number> {
  let total = 0;
  while (true) {
    const processed = await transaction((client) => kind === "video"
      ? backfillVideoBatch(client, schema, batchSize)
      : backfillRadioTrackBatch(client, schema, batchSize));
    total += processed;
    if (processed < batchSize) return total;
  }
}

export async function backfillMediaAssets(batchSize = DEFAULT_BATCH_SIZE): Promise<MediaBackfillResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`Batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  const schema = await loadMediaSchema();
  const videos = await drain("video", schema, batchSize);
  const radioTracks = await drain("radioTrack", schema, batchSize);
  return { videos, radioTracks };
}

async function main(): Promise<void> {
  const batchSize = parseBatchSize(process.argv.slice(2));
  const result = await backfillMediaAssets(batchSize);
  console.info(`Backfilled ${result.videos} video asset(s) and ${result.radioTracks} Radio track asset(s).`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}
