import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Worker, type Job } from "bullmq";
import { fileTypeFromFile } from "file-type";
import { runMaintenance } from "@/lib/maintenance";
import { query, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/redis";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { getMediaProcessingQueue, type TranscodeJob } from "@/lib/queue";
import { chunkManifest, isChunkSourcePrefix } from "@/lib/upload-chunks";
import { parseFrameRate, renditionsForSource, type Rendition } from "@/lib/transcode";
import { lockPublicationStation, publishAfterScheduleMutation, publishScheduleRefresh } from "@/lib/schedule-publication";
import { downloadYouTubeFormat, loadYouTubeMetadata, normalizeYouTubeUrl, selectYouTubeFormat } from "@/lib/youtube";
import { startWorkerHeartbeat, type WorkerHeartbeat } from "@/lib/worker-health";
import { loadMediaSchema, projectLegacyVideoMediaAsset } from "@/scripts/backfill-media-assets";

type VideoRow = {
  id: string;
  station_id: string;
  source_key: string;
  size_bytes: string;
  replacement_for_id: string | null;
  source_kind: "UPLOAD" | "YOUTUBE";
  normalized_source_url: string | null;
  external_source_id: string | null;
  ingestion_status: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED" | null;
  station_deleted_at: Date | null;
  tv_delivery_mode: "LEGACY_VOD" | "CHANNEL_HLS";
};

type Probe = {
  format: { duration?: string };
  streams: Array<{
    codec_type: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    tags?: { rotate?: string };
    side_data_list?: Array<{ rotation?: number }>;
  }>;
};

type EncoderMode = "nvenc" | "cpu";

function run(command: string, args: string[], onStdout?: (output: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      onStdout?.(text);
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-16_000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stderr}`)));
  });
}

async function mapLimit<T>(items: T[], concurrency: number, action: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await action(item);
    }
  }));
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
  await mapLimit(files, env().TRANSCODE_UPLOAD_CONCURRENCY, async (file) => {
    await storage.fPutObject(bucket, `${prefix}/${file.relative}`, file.absolute);
  });
}

async function objectBuffer(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const value of await storage.getObject(bucket, key)) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  return Buffer.concat(chunks);
}

async function downloadChunkedSource(sourcePrefix: string, expectedBytes: number, destination: string): Promise<void> {
  const manifest = chunkManifest(sourcePrefix, expectedBytes);
  const output = await fs.open(destination, "wx");
  let totalBytes = 0;
  try {
    for (let start = 0; start < manifest.length; start += env().TRANSCODE_DOWNLOAD_CONCURRENCY) {
      const batch = manifest.slice(start, start + env().TRANSCODE_DOWNLOAD_CONCURRENCY);
      const buffers = await Promise.all(batch.map(async (expected) => {
        const buffer = await objectBuffer(expected.name);
        if (buffer.length !== expected.size) throw new Error(`Chunk ${expected.index} has ${buffer.length} bytes; expected ${expected.size}`);
        return buffer;
      }));
      for (const buffer of buffers) {
        await output.write(buffer);
        totalBytes += buffer.length;
        if (totalBytes > expectedBytes) throw new Error("Chunked source exceeds its reserved size");
      }
    }
  } finally {
    await output.close();
  }
  if (totalBytes !== expectedBytes) throw new Error(`Chunked source has ${totalBytes} bytes; expected ${expectedBytes}`);
}

async function downloadSource(video: VideoRow, destination: string): Promise<void> {
  const expectedBytes = Number(video.size_bytes);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) throw new Error("Video record has an invalid source size");
  if (isChunkSourcePrefix(video.source_key)) await downloadChunkedSource(video.source_key, expectedBytes, destination);
  else await pipeline(await storage.getObject(bucket, video.source_key), createWriteStream(destination, { flags: "wx" }));
  const local = await fs.stat(destination);
  if (local.size !== expectedBytes) throw new Error(`Downloaded source has ${local.size} bytes; expected ${expectedBytes}`);
}

async function importYouTubeSource(video: VideoRow, destination: string): Promise<boolean> {
  if (!video.normalized_source_url || !video.external_source_id) throw new Error("This YouTube import is missing its source details.");
  const source = normalizeYouTubeUrl(video.normalized_source_url);
  if (source.videoId !== video.external_source_id) throw new Error("This YouTube import no longer matches its original video.");
  const config = env();
  const metadata = await loadYouTubeMetadata(source.url, config.YOUTUBE_IMPORT_METADATA_TIMEOUT_SECONDS);
  const selected = selectYouTubeFormat(
    metadata,
    source.videoId,
    config.YOUTUBE_IMPORT_MAX_DURATION_SECONDS,
    Number(video.size_bytes),
  );
  const downloadedBytes = await downloadYouTubeFormat(
    source.url,
    selected.formatId,
    destination,
    Number(video.size_bytes),
    config.YOUTUBE_IMPORT_DOWNLOAD_TIMEOUT_SECONDS,
  );
  const detected = await fileTypeFromFile(destination);
  if (!detected || !["video/mp4", "video/webm"].includes(detected.mime)) {
    throw new Error("The downloaded YouTube source is not a supported video file.");
  }
  await ensureBucket();
  await storage.fPutObject(bucket, video.source_key, destination, { "Content-Type": detected.mime });
  const filename = `${selected.title.replace(/[\\/\u0000-\u001F\u007F]/g, "_").slice(0, 240)}.${selected.extension}`;
  const updated = await query(
    `UPDATE videos v
        SET title = $2, source_file_name = $3, mime_type = $4, size_bytes = $5,
            ingestion_status = 'COMPLETE', ingestion_error = NULL,
            processing_progress = 7, updated_at = now()
       FROM stations s
      WHERE v.id = $1 AND v.station_id = s.id AND s.deleted_at IS NULL
        AND v.status = 'PROCESSING' AND v.ingestion_status = 'PROCESSING'`,
    [video.id, selected.title, filename, detected.mime, downloadedBytes],
  );
  if (!updated.rowCount) {
    await storage.removeObject(bucket, video.source_key).catch(() => undefined);
  }
  return Boolean(updated.rowCount);
}

function rotationOf(stream: Probe["streams"][number]): number {
  const sideData = stream.side_data_list?.find((item) => typeof item.rotation === "number")?.rotation;
  if (sideData !== undefined) return sideData;
  const tag = Number(stream.tags?.rotate ?? 0);
  return Number.isFinite(tag) ? tag : 0;
}

function videoFilter(rendition: Rendition, fps: number): string {
  return `scale=w='min(${rendition.width}\\,iw)':h='min(${rendition.height}\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=fast_bilinear,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps.toFixed(3)},setsar=1`;
}

function encoderArgs(mode: EncoderMode, rendition: Rendition, fps: number): string[] {
  const common = [
    "-profile:v", "main", "-b:v", rendition.bitrate, "-maxrate", rendition.bitrate,
    "-bufsize", `${Number.parseInt(rendition.bitrate) * 2}k`, "-pix_fmt", "yuv420p",
    "-g", String(Math.max(1, Math.round(fps * 2))), "-keyint_min", String(Math.max(1, Math.round(fps * 2))),
    "-sc_threshold", "0", "-bf", "0",
  ];
  if (mode === "nvenc") {
    return ["-c:v", "h264_nvenc", "-preset", env().TRANSCODE_NVENC_PRESET, "-tune", "ll", "-rc", "cbr", "-multipass", "disabled", ...common];
  }
  return ["-c:v", "libx264", "-preset", env().TRANSCODE_CPU_PRESET, ...common];
}

async function encodeHls(
  input: string,
  output: string,
  renditions: Rendition[],
  fps: number,
  durationSeconds: number,
  mode: EncoderMode,
  onFraction: (fraction: number) => void,
): Promise<void> {
  for (const rendition of renditions) await fs.mkdir(path.join(output, rendition.name), { recursive: true });
  const labels = renditions.map((_rendition, index) => `[split${index}]`).join("");
  const filters = renditions.length === 1
    ? `[0:v:0]${videoFilter(renditions[0], fps)}[video0]`
    : [`[0:v:0]split=${renditions.length}${labels}`, ...renditions.map((rendition, index) => `[split${index}]${videoFilter(rendition, fps)}[video${index}]`)].join(";");
  const args = ["-y", "-progress", "pipe:1", "-nostats", "-i", input, "-filter_complex", filters];
  for (const [index, rendition] of renditions.entries()) {
    const directory = path.join(output, rendition.name);
    args.push(
      "-map", `[video${index}]`, "-map", "0:a:0?", ...encoderArgs(mode, rendition, fps),
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
      "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
      "-hls_segment_filename", path.join(directory, "segment_%05d.ts"), path.join(directory, "index.m3u8"),
    );
  }
  let buffered = "";
  await run("ffmpeg", args, (text) => {
    buffered += text;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("out_time_us=")) continue;
      const elapsed = Number(line.slice(12)) / 1_000_000;
      if (Number.isFinite(elapsed)) onFraction(Math.min(1, Math.max(0, elapsed / durationSeconds)));
    }
  });
}

