import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Worker, type Job } from "bullmq";
import { fileTypeFromFile } from "file-type";
import type { PoolClient } from "pg";
import sharp from "sharp";
import { query, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { ownerMediaPartKey, ownerMediaUploadPrefix } from "@/lib/media-uploads";
import { getMediaProcessingQueue, type MediaProcessingJob } from "@/lib/queue";
import { getRedis } from "@/lib/redis";
import { bucket, ensureBucket, removePrefix, storage } from "@/lib/storage";
import { startWorkerHeartbeat, type WorkerHeartbeat } from "@/lib/worker-health";
import { publishAfterScheduleMutation, publishScheduleRefresh } from "@/lib/schedule-publication";
import {
  TV_CHANNEL_PROFILE,
  tvChannelV1Args,
  validateTvChannelMasterPlaylist,
  validateTvChannelSegmentInventories,
  type TvChannelRendition,
} from "@/lib/tv-channel-derivative";
import { chunkManifest, chunkSizeForIndex, isChunkSourcePrefix, UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload-chunks";

type MediaType = "AUDIO" | "VIDEO" | "IMAGE";

type Probe = {
  format?: { duration?: string; bit_rate?: string; format_name?: string };
  streams?: Array<{
    index: number;
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    sample_rate?: string;
    channels?: number;
    bit_rate?: string;
    disposition?: { attached_pic?: number };
  }>;
};

type ClaimedUpload = {
  jobId: string;
  assetId: string;
  ownerId: string;
  mediaType: MediaType;
  attempt: number;
  maxAttempts: number;
  claimToken: string;
  uploadId: string;
  uploadStatus: string;
  uploadPrefix: string;
  expectedBytes: number;
  expectedParts: number;
  expectedChecksum: string | null;
};

type VariantResult = {
  role: "SOURCE" | "MEZZANINE" | "HLS_MANIFEST" | "THUMBNAIL" | "POSTER";
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  technicalMetadata: Record<string, unknown>;
  durationMs?: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrateBps?: number;
  sampleRateHz?: number;
  channels?: number;
};

type ProcessingResult = {
  sourceObjectKey: string;
  mimeType: string;
  checksumSha256: string;
  metadata: Record<string, unknown>;
  durationMs?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioSampleRateHz?: number;
  audioChannels?: number;
  bitrateBps?: number;
  variants: VariantResult[];
};

type FileDescription = { sizeBytes: number; checksumSha256: string };

const workerIdentity = `${hostname()}:${process.pid}`.slice(0, 255);
const leaseSeconds = 120;
const audioMimes = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac"]);
const videoMimes = new Set(["video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/x-msvideo", "video/mpeg"]);
const imageMimes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const tvChannelRenditions = ["720p", "360p"] as const satisfies readonly TvChannelRendition[];
const tvChannelRenditionContract = {
  "720p": { width: 1280, height: 720, bitrateBps: 2_500_000, bufferSizeBps: 5_000_000 },
  "360p": { width: 640, height: 360, bitrateBps: 800_000, bufferSizeBps: 1_600_000 },
} as const satisfies Record<TvChannelRendition, {
  width: number;
  height: number;
  bitrateBps: number;
  bufferSizeBps: number;
}>;

function boundedPositive(value: string | number | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= Number.MAX_SAFE_INTEGER ? Math.round(parsed) : undefined;
}

function parseFrameRate(value: string | undefined): number {
  if (!value) throw new Error("The source video has no readable frame rate.");
  const [numerator, denominator = "1"] = value.split("/");
  const result = Number(numerator) / Number(denominator);
  if (!Number.isFinite(result) || result <= 0 || result > 240) throw new Error("The source video has an invalid frame rate.");
  return result;
}

function probeDuration(probe: Probe): number {
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The source has no readable duration.");
  return duration;
}

function run(command: string, args: string[], timeoutSeconds = env().RADIO_PREP_TIMEOUT_SECONDS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* The command already exited. */ }
      }
      if (!settled) {
        settled = true;
        reject(new Error(`${command} exceeded its processing timeout.`));
      }
    }, timeoutSeconds * 1000);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${String(chunk)}`.slice(-1_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-32_000); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed (${code}): ${stderr}`));
    });
  });
}

async function ffprobe(source: string): Promise<Probe> {
  const result = await run("ffprobe", ["-hide_banner", "-v", "error", "-show_streams", "-show_format", "-of", "json", source]);
  return JSON.parse(result.stdout) as Probe;
}

async function objectBuffer(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await storage.getObject(bucket, key)) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function describeFile(filename: string): Promise<FileDescription> {
  const checksum = createHash("sha256");
  let sizeBytes = 0;
  for await (const chunk of createReadStream(filename)) {
    checksum.update(chunk);
    sizeBytes += chunk.length;
  }
  return { sizeBytes, checksumSha256: checksum.digest("hex") };
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

async function mapLimit<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await operation(items[cursor++]);
  }));
}

function contentType(filename: string): string {
  if (filename.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filename.endsWith(".ts")) return "video/mp2t";
  if (filename.endsWith(".jpg")) return "image/jpeg";
  if (filename.endsWith(".flac")) return "audio/flac";
  return "application/octet-stream";
}

async function uploadDirectory(root: string, prefix: string): Promise<{ sizeBytes: number; files: string[] }> {
  const files = await filesUnder(root);
  await mapLimit(files, env().TRANSCODE_UPLOAD_CONCURRENCY, async (file) => {
    await storage.fPutObject(bucket, `${prefix}/${file.relative}`, file.absolute, { "Content-Type": contentType(file.relative) });
  });
  const stats = await Promise.all(files.map((file) => fs.stat(file.absolute)));
  return { sizeBytes: stats.reduce((total, stat) => total + stat.size, 0), files: files.map((file) => file.relative) };
}

export function ownerMediaClaimPrefix(ownerId: string, assetId: string, claimToken: string): string {
  return `owners/${ownerId}/media/${assetId}/claims/${claimToken}`;
}

