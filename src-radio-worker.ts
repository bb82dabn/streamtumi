import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Worker, type Job } from "bullmq";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import type { RadioPrepJob } from "@/lib/queue";
import { audioVodPackagerArgs } from "@/lib/radio-hls";
import { parseAudioProbe, parseLoudnessMeasurement, loudnessFilter, type AudioProbe } from "@/lib/radio-track-prep";
import { getRedis } from "@/lib/redis";
import { bucket, ensureBucket, removePrefix, storage } from "@/lib/storage";
import { chunkManifest, isRadioTrackChunkSourcePrefix } from "@/lib/upload-chunks";
import { startWorkerHeartbeat, type WorkerHeartbeat } from "@/lib/worker-health";

type TrackRow = {
  id: string;
  station_id: string;
  source_key: string;
  size_bytes: string;
  metadata_edited_at: Date | null;
  station_deleted_at: Date | null;
};

type BackfillTrackRow = {
  id: string;
  station_id: string;
  mezzanine_key: string;
};

function run(command: string, args: string[], timeoutSeconds = env().RADIO_PREP_TIMEOUT_SECONDS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stdout = "";
    let stderr = "";
    const append = (current: string, chunk: unknown) => `${current}${String(chunk)}`.slice(-1_000_000);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => {
      if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* The process already exited. */ }
      }
      reject(new Error(`${command} exceeded its processing timeout.`));
    }, timeoutSeconds * 1000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed (${code}): ${stderr.slice(-16_000)}`));
    });
  });
}

async function objectBuffer(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const value of await storage.getObject(bucket, key)) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  return Buffer.concat(chunks);
}

async function downloadSource(track: TrackRow, destination: string): Promise<void> {
  const expectedBytes = Number(track.size_bytes);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || !isRadioTrackChunkSourcePrefix(track.source_key)) throw new Error("Track source reservation is invalid.");
  const output = await fs.open(destination, "wx");
  let total = 0;
  try {
    for (const expected of chunkManifest(track.source_key, expectedBytes)) {
      const buffer = await objectBuffer(expected.name);
      if (buffer.length !== expected.size) throw new Error(`Track chunk ${expected.index} has the wrong size.`);
      await output.write(buffer);
      total += buffer.length;
    }
  } finally {
    await output.close();
  }
  if (total !== expectedBytes) throw new Error("Track source is incomplete.");
}

async function filesUnder(root: string, relative = ""): Promise<Array<{ absolute: string; relative: string }>> {
  const directory = path.join(root, relative);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: Array<{ absolute: string; relative: string }> = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, next));
    else files.push({ absolute: path.join(root, next), relative: next.split(path.sep).join("/") });
  }
  return files;
}

async function uploadDirectory(root: string, prefix: string): Promise<void> {
  const files = await filesUnder(root);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(env().TRANSCODE_UPLOAD_CONCURRENCY, files.length) }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      await storage.fPutObject(bucket, `${prefix}/${file.relative}`, file.absolute);
    }
  }));
}

async function backfillTrackHls(job: Job<RadioPrepJob>): Promise<void> {
  const result = await query<BackfillTrackRow>(
    `SELECT track.id, track.station_id, track.mezzanine_key
       FROM radio_tracks track JOIN stations station ON station.id = track.station_id
      WHERE track.id = $1 AND track.status IN ('READY', 'ARCHIVED') AND track.audio_hls_key IS NULL
        AND track.mezzanine_key IS NOT NULL AND station.deleted_at IS NULL`,
    [job.data.trackId],
  );
  const track = result.rows[0];
  if (!track) return;
  const workDir = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-radio-hls-${track.id}-`));
  const mezzanine = path.join(workDir, "mezzanine.flac");
  const audioHlsDirectory = path.join(workDir, "audio");
  const outputPrefix = path.posix.dirname(track.mezzanine_key);
  try {
    await ensureBucket();
    await pipeline(await storage.getObject(bucket, track.mezzanine_key), createWriteStream(mezzanine, { flags: "wx" }));
    await fs.mkdir(audioHlsDirectory);
    await run("ffmpeg", audioVodPackagerArgs(mezzanine, audioHlsDirectory, env().RADIO_STATIC_HLS_SEGMENT_SECONDS));
    await uploadDirectory(audioHlsDirectory, `${outputPrefix}/audio`);
    await query(
      `UPDATE radio_tracks SET audio_hls_key = $2, audio_hls_segment_ms = $3, updated_at = now()
        WHERE id = $1 AND status IN ('READY', 'ARCHIVED') AND audio_hls_key IS NULL`,
      [track.id, `${outputPrefix}/audio/index.m3u8`, env().RADIO_STATIC_HLS_SEGMENT_SECONDS * 1000],
    );
    await job.updateProgress(100);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function prepareTrack(job: Job<RadioPrepJob>): Promise<void> {
  const result = await query<TrackRow>(
    `SELECT t.id, t.station_id, t.source_key, t.size_bytes::text, t.metadata_edited_at,
            s.deleted_at AS station_deleted_at
       FROM radio_tracks t JOIN stations s ON s.id = t.station_id
      WHERE t.id = $1 AND t.status IN ('QUEUED', 'PROCESSING') AND s.station_kind = 'RADIO'`,
    [job.data.trackId],
  );
  const track = result.rows[0];
  if (!track) return;
  if (track.station_deleted_at) throw new Error("Processing stopped because the Radio station is scheduled for deletion.");
  const claimId = randomUUID();
  const startedAt = Date.now();
  const claimed = await query(
    `UPDATE radio_tracks SET status = 'PROCESSING', processing_claim_id = $2,
            processing_attempts = processing_attempts + 1, processing_progress = 2,
            processing_error = NULL, processing_started_at = now(), processing_finished_at = NULL,
            updated_at = now()
      WHERE id = $1 AND status IN ('QUEUED', 'PROCESSING') RETURNING id`,
    [track.id, claimId],
  );
  if (!claimed.rowCount) return;
  const workDir = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-radio-${track.id}-`));
  const source = path.join(workDir, "source");
  const mezzanine = path.join(workDir, "mezzanine.flac");
  const artwork = path.join(workDir, "artwork.jpg");
  const audioHlsDirectory = path.join(workDir, "audio");
  const outputPrefix = `stations/${track.station_id}/radio/tracks/${track.id}/claims/${claimId}`;
  const progress = async (value: number) => {
    await job.updateProgress(value);
    await query("UPDATE radio_tracks SET processing_progress = $1, updated_at = now() WHERE id = $2 AND status = 'PROCESSING' AND processing_claim_id = $3", [value, track.id, claimId]);
  };
  try {
    await ensureBucket();
    await downloadSource(track, source);
    await progress(10);
    const probeResult = await run("ffprobe", ["-hide_banner", "-v", "error", "-show_streams", "-show_format", "-of", "json", source]);
    const metadata = parseAudioProbe(JSON.parse(probeResult.stdout) as AudioProbe, env().RADIO_TRACK_MAX_DURATION_SECONDS);
    await query(
      `UPDATE radio_tracks SET source_codec = $1, source_sample_rate = $2, source_channels = $3,
              title = CASE WHEN metadata_edited_at IS NULL AND $4 <> '' THEN $4 ELSE title END,
              artist = CASE WHEN metadata_edited_at IS NULL AND $5 <> '' THEN $5 ELSE artist END,
              album = CASE WHEN metadata_edited_at IS NULL AND $6 <> '' THEN $6 ELSE album END,
              processing_progress = 20, updated_at = now()
        WHERE id = $7 AND status = 'PROCESSING' AND processing_claim_id = $8`,
      [metadata.codec, metadata.sampleRate, metadata.channels, metadata.title, metadata.artist, metadata.album, track.id, claimId],
    );
    const measured = await run("ffmpeg", ["-hide_banner", "-nostdin", "-i", source, "-map", `0:${metadata.audioStreamIndex}`, "-vn", "-sn", "-dn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
    const loudness = parseLoudnessMeasurement(measured.stderr);
    await progress(45);
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-i", source, "-map", `0:${metadata.audioStreamIndex}`, "-map_metadata", "-1", "-map_chapters", "-1", "-vn", "-sn", "-dn", "-af", loudnessFilter(loudness), "-ar", "48000", "-ac", "2", "-sample_fmt", "s16", "-c:a", "flac", "-compression_level", "8", mezzanine]);
    await progress(65);
    await fs.mkdir(audioHlsDirectory);
    await run("ffmpeg", audioVodPackagerArgs(mezzanine, audioHlsDirectory, env().RADIO_STATIC_HLS_SEGMENT_SECONDS));
    await progress(82);
    let hasArtwork = false;
    if (metadata.artworkStreamIndex !== null) {
      try {
        await run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-i", source, "-map", `0:${metadata.artworkStreamIndex}`, "-frames:v", "1", "-vf", "scale=w='min(1200,iw)':h='min(1200,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "mjpeg", "-q:v", "2", artwork]);
        hasArtwork = true;
      } catch (error) {
        console.warn(`Artwork extraction failed for ${track.id}:`, error instanceof Error ? error.message : error);
      }
    }
    const mezzanineKey = `${outputPrefix}/mezzanine.flac`;
    const artworkKey = hasArtwork ? `${outputPrefix}/artwork.jpg` : null;
    const audioHlsKey = `${outputPrefix}/audio/index.m3u8`;
    await Promise.all([
      storage.fPutObject(bucket, mezzanineKey, mezzanine, { "Content-Type": "audio/flac" }),
      uploadDirectory(audioHlsDirectory, `${outputPrefix}/audio`),
      ...(artworkKey ? [storage.fPutObject(bucket, artworkKey, artwork, { "Content-Type": "image/jpeg" })] : []),
    ]);
    await progress(95);
    const completed = await query(
      `UPDATE radio_tracks t SET status = 'READY', duration_ms = $1, integrated_lufs = $2,
               true_peak_db = $3, loudness_range_lu = $4, mezzanine_key = $5, artwork_key = $6,
               audio_hls_key = $7, audio_hls_segment_ms = $8,
               processing_progress = 100, processing_error = NULL, processing_finished_at = now(),
               processing_duration_ms = $9, updated_at = now()
         FROM stations s
        WHERE t.id = $10 AND t.station_id = s.id AND s.deleted_at IS NULL
          AND t.status = 'PROCESSING' AND t.processing_claim_id = $11
        RETURNING t.id`,
      [Math.round(metadata.durationSeconds * 1000), loudness.inputI, loudness.inputTp, loudness.inputLra, mezzanineKey, artworkKey, audioHlsKey, env().RADIO_STATIC_HLS_SEGMENT_SECONDS * 1000, Date.now() - startedAt, track.id, claimId],
    );
    if (!completed.rowCount) await removePrefix(outputPrefix);
    else await job.updateProgress(100);
  } catch (error) {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Radio track preparation failed.";
    await query(
      `UPDATE radio_tracks SET status = $1::radio_track_status, processing_error = $2,
              processing_finished_at = now(), processing_duration_ms = $3, updated_at = now()
        WHERE id = $4 AND status = 'PROCESSING' AND processing_claim_id = $5`,
      [finalAttempt ? "FAILED" : "QUEUED", message, Date.now() - startedAt, track.id, claimId],
    );
    await removePrefix(outputPrefix).catch(() => undefined);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

const redis = getRedis();
let worker: Worker<RadioPrepJob> | null = null;
let heartbeat: WorkerHeartbeat | null = null;

async function start() {
  console.info(`Starting Radio preparation worker at concurrency ${env().RADIO_PREP_CONCURRENCY}`);
  worker = new Worker<RadioPrepJob>("radio-prep", (job) => job.data.kind === "BACKFILL_HLS" ? backfillTrackHls(job) : prepareTrack(job), { connection: redis, concurrency: env().RADIO_PREP_CONCURRENCY });
  worker.on("completed", (job) => console.info(`Prepared Radio track ${job.data.trackId}`));
  worker.on("failed", (job, error) => console.error(`Radio preparation failed for ${job?.data.trackId ?? "unknown"}:`, error.message));
  heartbeat = await startWorkerHeartbeat("radio-prep");
}

async function shutdown(signal: string) {
  console.info(`Received ${signal}; closing Radio preparation worker`);
  await heartbeat?.stop();
  await worker?.close();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void start();