async function resetOutput(output: string): Promise<void> {
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
}

async function transcode(
  input: string,
  output: string,
  renditions: Rendition[],
  fps: number,
  durationSeconds: number,
  preferred: EncoderMode,
  onFraction: (fraction: number) => void,
): Promise<string> {
  await resetOutput(output);
  if (preferred === "nvenc") {
    try {
      await encodeHls(input, output, renditions, fps, durationSeconds, "nvenc", onFraction);
      return "h264_nvenc-multi";
    } catch (error) {
      console.warn("Multi-output NVENC failed; retrying renditions sequentially:", error instanceof Error ? error.message : error);
      try {
        await resetOutput(output);
        for (const [index, rendition] of renditions.entries()) {
          await encodeHls(input, output, [rendition], fps, durationSeconds, "nvenc", (fraction) => onFraction((index + fraction) / renditions.length));
        }
        return "h264_nvenc-sequential";
      } catch (sequentialError) {
        console.warn("Sequential NVENC failed; falling back to CPU:", sequentialError instanceof Error ? sequentialError.message : sequentialError);
        await resetOutput(output);
      }
    }
  }
  await encodeHls(input, output, renditions, fps, durationSeconds, "cpu", onFraction);
  return `libx264-${env().TRANSCODE_CPU_PRESET}`;
}