async function claimDurableJob(processingJobId: string): Promise<ClaimedUpload | null> {
  const claimToken = randomUUID();
  return transaction(async (client) => {
    const claimed = await client.query<{ id: string; media_asset_id: string; attempt_count: number; max_attempts: number; payload: { uploadSessionId?: string } }>(
      `UPDATE media_processing_jobs SET status = 'RUNNING', claim_token = $2,
              claimed_by = $3, lease_expires_at = now() + ($4 * interval '1 second'),
              attempt_count = attempt_count + 1, started_at = COALESCE(started_at, now()),
              finished_at = NULL, last_error = NULL, updated_at = now()
        WHERE id = $1 AND job_type = 'PROCESS_UPLOAD' AND attempt_count < max_attempts
          AND ((status = 'QUEUED' AND available_at <= now())
            OR (status = 'RUNNING' AND lease_expires_at < now()))
        RETURNING id, media_asset_id, attempt_count, max_attempts, payload`,
      [processingJobId, claimToken, workerIdentity, leaseSeconds],
    );
    const job = claimed.rows[0];
    if (!job) return null;
    const uploadId = job.payload.uploadSessionId;
    if (!uploadId) throw new Error("The durable media job has no upload session.");
    const details = await client.query<{
      owner_id: string;
      media_type: MediaType;
      asset_status: string;
      upload_status: string;
      object_key: string;
      expected_bytes: string;
      part_size_bytes: string;
      expected_parts: number;
      checksum_sha256: string | null;
    }>(
      `SELECT asset.owner_id, asset.media_type, asset.status AS asset_status,
              upload.status AS upload_status, upload.object_key, upload.expected_bytes::text,
              upload.part_size_bytes::text, upload.expected_parts, upload.checksum_sha256
         FROM media_assets asset
         JOIN media_upload_sessions upload ON upload.media_asset_id = asset.id
        WHERE asset.id = $1 AND upload.id = $2`,
      [job.media_asset_id, uploadId],
    );
    const row = details.rows[0];
    if (!row || row.asset_status !== "PROCESSING" || row.upload_status !== "COMPLETE") {
      throw new Error("The durable media job no longer has a processable upload.");
    }
    const expectedBytes = Number(row.expected_bytes);
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > env().MAX_UPLOAD_BYTES) {
      throw new Error("The durable media job exceeds the configured upload limit.");
    }
    if (Number(row.part_size_bytes) !== UPLOAD_CHUNK_SIZE_BYTES || row.expected_parts !== Math.ceil(expectedBytes / UPLOAD_CHUNK_SIZE_BYTES)) {
      throw new Error("The durable media job has an invalid part layout.");
    }
    if (row.object_key !== ownerMediaUploadPrefix(row.owner_id, job.media_asset_id, uploadId)) {
      throw new Error("The durable media job has an invalid owner storage prefix.");
    }
    return {
      jobId: job.id,
      assetId: job.media_asset_id,
      ownerId: row.owner_id,
      mediaType: row.media_type,
      attempt: job.attempt_count,
      maxAttempts: job.max_attempts,
      claimToken,
      uploadId,
      uploadStatus: row.upload_status,
      uploadPrefix: row.object_key,
      expectedBytes,
      expectedParts: row.expected_parts,
      expectedChecksum: row.checksum_sha256,
    };
  });
}

async function assembleUpload(upload: ClaimedUpload, destination: string): Promise<string> {
  const receipts = await query<{ part_number: number; size_bytes: string; checksum_sha256: string | null }>(
    `SELECT part_number, size_bytes::text, checksum_sha256
       FROM media_upload_parts WHERE upload_session_id = $1 ORDER BY part_number`,
    [upload.uploadId],
  );
  if (receipts.rows.length !== upload.expectedParts) throw new Error("The upload receipt inventory is incomplete.");
  const output = await fs.open(destination, "wx");
  const sourceHash = createHash("sha256");
  let totalBytes = 0;
  try {
    for (let index = 0; index < upload.expectedParts; index += 1) {
      const part = receipts.rows[index];
      const expectedSize = chunkSizeForIndex(upload.expectedBytes, index);
      if (part.part_number !== index + 1 || Number(part.size_bytes) !== expectedSize || !part.checksum_sha256) {
        throw new Error(`Upload part ${index + 1} has an invalid receipt.`);
      }
      const body = await objectBuffer(ownerMediaPartKey(upload.uploadPrefix, part.part_number));
      const partHash = createHash("sha256").update(body).digest("hex");
      if (body.length !== expectedSize || partHash !== part.checksum_sha256) {
        throw new Error(`Upload part ${part.part_number} does not match its receipt.`);
      }
      await output.write(body);
      sourceHash.update(body);
      totalBytes += body.length;
      if (totalBytes > upload.expectedBytes) throw new Error("The assembled source exceeds its reservation.");
    }
  } finally {
    await output.close();
  }
  if (totalBytes !== upload.expectedBytes) throw new Error("The assembled source is incomplete.");
  const checksum = sourceHash.digest("hex");
  if (upload.expectedChecksum && checksum !== upload.expectedChecksum) throw new Error("The assembled source checksum does not match the upload declaration.");
  return checksum;
}

function requireDetectedType(mediaType: MediaType, mime: string): void {
  const accepted = mediaType === "AUDIO" ? audioMimes : mediaType === "VIDEO" ? videoMimes : imageMimes;
  if (!accepted.has(mime)) throw new Error(`The detected ${mime} source is not valid for a ${mediaType.toLowerCase()} asset.`);
}

function audioStream(probe: Probe) {
  return probe.streams?.find((stream) => stream.codec_type === "audio");
}

