import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { db, transaction } from "@/lib/db";
import { TV_CHANNEL_PROFILE } from "@/lib/tv-channel-derivative";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;
const DEFAULT_MAX_JOBS = 1000;
const MAX_JOBS = 100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TvChannelBackfillOptions = {
  batchSize: number;
  maxJobs: number;
  stationId?: string;
};

function boundedPositiveInteger(value: string, name: string, maximum: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(value);
  if (parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}.`);
  }
  return parsed;
}

function stationUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error("Station ID must be a UUID.");
  return value;
}

export function parseTvChannelBackfillOptions(argv: string[]): TvChannelBackfillOptions {
  const options: TvChannelBackfillOptions = { batchSize: DEFAULT_BATCH_SIZE, maxJobs: DEFAULT_MAX_JOBS };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const separator = argument.indexOf("=");
    const name = separator === -1 ? argument : argument.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : argument.slice(separator + 1);
    if (!name.startsWith("--")) {
      if (seen.has("--batch-size")) throw new Error("Batch size was provided more than once.");
      options.batchSize = boundedPositiveInteger(name, "Batch size", MAX_BATCH_SIZE);
      seen.add("--batch-size");
      continue;
    }
    if (!["--batch-size", "--max-jobs", "--station-id"].includes(name) || seen.has(name)) {
      throw new Error("Usage: npm run tv:backfill-derivatives -- [--batch-size <1-1000>] [--max-jobs <1-100000>] [--station-id <uuid>]");
    }
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}.`);
    }
    if (name === "--batch-size") {
      options.batchSize = boundedPositiveInteger(value, "Batch size", MAX_BATCH_SIZE);
    } else if (name === "--max-jobs") {
      options.maxJobs = boundedPositiveInteger(value, "Max jobs", MAX_JOBS);
    } else {
      options.stationId = stationUuid(value);
    }
    seen.add(name);
  }
  return options;
}

async function queueBatch(client: PoolClient, batchSize: number, stationId?: string): Promise<number> {
  const result = await client.query<{ id: string }>(
    `WITH candidates AS MATERIALIZED (
       SELECT asset.id AS media_asset_id, source.id AS source_variant_id, source.generation
         FROM media_assets asset
         JOIN LATERAL (
           SELECT variant.id, variant.generation
             FROM media_asset_variants variant
            WHERE variant.media_asset_id = asset.id
              AND variant.role = 'SOURCE' AND variant.status = 'READY'
            ORDER BY variant.generation DESC
            LIMIT 1
         ) source ON true
         WHERE asset.media_type = 'VIDEO'
           AND asset.status IN ('READY', 'ARCHIVED')
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM videos video
              WHERE video.media_asset_id = asset.id AND video.station_id = $3
           ))
           AND NOT EXISTS (
            SELECT 1 FROM tv_channel_derivatives derivative
             WHERE derivative.source_media_asset_variant_id = source.id
               AND derivative.profile = $2
          )
          AND NOT EXISTS (
            SELECT 1 FROM media_processing_jobs job
             WHERE job.media_asset_id = asset.id
               AND job.job_type = 'PREPARE_TV_AUTOMATION'
               AND job.idempotency_key = $2 || ':' || source.id::text
          )
        ORDER BY asset.created_at, asset.id
        LIMIT $1
        FOR UPDATE OF asset SKIP LOCKED
     )
     INSERT INTO media_processing_jobs
       (media_asset_id, job_type, idempotency_key, status, priority, max_attempts, payload)
     SELECT media_asset_id, 'PREPARE_TV_AUTOMATION', $2 || ':' || source_variant_id::text,
            'QUEUED', 0, 5,
            jsonb_build_object(
              'profile', $2,
              'sourceVariantId', source_variant_id,
              'sourceGeneration', generation
            )
       FROM candidates
     ON CONFLICT (media_asset_id, job_type, idempotency_key) DO NOTHING
     RETURNING id`,
    [batchSize, TV_CHANNEL_PROFILE, stationId ?? null],
  );
  return result.rows.length;
}

export async function queueTvChannelDerivativeBackfill(
  input: Partial<TvChannelBackfillOptions> = {},
): Promise<number> {
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxJobs = input.maxJobs ?? DEFAULT_MAX_JOBS;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`Batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > MAX_JOBS) {
    throw new Error(`Max jobs must be between 1 and ${MAX_JOBS}.`);
  }
  if (input.stationId !== undefined) stationUuid(input.stationId);
  let queued = 0;
  while (queued < maxJobs) {
    const transactionLimit = Math.min(batchSize, maxJobs - queued);
    const batch = await transaction((client) => queueBatch(client, transactionLimit, input.stationId));
    queued += batch;
    if (batch < transactionLimit) return queued;
  }
  return queued;
}

async function main(): Promise<void> {
  const options = parseTvChannelBackfillOptions(process.argv.slice(2));
  const queued = await queueTvChannelDerivativeBackfill(options);
  console.info(`Queued ${queued} durable TV channel derivative job(s).`);
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