async function detectEncoder(): Promise<EncoderMode> {
  if (env().TRANSCODE_ACCELERATION === "cpu") return "cpu";
  try {
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=size=64x64:rate=1",
      "-frames:v", "1", "-c:v", "h264_nvenc", "-preset", env().TRANSCODE_NVENC_PRESET, "-f", "null", "-",
    ]);
    return "nvenc";
  } catch (error) {
    console.warn("NVENC probe failed; using CPU fallback:", error instanceof Error ? error.message : error);
    return "cpu";
  }
}

async function processVideo(job: Job<TranscodeJob>, preferredEncoder: EncoderMode): Promise<void> {
  const result = await query<VideoRow>(
    `SELECT v.id, v.station_id, v.source_key, v.size_bytes::text, v.replacement_for_id,
            v.source_kind, v.normalized_source_url, v.external_source_id, v.ingestion_status,
             s.deleted_at AS station_deleted_at, s.tv_delivery_mode
       FROM videos v JOIN stations s ON s.id = v.station_id
      WHERE v.id = $1 AND v.status IN ('QUEUED', 'PROCESSING')`,
    [job.data.videoId],
  );
  const video = result.rows[0];
  if (!video) return;
  let sourceRetained = video.ingestion_status === "COMPLETE";
  if (video.station_deleted_at) {
    const message = "Processing stopped because the station is scheduled for deletion. Restore the station, then retry.";
    await query(
      `UPDATE videos SET status = 'FAILED', processing_error = $2,
              ingestion_status = CASE WHEN source_kind = 'YOUTUBE' AND ingestion_status IN ('QUEUED', 'PROCESSING') THEN 'FAILED' ELSE ingestion_status END,
              ingestion_error = CASE WHEN source_kind = 'YOUTUBE' AND ingestion_status IN ('QUEUED', 'PROCESSING') THEN $2 ELSE ingestion_error END,
              updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'PROCESSING')`,
      [video.id, message],
    );
    return;
  }
  const workDir = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-${video.id}-`));
  const input = path.join(workDir, "source");
  const output = path.join(workDir, "hls");
  const startedAt = Date.now();
  let encoderUsed = preferredEncoder === "nvenc" ? "h264_nvenc" : `libx264-${env().TRANSCODE_CPU_PRESET}`;
  let lastProgress = 2;
  let lastPersisted = 2;
  let lastPersistedAt = Date.now();
  let progressWrites = Promise.resolve();
  const reportProgress = (value: number, force = false) => {
    const progress = Math.max(lastProgress, Math.min(99, Math.round(value)));
    lastProgress = progress;
    if (!force && progress - lastPersisted < 5 && Date.now() - lastPersistedAt < 5_000) return;
    lastPersisted = progress;
    lastPersistedAt = Date.now();
    progressWrites = progressWrites.then(async () => {
      await job.updateProgress(progress);
      await query("UPDATE videos SET processing_progress = $1, updated_at = now() WHERE id = $2 AND status = 'PROCESSING'", [progress, video.id]);
    });
  };
  try {
    const started = await query(
      `UPDATE videos SET status = 'PROCESSING', processing_attempts = processing_attempts + 1,
         processing_progress = 2, processing_error = NULL, processing_started_at = now(),
         processing_finished_at = NULL, processing_duration_ms = NULL, processing_encoder = $2,
         processing_rendition_count = NULL,
         ingestion_status = CASE WHEN source_kind = 'YOUTUBE' AND ingestion_status = 'QUEUED' THEN 'PROCESSING' ELSE ingestion_status END,
         ingestion_error = CASE WHEN source_kind = 'YOUTUBE' AND ingestion_status = 'QUEUED' THEN NULL ELSE ingestion_error END,
         updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'PROCESSING') RETURNING id`,
      [video.id, encoderUsed],
    );
    if (!started.rowCount) return;
    await ensureBucket();
    if (video.source_kind === "YOUTUBE" && video.ingestion_status !== "COMPLETE") {
      if (!(await importYouTubeSource(video, input))) {
        const message = "Processing stopped because the station is scheduled for deletion. Restore the station, then retry.";
        await query(
          `UPDATE videos SET status = 'FAILED', processing_error = $2,
                  ingestion_status = CASE WHEN ingestion_status = 'PROCESSING' THEN 'FAILED' ELSE ingestion_status END,
                  ingestion_error = CASE WHEN ingestion_status = 'PROCESSING' THEN $2 ELSE ingestion_error END,
                  updated_at = now()
            WHERE id = $1 AND status = 'PROCESSING'`,
          [video.id, message],
        );
        return;
      }
      sourceRetained = true;
    } else {
      await downloadSource(video, input);
    }
    reportProgress(7, true); await progressWrites;
    const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", input])) as Probe;
    const durationSeconds = Number(probe.format.duration);
    const sourceVideo = probe.streams.find((stream) => stream.codec_type === "video");
    if (!sourceVideo?.width || !sourceVideo.height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("FFprobe could not read valid video metadata");
    if (video.source_kind === "YOUTUBE" && durationSeconds > env().YOUTUBE_IMPORT_MAX_DURATION_SECONDS) {
      throw new Error(`The downloaded YouTube video exceeds the ${Math.floor(env().YOUTUBE_IMPORT_MAX_DURATION_SECONDS / 60)} minute import limit.`);
    }
    const fps = parseFrameRate(sourceVideo.avg_frame_rate);
    const renditions = renditionsForSource(sourceVideo.width, sourceVideo.height, rotationOf(sourceVideo));
    await query("UPDATE videos SET processing_rendition_count = $2 WHERE id = $1 AND status = 'PROCESSING'", [video.id, renditions.length]);
    encoderUsed = await transcode(input, output, renditions, fps, durationSeconds, preferredEncoder, (fraction) => reportProgress(10 + fraction * 70));
    await query("UPDATE videos SET processing_encoder = $2 WHERE id = $1 AND status = 'PROCESSING'", [video.id, encoderUsed]);
    const master = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];
    for (const rendition of renditions) {
      master.push(`#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.width}x${rendition.height}`);
      master.push(`${rendition.name}/index.m3u8`);
    }
    await fs.writeFile(path.join(output, "master.m3u8"), `${master.join("\n")}\n`);
    reportProgress(82, true); await progressWrites;
    const thumbnail = path.join(workDir, "thumbnail.jpg");
    await run("ffmpeg", [
      "-y", "-ss", String(Math.min(Math.max(durationSeconds * 0.1, 0.5), 5)), "-i", input,
      "-frames:v", "1", "-vf", "scale=w='min(640\\,iw)':h='min(360\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=fast_bilinear,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black",
      "-q:v", "3", thumbnail,
    ]);
    let captions: string | null = null;
    if (probe.streams.some((stream) => stream.codec_type === "subtitle")) {
      captions = path.join(workDir, "captions.vtt");
      await run("ffmpeg", ["-y", "-i", input, "-map", "0:s:0", "-c:s", "webvtt", captions]);
    }
    const prefix = `stations/${video.station_id}/processed/${video.id}`;
    await Promise.all([
      uploadDirectory(output, `${prefix}/hls`),
      storage.fPutObject(bucket, `${prefix}/thumbnail.jpg`, thumbnail, { "Content-Type": "image/jpeg" }),
      ...(captions ? [storage.fPutObject(bucket, `${prefix}/captions.vtt`, captions, { "Content-Type": "text/vtt" })] : []),
    ]);
    reportProgress(96, true); await progressWrites;
    const durationMs = Date.now() - startedAt;
    const mediaSchema = video.tv_delivery_mode === "CHANNEL_HLS" ? await loadMediaSchema() : null;
    const completion = await transaction(async (client) => {
      const locked = await lockPublicationStation(client, video.station_id);
      const available = await client.query<{ deleted_at: Date | null }>("SELECT deleted_at FROM stations WHERE id = $1", [video.station_id]);
      if (!available.rows[0] || available.rows[0].deleted_at) {
        await client.query(
          `UPDATE videos SET status = 'FAILED',
                  processing_error = 'Processing stopped because the station is scheduled for deletion. Restore the station, then retry.',
                  updated_at = now()
            WHERE id = $1 AND status = 'PROCESSING'`,
          [video.id],
        );
        return { refreshStation: locked.promoted, automationJobId: null };
      }
      const completed = await client.query(
        `UPDATE videos SET status = 'READY', duration_ms = $1, width = $2, height = $3,
           hls_key = $4, thumbnail_key = $5, captions_key = $6,
           processing_progress = 100, processing_error = NULL, processing_finished_at = now(),
           processing_duration_ms = $7, processing_encoder = $8, processing_rendition_count = $9,
           updated_at = now() WHERE id = $10 AND status = 'PROCESSING' RETURNING id`,
        [Math.round(durationSeconds * 1000), sourceVideo.width, sourceVideo.height, `${prefix}/hls/master.m3u8`, `${prefix}/thumbnail.jpg`, captions ? `${prefix}/captions.vtt` : null, durationMs, encoderUsed, renditions.length, video.id],
      );
      if (!completed.rowCount) return { refreshStation: locked.promoted, automationJobId: null };
      let playlistChanged = false;
      if (video.replacement_for_id) {
        const replaced = await client.query(
          `UPDATE playlist_items p SET video_id = $1
             FROM videos replaced
            WHERE p.station_id = $2 AND p.video_id = $3
              AND replaced.id = $3 AND replaced.status = 'READY'
          RETURNING p.id`,
          [video.id, video.station_id, video.replacement_for_id],
        );
        playlistChanged = Boolean(replaced.rowCount);
        if (playlistChanged) {
          await client.query("UPDATE videos SET status = 'REPLACED', updated_at = now() WHERE id = $1 AND status = 'READY'", [video.replacement_for_id]);
        }
      } else {
        const appended = await client.query(
          `INSERT INTO playlist_items (station_id, video_id, position, page, story_slug, planned_duration_ms)
           SELECT $1, video.id,
                  COALESCE((SELECT max(item.position) + 1 FROM playlist_items item WHERE item.station_id = $1), 0),
                  COALESCE((SELECT max(item.page) + 1 FROM playlist_items item WHERE item.station_id = $1), 1),
                  video.title, video.duration_ms
             FROM videos video
            WHERE video.id = $2
              AND NOT EXISTS (SELECT 1 FROM playlist_items existing WHERE existing.station_id = $1 AND existing.video_id = $2)`,
          [video.station_id, video.id],
        );
        playlistChanged = Boolean(appended.rowCount);
      }
      if (!playlistChanged) return { refreshStation: locked.promoted, automationJobId: null };
      await client.query("UPDATE stations SET playlist_version = playlist_version + 1, updated_at = now() WHERE id = $1", [video.station_id]);
      const publication = await publishAfterScheduleMutation(client, video.station_id);
      if (!mediaSchema) return { refreshStation: locked.promoted || publication.activeChanged, automationJobId: null };
      const projection = await projectLegacyVideoMediaAsset(client, mediaSchema, video.id);
      const automationJobId = randomUUID();
      const automationJob = await client.query<{ id: string }>(
        `INSERT INTO media_processing_jobs
           (id, media_asset_id, job_type, idempotency_key, status, priority, max_attempts, payload)
         VALUES ($1, $2, 'PREPARE_TV_AUTOMATION', $3, 'QUEUED', 0, 5, $4::jsonb)
         ON CONFLICT (media_asset_id, job_type, idempotency_key) DO UPDATE
           SET updated_at = media_processing_jobs.updated_at
         RETURNING id`,
        [automationJobId, projection.mediaAssetId, `tv-channel-v1:${projection.sourceVariantId}`,
          JSON.stringify({ profile: "tv-channel-v1", sourceVariantId: projection.sourceVariantId, sourceGeneration: projection.sourceGeneration })],
      );
      return { refreshStation: locked.promoted || publication.activeChanged, automationJobId: automationJob.rows[0].id };
    });
    if (completion.refreshStation) await publishScheduleRefresh(video.station_id);
    if (completion.automationJobId) {
      await getMediaProcessingQueue().add(
        "process-owner-media",
        { processingJobId: completion.automationJobId },
        { jobId: `media-processing-${completion.automationJobId}` },
      ).catch((error) => console.error(`TV automation job ${completion.automationJobId} is durable but could not be dispatched:`, error));
    }
    await job.updateProgress(100);
  } catch (error) {
    const maxAttempts = job.opts.attempts ?? 1;
    const finalAttempt = job.attemptsMade + 1 >= maxAttempts;
    const nextStatus = finalAttempt ? "FAILED" : "QUEUED";
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Transcoding failed";
    let releaseImportReservation = false;
    if (finalAttempt && video.source_kind === "YOUTUBE" && !sourceRetained) {
      try {
        await storage.removeObject(bucket, video.source_key);
        releaseImportReservation = true;
      } catch (cleanupError) {
        console.error(`Could not clean failed YouTube source ${video.id}:`, cleanupError instanceof Error ? cleanupError.message : cleanupError);
      }
    }
    await query(
      `UPDATE videos SET status = $1::video_status, processing_error = $3,
         ingestion_status = CASE WHEN ingestion_status = 'PROCESSING' THEN $2 ELSE ingestion_status END,
         ingestion_error = CASE WHEN ingestion_status = 'PROCESSING' THEN $3 ELSE ingestion_error END,
         size_bytes = CASE WHEN ingestion_status = 'PROCESSING' AND $6::boolean THEN 0 ELSE size_bytes END,
         processing_finished_at = now(),
         processing_duration_ms = $4, processing_encoder = $5, updated_at = now()
        WHERE id = $7 AND status = 'PROCESSING'`,
      [nextStatus, nextStatus, message, Date.now() - startedAt, encoderUsed, releaseImportReservation, video.id],
    );
    throw error;
  } finally {
    await progressWrites.catch(() => undefined);
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

const redis = getRedis();
let worker: Worker<TranscodeJob> | null = null;
let maintenanceTimer: NodeJS.Timeout | null = null;
let heartbeat: WorkerHeartbeat | null = null;

async function start() {
  const preferredEncoder = await detectEncoder();
  console.info(`Starting transcode worker with ${preferredEncoder === "nvenc" ? `NVENC ${env().TRANSCODE_NVENC_PRESET}` : `CPU ${env().TRANSCODE_CPU_PRESET}`} at concurrency ${env().TRANSCODE_CONCURRENCY}`);
  worker = new Worker<TranscodeJob>("transcode", (job) => processVideo(job, preferredEncoder), { connection: redis, concurrency: env().TRANSCODE_CONCURRENCY });
  worker.on("completed", (job) => console.info(`Transcoded ${job.data.videoId}`));
  worker.on("failed", (job, error) => console.error(`Transcode failed for ${job?.data.videoId ?? "unknown"}:`, error.message));
  heartbeat = await startWorkerHeartbeat("transcode");
  maintenanceTimer = setInterval(() => void runMaintenance().catch((error) => console.error("Maintenance failed:", error)), 60 * 60 * 1000);
  void runMaintenance().catch((error) => console.error("Initial maintenance failed:", error));
}

async function shutdown(signal: string) {
  console.info(`Received ${signal}; closing worker`);
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  await heartbeat?.stop();
  await worker?.close();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void start().catch((error) => { console.error("Worker startup failed:", error); process.exit(1); });