function videoStream(probe: Probe) {
  return probe.streams?.find((stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1);
}

async function processAudio(upload: ClaimedUpload, source: string, sourceChecksum: string, detected: { ext: string; mime: string }, workDir: string, prefix: string): Promise<ProcessingResult> {
  const probe = await ffprobe(source);
  const stream = audioStream(probe);
  if (!stream) throw new Error("The detected audio source has no audio stream.");
  const durationSeconds = probeDuration(probe);
  if (durationSeconds > env().RADIO_TRACK_MAX_DURATION_SECONDS) throw new Error("The audio source exceeds the configured duration limit.");
  const sampleRate = boundedPositive(stream.sample_rate);
  const channels = boundedPositive(stream.channels);
  if (!sampleRate || !channels || !stream.codec_name) throw new Error("The audio source metadata is incomplete.");

  const normalized = path.join(workDir, "normalized.flac");
  const hlsDirectory = path.join(workDir, "audio-hls");
  await fs.mkdir(hlsDirectory);
  await run("ffmpeg", [
    "-hide_banner", "-nostdin", "-y", "-i", source, "-map", `0:${stream.index}`,
    "-map_metadata", "-1", "-map_chapters", "-1", "-vn", "-sn", "-dn",
    "-ar", "48000", "-ac", "2", "-sample_fmt", "s16", "-c:a", "flac", "-compression_level", "8", normalized,
  ]);
  await run("ffmpeg", [
    "-hide_banner", "-nostdin", "-y", "-i", normalized, "-map", "0:a:0",
    "-vn", "-sn", "-dn", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    "-hls_segment_filename", path.join(hlsDirectory, "segment_%05d.ts"), path.join(hlsDirectory, "index.m3u8"),
  ]);

  const sourceKey = `${prefix}/original/source.${detected.ext}`;
  const normalizedKey = `${prefix}/audio/normalized.flac`;
  const hlsPrefix = `${prefix}/audio/hls`;
  await storage.fPutObject(bucket, sourceKey, source, { "Content-Type": detected.mime });
  await storage.fPutObject(bucket, normalizedKey, normalized, { "Content-Type": "audio/flac" });
  const hls = await uploadDirectory(hlsDirectory, hlsPrefix);
  const normalizedDescription = await describeFile(normalized);
  const manifestDescription = await describeFile(path.join(hlsDirectory, "index.m3u8"));
  const durationMs = Math.round(durationSeconds * 1000);
  const bitrate = boundedPositive(stream.bit_rate ?? probe.format?.bit_rate);
  return {
    sourceObjectKey: sourceKey,
    mimeType: detected.mime,
    checksumSha256: sourceChecksum,
    metadata: { detectedMimeType: detected.mime, sourceFormat: probe.format?.format_name ?? null },
    durationMs,
    audioCodec: stream.codec_name,
    audioSampleRateHz: sampleRate,
    audioChannels: channels,
    bitrateBps: bitrate,
    variants: [
      { role: "SOURCE", objectKey: sourceKey, mimeType: detected.mime, sizeBytes: upload.expectedBytes, checksumSha256: sourceChecksum, technicalMetadata: { detectedExtension: detected.ext }, durationMs, codec: stream.codec_name, bitrateBps: bitrate, sampleRateHz: sampleRate, channels },
      { role: "MEZZANINE", objectKey: normalizedKey, mimeType: "audio/flac", ...normalizedDescription, technicalMetadata: { normalized: true }, durationMs, codec: "flac", sampleRateHz: 48_000, channels: 2 },
      { role: "HLS_MANIFEST", objectKey: `${hlsPrefix}/index.m3u8`, mimeType: "application/vnd.apple.mpegurl", sizeBytes: hls.sizeBytes, checksumSha256: manifestDescription.checksumSha256, technicalMetadata: { codec: "aac", segmentSeconds: 4, files: hls.files }, durationMs, codec: "aac", bitrateBps: 128_000, sampleRateHz: 48_000, channels: 2 },
    ],
  };
}

function videoHlsArgs(source: string, output: string, streamIndex: number, audioIndex: number | undefined, width: number, height: number): string[] {
  const args = ["-hide_banner", "-nostdin", "-y", "-i", source];
  if (audioIndex === undefined) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  args.push(
    "-map", `0:${streamIndex}`, "-map", audioIndex === undefined ? "1:a:0" : `0:${audioIndex}`,
    "-vf", `scale=w='min(${width}\\,iw)':h='min(${height}\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`,
    "-c:v", "libx264", "-preset", env().TRANSCODE_CPU_PRESET, "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
  );
  if (audioIndex === undefined) args.push("-shortest");
  args.push(
    "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    "-hls_segment_filename", path.join(output, "segment_%05d.ts"), path.join(output, "index.m3u8"),
  );
  return args;
}

async function processVideo(upload: ClaimedUpload, source: string, sourceChecksum: string, detected: { ext: string; mime: string }, workDir: string, prefix: string): Promise<ProcessingResult> {
  const probe = await ffprobe(source);
  const video = videoStream(probe);
  if (!video?.width || !video.height || !video.codec_name) throw new Error("The detected video source has no readable video stream.");
  const audio = audioStream(probe);
  const durationSeconds = probeDuration(probe);
  if (durationSeconds > env().YOUTUBE_IMPORT_MAX_DURATION_SECONDS) throw new Error("The video source exceeds the configured duration limit.");
  const frameRate = parseFrameRate(video.avg_frame_rate);
  const hlsDirectory = path.join(workDir, "video-hls");
  const thumbnail = path.join(workDir, "thumbnail.jpg");
  await fs.mkdir(path.join(hlsDirectory, "360p"), { recursive: true });
  await fs.mkdir(path.join(hlsDirectory, "720p"), { recursive: true });
  await run("ffmpeg", videoHlsArgs(source, path.join(hlsDirectory, "360p"), video.index, audio?.index, 640, 360));
  await run("ffmpeg", videoHlsArgs(source, path.join(hlsDirectory, "720p"), video.index, audio?.index, 1280, 720));
  await run("ffmpeg", [
    "-hide_banner", "-nostdin", "-y", "-ss", String(Math.min(Math.max(durationSeconds * 0.1, 0.5), 5)),
    "-i", source, "-map", `0:${video.index}`, "-frames:v", "1",
    "-vf", "scale=w='min(640\\,iw)':h='min(360\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black",
    "-c:v", "mjpeg", "-q:v", "3", thumbnail,
  ]);
  await fs.writeFile(path.join(hlsDirectory, "master.m3u8"), [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    '#EXT-X-STREAM-INF:BANDWIDTH=928000,RESOLUTION=640x360,CODECS="avc1.4d401f,mp4a.40.2"',
    "360p/index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=2628000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
    "720p/index.m3u8",
    "",
  ].join("\n"));

  const sourceKey = `${prefix}/original/source.${detected.ext}`;
  const hlsPrefix = `${prefix}/video/hls`;
  const thumbnailKey = `${prefix}/video/thumbnail.jpg`;
  await storage.fPutObject(bucket, sourceKey, source, { "Content-Type": detected.mime });
  const hls = await uploadDirectory(hlsDirectory, hlsPrefix);
  await storage.fPutObject(bucket, thumbnailKey, thumbnail, { "Content-Type": "image/jpeg" });
  const masterDescription = await describeFile(path.join(hlsDirectory, "master.m3u8"));
  const thumbnailDescription = await describeFile(thumbnail);
  const durationMs = Math.round(durationSeconds * 1000);
  const sampleRate = boundedPositive(audio?.sample_rate);
  const channels = boundedPositive(audio?.channels);
  const bitrate = boundedPositive(probe.format?.bit_rate ?? video.bit_rate);
  return {
    sourceObjectKey: sourceKey,
    mimeType: detected.mime,
    checksumSha256: sourceChecksum,
    metadata: { detectedMimeType: detected.mime, sourceFormat: probe.format?.format_name ?? null, sourceHasAudio: Boolean(audio), hlsAudio: audio ? "source" : "generated-silence" },
    durationMs,
    width: video.width,
    height: video.height,
    frameRate,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name,
    audioSampleRateHz: sampleRate,
    audioChannels: channels,
    bitrateBps: bitrate,
    variants: [
      { role: "SOURCE", objectKey: sourceKey, mimeType: detected.mime, sizeBytes: upload.expectedBytes, checksumSha256: sourceChecksum, technicalMetadata: { detectedExtension: detected.ext, sourceHasAudio: Boolean(audio) }, durationMs, width: video.width, height: video.height, codec: video.codec_name, bitrateBps: bitrate },
      { role: "HLS_MANIFEST", objectKey: `${hlsPrefix}/master.m3u8`, mimeType: "application/vnd.apple.mpegurl", sizeBytes: hls.sizeBytes, checksumSha256: masterDescription.checksumSha256, technicalMetadata: { renditions: ["360p", "720p"], audio: audio ? "source-aac" : "aac-silence", files: hls.files }, durationMs, width: 1280, height: 720, codec: "h264", sampleRateHz: 48_000, channels: 2 },
      { role: "THUMBNAIL", objectKey: thumbnailKey, mimeType: "image/jpeg", ...thumbnailDescription, technicalMetadata: { frameAtSeconds: Math.min(Math.max(durationSeconds * 0.1, 0.5), 5) }, width: 640, height: 360, codec: "mjpeg" },
    ],
  };
}

async function processImage(upload: ClaimedUpload, source: string, sourceChecksum: string, detected: { ext: string; mime: string }, workDir: string, prefix: string): Promise<ProcessingResult> {
  const image = sharp(source, { failOn: "error", limitInputPixels: 40_000_000, pages: 1 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error("The detected image has no readable dimensions.");
  const thumbnail = path.join(workDir, "thumbnail.jpg");
  const poster = path.join(workDir, "poster.jpg");
  await sharp(source, { failOn: "error", limitInputPixels: 40_000_000, pages: 1 })
    .rotate().resize(320, 320, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#000000" }).jpeg({ quality: 86 }).toFile(thumbnail);
  await sharp(source, { failOn: "error", limitInputPixels: 40_000_000, pages: 1 })
    .rotate().resize(1280, 720, { fit: "contain", background: "#000000" }).flatten({ background: "#000000" }).jpeg({ quality: 88 }).toFile(poster);
  const thumbnailMetadata = await sharp(thumbnail).metadata();
  const posterMetadata = await sharp(poster).metadata();
  if (!thumbnailMetadata.width || !thumbnailMetadata.height || !posterMetadata.width || !posterMetadata.height) {
    throw new Error("The generated image variants have invalid dimensions.");
  }

  const sourceKey = `${prefix}/original/source.${detected.ext}`;
  const thumbnailKey = `${prefix}/image/thumbnail.jpg`;
  const posterKey = `${prefix}/image/poster.jpg`;
  await storage.fPutObject(bucket, sourceKey, source, { "Content-Type": detected.mime });
  await Promise.all([
    storage.fPutObject(bucket, thumbnailKey, thumbnail, { "Content-Type": "image/jpeg" }),
    storage.fPutObject(bucket, posterKey, poster, { "Content-Type": "image/jpeg" }),
  ]);
  const thumbnailDescription = await describeFile(thumbnail);
  const posterDescription = await describeFile(poster);
  return {
    sourceObjectKey: sourceKey,
    mimeType: detected.mime,
    checksumSha256: sourceChecksum,
    metadata: { detectedMimeType: detected.mime, sourceFormat: metadata.format, pages: metadata.pages ?? 1 },
    width: metadata.width,
    height: metadata.height,
    variants: [
      { role: "SOURCE", objectKey: sourceKey, mimeType: detected.mime, sizeBytes: upload.expectedBytes, checksumSha256: sourceChecksum, technicalMetadata: { format: metadata.format, pages: metadata.pages ?? 1 }, width: metadata.width, height: metadata.height, codec: metadata.format },
      { role: "THUMBNAIL", objectKey: thumbnailKey, mimeType: "image/jpeg", ...thumbnailDescription, technicalMetadata: { fit: "inside", maximum: 320 }, width: thumbnailMetadata.width, height: thumbnailMetadata.height, codec: "jpeg" },
      { role: "POSTER", objectKey: posterKey, mimeType: "image/jpeg", ...posterDescription, technicalMetadata: { fit: "contain" }, width: posterMetadata.width, height: posterMetadata.height, codec: "jpeg" },
    ],
  };
}

async function finalizeWinningClaim(upload: ClaimedUpload, result: ProcessingResult): Promise<boolean> {
  return transaction(async (client) => {
    const winner = await client.query(
      `SELECT id FROM media_processing_jobs
        WHERE id = $1 AND media_asset_id = $2 AND status = 'RUNNING' AND claim_token = $3
        FOR UPDATE`,
      [upload.jobId, upload.assetId, upload.claimToken],
    );
    if (!winner.rowCount) return false;
    const variantIds = new Map<string, string>();
    for (const variant of result.variants) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO media_asset_variants
         (media_asset_id, role, generation, status, storage_authority, object_key,
          mime_type, size_bytes, checksum_sha256, technical_metadata, duration_ms,
          width, height, codec, bitrate_bps, sample_rate_hz, channels, ready_at)
         VALUES ($1, $2, $3, 'READY', 'CANONICAL', $4, $5, $6, $7, $8::jsonb,
                 $9, $10, $11, $12, $13, $14, $15, now())
         RETURNING id`,
        [upload.assetId, variant.role, upload.attempt, variant.objectKey, variant.mimeType, variant.sizeBytes, variant.checksumSha256, JSON.stringify({ ...variant.technicalMetadata, claimToken: upload.claimToken }), variant.durationMs ?? null, variant.width ?? null, variant.height ?? null, variant.codec ?? null, variant.bitrateBps ?? null, variant.sampleRateHz ?? null, variant.channels ?? null],
      );
      variantIds.set(variant.role, inserted.rows[0].id);
    }
    const updated = await client.query(
      `UPDATE media_assets SET status = 'READY', source_object_key = $2, mime_type = $3,
              checksum_sha256 = $4, metadata = metadata || $5::jsonb, duration_ms = $6,
              width = $7, height = $8, frame_rate = $9, video_codec = $10,
              audio_codec = $11, audio_sample_rate_hz = $12, audio_channels = $13,
              bitrate_bps = $14, ready_at = now(), version = version + 1, updated_at = now()
        WHERE id = $1 AND owner_id = $15 AND status = 'PROCESSING'
          AND EXISTS (SELECT 1 FROM media_processing_jobs job
                       WHERE job.id = $16 AND job.claim_token = $17 AND job.status = 'RUNNING')
        RETURNING id`,
      [upload.assetId, result.sourceObjectKey, result.mimeType, result.checksumSha256, JSON.stringify(result.metadata), result.durationMs ?? null, result.width ?? null, result.height ?? null, result.frameRate ?? null, result.videoCodec ?? null, result.audioCodec ?? null, result.audioSampleRateHz ?? null, result.audioChannels ?? null, result.bitrateBps ?? null, upload.ownerId, upload.jobId, upload.claimToken],
    );
    if (!updated.rowCount) throw new Error("The winning media claim could not publish its asset.");
    const preferredRole = upload.mediaType === "AUDIO" ? "MEZZANINE" : upload.mediaType === "VIDEO" ? "HLS_MANIFEST" : "SOURCE";
    await client.query(
      `UPDATE media_processing_jobs SET status = 'SUCCEEDED', media_asset_variant_id = $2,
              result = $3::jsonb, claim_token = NULL, claimed_by = NULL,
              lease_expires_at = NULL, finished_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'RUNNING' AND claim_token = $4`,
      [upload.jobId, variantIds.get(preferredRole) ?? null, JSON.stringify({ claimToken: upload.claimToken, variants: result.variants.map((variant) => variant.objectKey) }), upload.claimToken],
    );
    await client.query(
      `INSERT INTO media_gc_tasks
       (owner_id, media_asset_id, task_kind, storage_authority, object_key, reason)
       VALUES ($1, $2, 'DELETE_PREFIX', 'CANONICAL', $3, 'canonical upload parts processed')
       ON CONFLICT (storage_authority, object_key) DO NOTHING`,
      [upload.ownerId, upload.assetId, upload.uploadPrefix],
    );
    return true;
  });
}

type DurableClaim = {
  jobId: string;
  assetId: string;
  claimToken: string;
};

async function finishFailedClaim(
  claim: DurableClaim,
  error: unknown,
  fallbackMessage: string,
  onFinalFailure: (client: PoolClient, message: string) => Promise<void>,
): Promise<void> {
  const message = (error instanceof Error ? error.message : fallbackMessage).slice(0, 4000);
  await transaction(async (client) => {
    const winner = await client.query<{ attempt_count: number; max_attempts: number }>(
      `SELECT attempt_count, max_attempts FROM media_processing_jobs
        WHERE id = $1 AND status = 'RUNNING' AND claim_token = $2 FOR UPDATE`,
      [claim.jobId, claim.claimToken],
    );
    if (!winner.rows[0]) return;
    const finalAttempt = winner.rows[0].attempt_count >= winner.rows[0].max_attempts;
    const finished = await client.query(
      `UPDATE media_processing_jobs SET status = $3, last_error = $4,
               claim_token = NULL, claimed_by = NULL, lease_expires_at = NULL,
               available_at = CASE WHEN $3 = 'QUEUED' THEN now() + (LEAST(attempt_count, 6) * interval '10 seconds') ELSE available_at END,
               finished_at = CASE WHEN $3 = 'FAILED' THEN now() ELSE NULL END, updated_at = now()
        WHERE id = $1 AND status = 'RUNNING' AND claim_token = $2`,
      [claim.jobId, claim.claimToken, finalAttempt ? "FAILED" : "QUEUED", message],
    );
    if (finalAttempt && finished.rowCount) await onFinalFailure(client, message);
  });
}

async function cleanClaimOutput(upload: Pick<ClaimedUpload, "ownerId" | "assetId">, outputPrefix: string): Promise<void> {
  try {
    await removePrefix(`${outputPrefix}/`);
  } catch (error) {
    console.error(`Could not remove media claim output ${outputPrefix}:`, error);
    await query(
      `INSERT INTO media_gc_tasks
       (owner_id, media_asset_id, task_kind, storage_authority, object_key, reason)
       VALUES ($1, $2, 'DELETE_PREFIX', 'CANONICAL', $3, 'failed canonical processing claim')
       ON CONFLICT (storage_authority, object_key) DO NOTHING`,
      [upload.ownerId, upload.assetId, `${outputPrefix}/`],
    ).catch(() => undefined);
  }
}

type ClaimedTvAutomation = DurableClaim & {
  ownerId: string;
  sourceVariantId: string;
  sourceObjectKey: string;
  sourceSizeBytes: number;
};

async function downloadTvAutomationSource(source: ClaimedTvAutomation, destination: string): Promise<void> {
  if (isChunkSourcePrefix(source.sourceObjectKey)) {
    const output = await fs.open(destination, "wx");
    let written = 0;
    try {
      for (const chunk of chunkManifest(source.sourceObjectKey, source.sourceSizeBytes)) {
        const buffer = await objectBuffer(chunk.name);
        if (buffer.length !== chunk.size) throw new Error(`TV automation source chunk ${chunk.index} has an invalid size.`);
        await output.write(buffer);
        written += buffer.length;
      }
    } finally {
      await output.close();
    }
    if (written !== source.sourceSizeBytes) throw new Error("TV automation chunked source has an invalid total size.");
    return;
  }
  await pipeline(await storage.getObject(bucket, source.sourceObjectKey), createWriteStream(destination, { flags: "wx" }));
  const downloaded = await fs.stat(destination);
  if (downloaded.size !== source.sourceSizeBytes) throw new Error("TV automation source has an invalid downloaded size.");
}

async function claimTvAutomationJob(processingJobId: string): Promise<ClaimedTvAutomation | null> {
  const claimToken = randomUUID();
  return transaction(async (client) => {
    const claimed = await client.query<{
      id: string;
      media_asset_id: string;
      idempotency_key: string;
      payload: { profile?: unknown; sourceVariantId?: unknown; sourceGeneration?: unknown };
    }>(
      `UPDATE media_processing_jobs SET status = 'RUNNING', claim_token = $2, claimed_by = $3,
              lease_expires_at = now() + ($4 * interval '1 second'), attempt_count = attempt_count + 1,
              started_at = COALESCE(started_at, now()), finished_at = NULL, last_error = NULL, updated_at = now()
        WHERE id = $1 AND job_type = 'PREPARE_TV_AUTOMATION' AND attempt_count < max_attempts
          AND ((status = 'QUEUED' AND available_at <= now()) OR (status = 'RUNNING' AND lease_expires_at < now()))
        RETURNING id, media_asset_id, idempotency_key, payload`,
      [processingJobId, claimToken, workerIdentity, leaseSeconds],
    );
    const durable = claimed.rows[0];
    if (!durable) return null;
    const { profile, sourceVariantId, sourceGeneration } = durable.payload;
    if (profile !== TV_CHANNEL_PROFILE
      || typeof sourceVariantId !== "string"
      || !sourceVariantId
      || !Number.isInteger(sourceGeneration)
      || durable.idempotency_key !== `${TV_CHANNEL_PROFILE}:${sourceVariantId}`) {
      throw new Error("The TV automation job has an invalid source contract.");
    }
    const source = await client.query<{
      owner_id: string;
      media_type: string;
      asset_status: string;
      generation: number;
      role: string;
       variant_status: string;
       storage_authority: string;
       object_key: string;
       size_bytes: string;
    }>(
      `SELECT asset.owner_id, asset.media_type::text, asset.status::text AS asset_status,
              source.generation, source.role::text, source.status::text AS variant_status,
               source.storage_authority::text, source.object_key, source.size_bytes::text
         FROM media_assets asset
         JOIN media_asset_variants source ON source.media_asset_id = asset.id
        WHERE asset.id = $1 AND source.id = $2`,
      [durable.media_asset_id, sourceVariantId],
    );
    const row = source.rows[0];
    const sourceSizeBytes = Number(row?.size_bytes);
    if (!row
      || row.media_type !== "VIDEO"
      || !["READY", "ARCHIVED"].includes(row.asset_status)
      || row.generation !== sourceGeneration
      || row.role !== "SOURCE"
      || row.variant_status !== "READY"
      || row.storage_authority === "EXTERNAL"
      || !Number.isSafeInteger(sourceSizeBytes)
      || sourceSizeBytes < 1) {
      throw new Error("The TV automation job source is no longer eligible.");
    }
    return {
      jobId: durable.id,
      assetId: durable.media_asset_id,
      ownerId: row.owner_id,
      sourceVariantId,
      sourceObjectKey: row.object_key,
      sourceSizeBytes,
      claimToken,
    };
  });
}

async function prepareTvAutomation(job: Job<MediaProcessingJob>): Promise<void> {
  const automation = await claimTvAutomationJob(job.data.processingJobId);
  if (!automation) return;
  const claimPrefix = ownerMediaClaimPrefix(automation.ownerId, automation.assetId, automation.claimToken);
  const outputPrefix = `${claimPrefix}/tv/${TV_CHANNEL_PROFILE}`;
  const renewal = startLeaseRenewal(automation);
  let workDir: string | null = null;
  let published = false;
  try {
    workDir = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-tv-${automation.assetId}-`));
    const source = path.join(workDir, "source");
    const outputDirectory = path.join(workDir, "tv");
    await fs.mkdir(path.join(outputDirectory, "720p"), { recursive: true });
    await fs.mkdir(path.join(outputDirectory, "360p"), { recursive: true });
    await downloadTvAutomationSource(automation, source);
    await job.updateProgress(10);

    const probe = await ffprobe(source);
    if (!videoStream(probe)) throw new Error("The TV automation source has no readable video stream.");
    await run("ffmpeg", tvChannelV1Args(source, outputDirectory, Boolean(audioStream(probe))));

    const masterPath = path.join(outputDirectory, "master.m3u8");
    const highPlaylistPath = path.join(outputDirectory, "720p", "index.m3u8");
    const lowPlaylistPath = path.join(outputDirectory, "360p", "index.m3u8");
    const [master, highPlaylist, lowPlaylist] = await Promise.all([
      fs.readFile(masterPath, "utf8"),
      fs.readFile(highPlaylistPath, "utf8"),
      fs.readFile(lowPlaylistPath, "utf8"),
    ]);
    validateTvChannelMasterPlaylist(master);
    const inventory = validateTvChannelSegmentInventories({ "720p": highPlaylist, "360p": lowPlaylist });
    const expectedFiles = new Set([
      "master.m3u8",
      ...tvChannelRenditions.flatMap((rendition) => [
        `${rendition}/index.m3u8`,
        ...inventory.renditions[rendition].map((segment) => `${rendition}/${segment.name}`),
      ]),
    ]);
    const generatedFiles = await filesUnder(outputDirectory);
    if (generatedFiles.length !== expectedFiles.size || generatedFiles.some((file) => !expectedFiles.has(file.relative))) {
      throw new Error("The TV automation output contains an unexpected file inventory.");
    }

    const [masterDescription, highPlaylistDescription, lowPlaylistDescription, highSegmentDescriptions, lowSegmentDescriptions] = await Promise.all([
      describeFile(masterPath),
      describeFile(highPlaylistPath),
      describeFile(lowPlaylistPath),
      Promise.all(inventory.renditions["720p"].map((segment) => describeFile(path.join(outputDirectory, "720p", segment.name)))),
      Promise.all(inventory.renditions["360p"].map((segment) => describeFile(path.join(outputDirectory, "360p", segment.name)))),
    ]);
    const playlistDescriptions = { "720p": highPlaylistDescription, "360p": lowPlaylistDescription };
    const segmentDescriptions = { "720p": highSegmentDescriptions, "360p": lowSegmentDescriptions };
    const uploaded = await uploadDirectory(outputDirectory, outputPrefix);
    await job.updateProgress(90);

    const refreshStations = await transaction(async (client) => {
      const winner = await client.query(
        `SELECT id FROM media_processing_jobs
          WHERE id = $1 AND media_asset_id = $2 AND status = 'RUNNING' AND claim_token = $3
          FOR UPDATE`,
        [automation.jobId, automation.assetId, automation.claimToken],
      );
      if (!winner.rowCount) throw new Error("The TV automation worker lost its claim.");
      const asset = await client.query("SELECT id FROM media_assets WHERE id = $1 FOR UPDATE", [automation.assetId]);
      if (!asset.rowCount) throw new Error("The TV automation media asset no longer exists.");

      const descriptor = await client.query<{ id: string }>(
        `INSERT INTO tv_channel_delivery_descriptors
           (profile, master_playlist_object_key, master_playlist_checksum_sha256,
            duration_ms, segment_duration_ms, segment_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [TV_CHANNEL_PROFILE, `${outputPrefix}/master.m3u8`, masterDescription.checksumSha256,
          inventory.durationMs, inventory.segmentDurationMs, inventory.segmentCount],
      );
      const descriptorId = descriptor.rows[0].id;
      for (const rendition of tvChannelRenditions) {
        const contract = tvChannelRenditionContract[rendition];
        await client.query(
          `INSERT INTO tv_channel_delivery_renditions
             (descriptor_id, rendition, playlist_object_key, playlist_checksum_sha256,
              width, height, frame_rate, video_codec, video_profile, video_level, pixel_format,
              color_primaries, color_transfer, color_space, video_bitrate_bps, vbv_minrate_bps,
              vbv_maxrate_bps, vbv_bufsize_bps, gop_frames, b_frames, audio_codec,
              audio_profile, audio_bitrate_bps, audio_sample_rate_hz, audio_channels)
           VALUES ($1, $2, $3, $4, $5, $6, 30, 'h264', 'Main', '3.1', 'yuv420p',
                   'bt709', 'bt709', 'bt709', $7, $7, $7, $8, 60, 0, 'aac', 'LC', 128000, 48000, 2)`,
          [descriptorId, rendition, `${outputPrefix}/${rendition}/index.m3u8`,
            playlistDescriptions[rendition].checksumSha256, contract.width, contract.height,
            contract.bitrateBps, contract.bufferSizeBps],
        );
      }
      const segmentRows = tvChannelRenditions.flatMap((rendition) => inventory.renditions[rendition].map((segment, index) => ({
        rendition,
        index: segment.index,
        startOffsetMs: segment.startOffsetMs,
        durationMs: segment.durationMs,
        objectKey: `${outputPrefix}/${rendition}/${segment.name}`,
        ...segmentDescriptions[rendition][index],
      })));
      await client.query(
        `INSERT INTO tv_channel_delivery_segments
           (descriptor_id, rendition, segment_index, start_offset_ms, duration_ms,
            object_key, size_bytes, checksum_sha256)
         SELECT $1, segment.rendition, segment.segment_index, segment.start_offset_ms,
                segment.duration_ms, segment.object_key, segment.size_bytes, segment.checksum_sha256
           FROM unnest($2::text[], $3::integer[], $4::bigint[], $5::integer[],
                       $6::text[], $7::bigint[], $8::text[])
             AS segment(rendition, segment_index, start_offset_ms, duration_ms,
                        object_key, size_bytes, checksum_sha256)`,
        [descriptorId,
          segmentRows.map((segment) => segment.rendition),
          segmentRows.map((segment) => segment.index),
          segmentRows.map((segment) => segment.startOffsetMs),
          segmentRows.map((segment) => segment.durationMs),
          segmentRows.map((segment) => segment.objectKey),
          segmentRows.map((segment) => segment.sizeBytes),
          segmentRows.map((segment) => segment.checksumSha256)],
      );
      const generation = await client.query<{ generation: number }>(
        `SELECT (COALESCE(MAX(generation), 0) + 1)::integer AS generation
           FROM media_asset_variants WHERE media_asset_id = $1 AND role = 'TV_AUTOMATION'`,
        [automation.assetId],
      );
      const variant = await client.query<{ id: string }>(
        `INSERT INTO media_asset_variants
           (media_asset_id, role, generation, status, storage_authority, object_key, mime_type,
            size_bytes, checksum_sha256, technical_metadata, duration_ms, width, height, codec,
            bitrate_bps, sample_rate_hz, channels, ready_at)
         VALUES ($1, 'TV_AUTOMATION', $2, 'READY', 'CANONICAL', $3,
                 'application/vnd.apple.mpegurl', $4, $5, $6::jsonb, $7,
                 1280, 720, 'h264', 2500000, 48000, 2, now())
         RETURNING id`,
        [automation.assetId, generation.rows[0].generation, `${outputPrefix}/master.m3u8`,
          uploaded.sizeBytes, masterDescription.checksumSha256,
          JSON.stringify({ profile: TV_CHANNEL_PROFILE, descriptorId, sourceVariantId: automation.sourceVariantId,
            segmentDurationMs: inventory.segmentDurationMs, segmentCount: inventory.segmentCount,
            renditions: tvChannelRenditions, files: uploaded.files }), inventory.durationMs],
      );
      const derivative = await client.query<{ id: string }>(
        `INSERT INTO tv_channel_derivatives
           (descriptor_id, media_asset_id, source_media_asset_variant_id,
            media_asset_variant_id, profile)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [descriptorId, automation.assetId, automation.sourceVariantId, variant.rows[0].id, TV_CHANNEL_PROFILE],
      );
      await client.query(
        `UPDATE media_processing_jobs SET status = 'SUCCEEDED', media_asset_variant_id = $2,
                result = $3::jsonb, claim_token = NULL, claimed_by = NULL,
                lease_expires_at = NULL, finished_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'RUNNING' AND claim_token = $4`,
        [automation.jobId, variant.rows[0].id,
          JSON.stringify({ profile: TV_CHANNEL_PROFILE, descriptorId, derivativeId: derivative.rows[0].id,
            variantId: variant.rows[0].id, segmentCount: inventory.segmentCount, durationMs: inventory.durationMs }),
          automation.claimToken],
      );
      const projected = await client.query<{ station_id: string }>(
        `UPDATE videos video SET duration_ms = $2, updated_at = now()
           FROM stations station
          WHERE video.media_asset_id = $1 AND video.status = 'READY'
            AND station.id = video.station_id AND station.tv_delivery_mode = 'CHANNEL_HLS'
            AND EXISTS (SELECT 1 FROM playlist_items item
                         WHERE item.station_id = video.station_id AND item.video_id = video.id)
          RETURNING video.station_id`,
        [automation.assetId, inventory.durationMs],
      );
      const stationIds = [...new Set(projected.rows.map((row) => row.station_id))];
      const refresh: string[] = [];
      for (const stationId of stationIds) {
        const publication = await publishAfterScheduleMutation(client, stationId);
        if (publication.activeChanged) refresh.push(stationId);
      }
      return refresh;
    });
    published = true;
    await Promise.all(refreshStations.map(publishScheduleRefresh));
    await job.updateProgress(100);
  } catch (error) {
    if (!published) {
      await finishFailedClaim(automation, error, "TV automation preparation failed.", () => Promise.resolve());
      await cleanClaimOutput(automation, claimPrefix);
    }
    throw error;
  } finally {
    await renewal.stop();
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  }
}

type ClaimedClip = {
  jobId: string;
  assetId: string;
  ownerId: string;
  clipId: string;
  claimToken: string;
  attempt: number;
  startMs: number;
  endMs: number;
  parentObjectKey: string;
};

async function claimClipJob(processingJobId: string): Promise<ClaimedClip | null> {
  const claimToken = randomUUID();
  return transaction(async (client) => {
    const claimed = await client.query<{ id: string; media_asset_id: string; attempt_count: number; payload: { clipId?: string } }>(
      `UPDATE media_processing_jobs SET status = 'RUNNING', claim_token = $2, claimed_by = $3,
              lease_expires_at = now() + ($4 * interval '1 second'), attempt_count = attempt_count + 1,
              started_at = COALESCE(started_at, now()), finished_at = NULL, last_error = NULL, updated_at = now()
        WHERE id = $1 AND job_type = 'MATERIALIZE_CLIP' AND attempt_count < max_attempts
          AND ((status = 'QUEUED' AND available_at <= now()) OR (status = 'RUNNING' AND lease_expires_at < now()))
        RETURNING id, media_asset_id, attempt_count, payload`,
      [processingJobId, claimToken, workerIdentity, leaseSeconds],
    );
    const durable = claimed.rows[0];
    if (!durable?.payload.clipId) return null;
    const clip = await client.query<{ owner_id: string; start_ms: string; end_ms: string; object_key: string }>(
      `SELECT clip.owner_id, clip.start_ms::text, clip.end_ms::text, variant.object_key
         FROM studio_asset_clips clip
         JOIN media_asset_variants variant ON variant.media_asset_id = clip.parent_media_asset_id
        WHERE clip.id = $1 AND clip.child_media_asset_id = $2
          AND variant.role = 'MEZZANINE' AND variant.status = 'READY'
        ORDER BY variant.generation DESC LIMIT 1 FOR UPDATE OF clip`,
      [durable.payload.clipId, durable.media_asset_id],
    );
    if (!clip.rows[0]) throw new Error("The clip parent is no longer playable.");
    return {
      jobId: durable.id, assetId: durable.media_asset_id, ownerId: clip.rows[0].owner_id,
      clipId: durable.payload.clipId, claimToken, attempt: durable.attempt_count,
      startMs: Number(clip.rows[0].start_ms), endMs: Number(clip.rows[0].end_ms), parentObjectKey: clip.rows[0].object_key,
    };
  });
}

async function materializeMediaClip(job: Job<MediaProcessingJob>): Promise<void> {
  const clip = await claimClipJob(job.data.processingJobId);
  if (!clip) return;
  const prefix = ownerMediaClaimPrefix(clip.ownerId, clip.assetId, clip.claimToken);
  const renewal = startLeaseRenewal(clip);
  let workDir: string | null = null;
  try {
    workDir = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-clip-${clip.clipId}-`));
    const parent = path.join(workDir, "parent.flac");
    const output = path.join(workDir, "clip.flac");
    const hlsDirectory = path.join(workDir, "hls");
    await pipeline(await storage.getObject(bucket, clip.parentObjectKey), createWriteStream(parent, { flags: "wx" }));
    await fs.mkdir(hlsDirectory);
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-ss", (clip.startMs / 1000).toFixed(3), "-i", parent, "-t", ((clip.endMs - clip.startMs) / 1000).toFixed(3), "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "2", "-sample_fmt", "s16", "-c:a", "flac", "-compression_level", "8", output]);
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-i", output, "-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-hls_segment_filename", path.join(hlsDirectory, "segment_%05d.ts"), path.join(hlsDirectory, "index.m3u8")]);
    const description = await describeFile(output);
    const hls = await uploadDirectory(hlsDirectory, `${prefix}/clip/hls`);
    const manifest = await describeFile(path.join(hlsDirectory, "index.m3u8"));
    const sourceKey = `${prefix}/clip/clip.flac`;
    await storage.fPutObject(bucket, sourceKey, output, { "Content-Type": "audio/flac" });
    const durationMs = clip.endMs - clip.startMs;
    await transaction(async (client) => {
      const winner = await client.query("SELECT id FROM media_processing_jobs WHERE id = $1 AND status = 'RUNNING' AND claim_token = $2 FOR UPDATE", [clip.jobId, clip.claimToken]);
      if (!winner.rowCount) throw new Error("The clip worker lost its claim.");
      for (const variant of [
        { role: "SOURCE", key: sourceKey, mime: "audio/flac", size: description.sizeBytes, checksum: description.checksumSha256, codec: "flac" },
        { role: "MEZZANINE", key: sourceKey, mime: "audio/flac", size: description.sizeBytes, checksum: description.checksumSha256, codec: "flac" },
        { role: "HLS_MANIFEST", key: `${prefix}/clip/hls/index.m3u8`, mime: "application/vnd.apple.mpegurl", size: hls.sizeBytes, checksum: manifest.checksumSha256, codec: "aac" },
      ]) await client.query(
        `INSERT INTO media_asset_variants
           (media_asset_id, role, generation, status, storage_authority, object_key, mime_type,
            size_bytes, checksum_sha256, technical_metadata, duration_ms, codec, sample_rate_hz, channels, ready_at)
         VALUES ($1, $2, $3, 'READY', 'CANONICAL', $4, $5, $6, $7, $8::jsonb, $9, $10, 48000, 2, now())`,
        [clip.assetId, variant.role, clip.attempt, variant.key, variant.mime, variant.size, variant.checksum, JSON.stringify({ clipId: clip.clipId, startMs: clip.startMs, endMs: clip.endMs }), durationMs, variant.codec],
      );
      await client.query(
        `UPDATE media_assets SET status = 'READY', source_object_key = $2, mime_type = 'audio/flac',
                checksum_sha256 = $3, quota_bytes = $4, duration_ms = $5, audio_codec = 'flac',
                audio_sample_rate_hz = 48000, audio_channels = 2, ready_at = now(),
                version = version + 1, updated_at = now()
          WHERE id = $1 AND owner_id = $6 AND status = 'PROCESSING'`,
        [clip.assetId, sourceKey, description.checksumSha256, description.sizeBytes, durationMs, clip.ownerId],
      );
      await client.query(
        `UPDATE media_processing_jobs SET status = 'SUCCEEDED', claim_token = NULL, claimed_by = NULL,
                lease_expires_at = NULL, finished_at = now(), result = $2::jsonb, updated_at = now()
          WHERE id = $1 AND claim_token = $3`,
        [clip.jobId, JSON.stringify({ clipId: clip.clipId, durationMs }), clip.claimToken],
      );
    });
    await job.updateProgress(100);
  } catch (error) {
    await finishFailedClaim(clip, error, "Clip processing failed.", async (client, rawMessage) => {
      const message = rawMessage.slice(0, 2000);
      await client.query(
        "UPDATE media_assets SET status = 'FAILED', metadata = metadata || $2::jsonb, version = version + 1, updated_at = now() WHERE id = $1 AND status = 'PROCESSING'",
        [clip.assetId, JSON.stringify({ clipError: message })],
      );
    });
    await removePrefix(`${prefix}/`).catch(() => undefined);
    throw error;
  } finally {
    await renewal.stop();
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  }
}

function startLeaseRenewal(claim: DurableClaim): { assertCurrent: (message?: string) => Promise<void>; stop: () => Promise<void> } {
  let stopped = false;
  let failure: Error | null = null;
  let renewalError: Error | null = null;
  let pending = Promise.resolve();
  let timer: NodeJS.Timeout | null = null;
  const loseClaim = (error: unknown): void => {
    failure = error instanceof Error ? error : new Error("Media job claim renewal failed.");
    stopped = true;
    if (timer) clearInterval(timer);
  };
  timer = setInterval(() => {
    pending = pending.then(async () => {
      if (stopped) return;
      const renewed = await query(
        `UPDATE media_processing_jobs SET lease_expires_at = now() + ($3 * interval '1 second'), updated_at = now()
         WHERE id = $1 AND status = 'RUNNING' AND claim_token = $2`,
        [claim.jobId, claim.claimToken, leaseSeconds],
      );
      renewalError = null;
      if (!renewed.rowCount) loseClaim(new Error(`Media job ${claim.jobId} lost its claim.`));
    }).catch((error) => {
      renewalError = error instanceof Error ? error : new Error("Media job claim renewal failed.");
      console.error(`Could not renew media job ${claim.jobId}:`, error);
    });
  }, 30_000);
  timer.unref();
  return {
    assertCurrent: async (message = "The media worker lost its claim.") => {
      await pending;
      if (failure) throw new Error(message, { cause: failure });
      if (renewalError) {
        loseClaim(renewalError);
        throw new Error(message, { cause: renewalError });
      }
      try {
        const current = await query(
          `SELECT 1 FROM media_processing_jobs
            WHERE id = $1 AND media_asset_id = $2 AND status = 'RUNNING'
              AND claim_token = $3 AND lease_expires_at > now()`,
          [claim.jobId, claim.assetId, claim.claimToken],
        );
        if (!current.rowCount) {
          loseClaim(new Error(`Media job ${claim.jobId} lost its claim.`));
          throw new Error(message, { cause: failure });
        }
      } catch (error) {
        if (!failure) loseClaim(error);
        if (error instanceof Error && error.message === message) throw error;
        throw new Error(message, { cause: error });
      }
    },
    stop: async () => {
      stopped = true;
      if (timer) clearInterval(timer);
      await pending;
    },
  };
}

async function processMediaJob(job: Job<MediaProcessingJob>): Promise<void> {
  const upload = await claimDurableJob(job.data.processingJobId);
  if (!upload) return;
  const outputPrefix = ownerMediaClaimPrefix(upload.ownerId, upload.assetId, upload.claimToken);
  const renewal = startLeaseRenewal(upload);
  let workDir: string | null = null;
  let published = false;
  try {
    workDir = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-media-${upload.assetId}-`));
    const source = path.join(workDir, "source");
    await ensureBucket();
    const sourceChecksum = await assembleUpload(upload, source);
    await job.updateProgress(15);
    const detected = await fileTypeFromFile(source);
    if (!detected) throw new Error("The assembled source type could not be detected.");
    requireDetectedType(upload.mediaType, detected.mime);
    const result = upload.mediaType === "AUDIO"
      ? await processAudio(upload, source, sourceChecksum, detected, workDir, outputPrefix)
      : upload.mediaType === "VIDEO"
        ? await processVideo(upload, source, sourceChecksum, detected, workDir, outputPrefix)
        : await processImage(upload, source, sourceChecksum, detected, workDir, outputPrefix);
    await job.updateProgress(90);
    published = await finalizeWinningClaim(upload, result);
    if (!published) await cleanClaimOutput(upload, outputPrefix);
    else {
      try {
        await removePrefix(upload.uploadPrefix);
        await query(
          `UPDATE media_gc_tasks SET status = 'SUCCEEDED', completed_at = now(), updated_at = now()
            WHERE storage_authority = 'CANONICAL' AND object_key = $1 AND status = 'PENDING'`,
          [upload.uploadPrefix],
        );
      } catch (error) {
        console.error(`Upload parts for media asset ${upload.assetId} remain scheduled for cleanup:`, error);
      }
      await job.updateProgress(100);
    }
  } catch (error) {
    await cleanClaimOutput(upload, outputPrefix);
    await finishFailedClaim(upload, error, "Canonical media processing failed.", async (client, message) => {
      await client.query(
        `UPDATE media_assets SET status = 'FAILED', metadata = metadata || $2::jsonb,
                version = version + 1, updated_at = now()
          WHERE id = $1 AND status = 'PROCESSING'`,
        [upload.assetId, JSON.stringify({ processingError: message })],
      );
    });
    throw error;
  } finally {
    await renewal.stop();
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function dispatchMediaJob(job: Job<MediaProcessingJob>): Promise<void> {
  const type = await query<{ job_type: string }>("SELECT job_type FROM media_processing_jobs WHERE id = $1", [job.data.processingJobId]);
  if (type.rows[0]?.job_type === "MATERIALIZE_CLIP") return materializeMediaClip(job);
  if (type.rows[0]?.job_type === "PREPARE_TV_AUTOMATION") return prepareTvAutomation(job);
  return processMediaJob(job);
}

async function dispatchDurableJobs(): Promise<void> {
  const durable = await query<{ id: string }>(
    `SELECT id FROM media_processing_jobs
      WHERE job_type IN ('PROCESS_UPLOAD', 'MATERIALIZE_CLIP', 'PREPARE_TV_AUTOMATION')
        AND ((status = 'QUEUED' AND available_at <= now())
          OR (status = 'RUNNING' AND lease_expires_at < now()))
      ORDER BY priority DESC, available_at, created_at LIMIT 100`,
  );
  const queue = getMediaProcessingQueue();
  for (const row of durable.rows) {
    const bullJobId = `media-processing-${row.id}`;
    const existing = await queue.getJob(bullJobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== "completed" && state !== "failed") continue;
      await existing.remove();
    }
    await queue.add("process-owner-media", { processingJobId: row.id }, { jobId: bullJobId });
  }
}

const redis = getRedis();
let worker: Worker<MediaProcessingJob> | null = null;
let dispatchTimer: NodeJS.Timeout | null = null;
let heartbeat: WorkerHeartbeat | null = null;

async function start(): Promise<void> {
  await ensureBucket();
  worker = new Worker<MediaProcessingJob>("media-processing", dispatchMediaJob, {
    connection: redis,
    concurrency: env().TRANSCODE_CONCURRENCY,
  });
  worker.on("completed", (job) => console.info(`Processed canonical media job ${job.data.processingJobId}`));
  worker.on("failed", (job, error) => console.error(`Canonical media job ${job?.data.processingJobId ?? "unknown"} failed:`, error.message));
  heartbeat = await startWorkerHeartbeat("media");
  await dispatchDurableJobs();
  dispatchTimer = setInterval(() => void dispatchDurableJobs().catch((error) => console.error("Media job dispatch failed:", error)), 30_000);
  console.info(`Starting canonical media worker at concurrency ${env().TRANSCODE_CONCURRENCY}`);
}

async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}; closing canonical media worker`);
  if (dispatchTimer) clearInterval(dispatchTimer);
  await heartbeat?.stop();
  await worker?.close();
  await getMediaProcessingQueue().close();
  await redis.quit();
  process.exit(0);
}

if (process.env.NODE_ENV !== "test") {
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  void start().catch((error) => { console.error("Canonical media worker startup failed:", error); process.exit(1); });
}
