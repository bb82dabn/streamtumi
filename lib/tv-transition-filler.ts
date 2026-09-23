import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import { query, transaction } from "@/lib/db";
import { bucket, ensureBucket, removePrefix, storage } from "@/lib/storage";
import {
  stationStaticTransitionFillerArgs,
  TV_CHANNEL_PROFILE,
  normalizeTvChannelPlaylistTargetDuration,
  validateTvChannelMasterPlaylist,
  validateTvChannelSegmentInventories,
  type TvChannelRendition,
} from "@/lib/tv-channel-derivative";

const renditions = ["720p", "360p"] as const satisfies readonly TvChannelRendition[];
const renditionContract = {
  "720p": { width: 1280, height: 720, bitrateBps: 2_500_000, bufferSizeBps: 5_000_000 },
  "360p": { width: 640, height: 360, bitrateBps: 800_000, bufferSizeBps: 1_600_000 },
} as const;

type FileDescription = { sizeBytes: number; checksumSha256: string };
type PreparedTransition = {
  stationId: string;
  fillerId: string;
  descriptorId: string;
  generation: number;
  durationMs: number;
  created: boolean;
};
type SqlQuery = <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>>;

function staticPrefixPattern(stationId: string): string {
  return `stations/${stationId}/transitions/static/%`;
}

async function existingStaticTransition(
  execute: SqlQuery,
  stationId: string,
  durationMs: number,
): Promise<PreparedTransition | null> {
  const result = await execute<{
    filler_id: string;
    descriptor_id: string;
    generation: number;
  }>(
    `SELECT filler.id AS filler_id, filler.descriptor_id, filler.generation
       FROM tv_channel_transition_fillers filler
       JOIN tv_channel_delivery_descriptors descriptor ON descriptor.id = filler.descriptor_id
      WHERE filler.station_id = $1 AND filler.profile = $2 AND filler.transition_ms = $3
        AND descriptor.profile = filler.profile AND descriptor.duration_ms = $3::bigint
        AND descriptor.master_playlist_object_key LIKE $4
      ORDER BY filler.generation DESC, filler.id DESC LIMIT 1`,
    [stationId, TV_CHANNEL_PROFILE, durationMs, staticPrefixPattern(stationId)],
  );
  const row = result.rows[0];
  return row ? {
    stationId,
    fillerId: row.filler_id,
    descriptorId: row.descriptor_id,
    generation: row.generation,
    durationMs,
    created: false,
  } : null;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-32_000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr}`));
    });
  });
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

async function generatedFiles(root: string, relative = ""): Promise<Array<{ absolute: string; relative: string }>> {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files: Array<{ absolute: string; relative: string }> = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await generatedFiles(root, next));
    else files.push({ absolute: path.join(root, next), relative: next.split(path.sep).join("/") });
  }
  return files;
}

function contentType(filename: string): string {
  return filename.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
}

export async function prepareStaticTvTransition(stationId: string): Promise<PreparedTransition> {
  const station = await query<{ transition_ms: number }>(
    `SELECT transition_ms FROM stations
      WHERE id = $1 AND station_kind = 'TV' AND deleted_at IS NULL`,
    [stationId],
  );
  const durationMs = station.rows[0]?.transition_ms;
  if (!durationMs) throw new Error("TV station not found or its transition duration is zero.");
  const existing = await existingStaticTransition(query, stationId, durationMs);
  if (existing) return existing;

  const workDirectory = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-static-${stationId}-`));
  const outputDirectory = path.join(workDirectory, "output");
  const objectPrefix = `stations/${stationId}/transitions/static/${randomUUID()}`;
  try {
    await Promise.all(renditions.map((rendition) => fs.mkdir(path.join(outputDirectory, rendition), { recursive: true })));
    await runFfmpeg(stationStaticTransitionFillerArgs(outputDirectory, durationMs));
    const masterPath = path.join(outputDirectory, "master.m3u8");
    const playlistPaths = {
      "720p": path.join(outputDirectory, "720p", "index.m3u8"),
      "360p": path.join(outputDirectory, "360p", "index.m3u8"),
    };
    const playlists = {
      "720p": normalizeTvChannelPlaylistTargetDuration(await fs.readFile(playlistPaths["720p"], "utf8")),
      "360p": normalizeTvChannelPlaylistTargetDuration(await fs.readFile(playlistPaths["360p"], "utf8")),
    };
    await Promise.all(renditions.map((rendition) => fs.writeFile(playlistPaths[rendition], playlists[rendition])));
    validateTvChannelMasterPlaylist(await fs.readFile(masterPath, "utf8"));
    const inventory = validateTvChannelSegmentInventories(playlists);
    if (inventory.durationMs !== durationMs) throw new Error("Generated TV static duration does not match the station transition.");

    const expected = new Set([
      "master.m3u8",
      ...renditions.flatMap((rendition) => [
        `${rendition}/index.m3u8`,
        ...inventory.renditions[rendition].map((segment) => `${rendition}/${segment.name}`),
      ]),
    ]);
    const files = await generatedFiles(outputDirectory);
    if (files.length !== expected.size || files.some((file) => !expected.has(file.relative))) {
      throw new Error("Generated TV static contains an unexpected file inventory.");
    }
    const descriptions = new Map<string, FileDescription>();
    await Promise.all(files.map(async (file) => descriptions.set(file.relative, await describeFile(file.absolute))));
    await ensureBucket();
    await Promise.all(files.map((file) => storage.fPutObject(
      bucket,
      `${objectPrefix}/${file.relative}`,
      file.absolute,
      { "Content-Type": contentType(file.relative) },
    )));
    const result = await transaction(async (client) => {
      const locked = await client.query<{ transition_ms: number }>(
        `SELECT transition_ms FROM stations
          WHERE id = $1 AND station_kind = 'TV' AND deleted_at IS NULL FOR UPDATE`,
        [stationId],
      );
      if (locked.rows[0]?.transition_ms !== durationMs) throw new Error("TV station transition changed while static was rendering.");
      const winner = await existingStaticTransition(client.query.bind(client) as SqlQuery, stationId, durationMs);
      if (winner) return winner;
      const next = await client.query<{ generation: number }>(
        `SELECT (COALESCE(max(generation), 0) + 1)::integer AS generation
           FROM tv_channel_transition_fillers WHERE station_id = $1 AND profile = $2`,
        [stationId, TV_CHANNEL_PROFILE],
      );
      const generation = next.rows[0].generation;
      const master = descriptions.get("master.m3u8") as FileDescription;
      const descriptor = await client.query<{ id: string }>(
        `INSERT INTO tv_channel_delivery_descriptors
           (profile, master_playlist_object_key, master_playlist_checksum_sha256,
            duration_ms, segment_duration_ms, segment_count)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [TV_CHANNEL_PROFILE, `${objectPrefix}/master.m3u8`, master.checksumSha256,
          inventory.durationMs, inventory.segmentDurationMs, inventory.segmentCount],
      );
      const descriptorId = descriptor.rows[0].id;
      for (const rendition of renditions) {
        const contract = renditionContract[rendition];
        const playlist = descriptions.get(`${rendition}/index.m3u8`) as FileDescription;
        await client.query(
          `INSERT INTO tv_channel_delivery_renditions
             (descriptor_id, rendition, playlist_object_key, playlist_checksum_sha256,
              width, height, frame_rate, video_codec, video_profile, video_level, pixel_format,
              color_primaries, color_transfer, color_space, video_bitrate_bps, vbv_minrate_bps,
              vbv_maxrate_bps, vbv_bufsize_bps, gop_frames, b_frames, audio_codec,
              audio_profile, audio_bitrate_bps, audio_sample_rate_hz, audio_channels)
           VALUES ($1, $2, $3, $4, $5, $6, 30, 'h264', 'Main', '3.1', 'yuv420p',
                   'bt709', 'bt709', 'bt709', $7, $7, $7, $8, 60, 0, 'aac', 'LC', 128000, 48000, 2)`,
          [descriptorId, rendition, `${objectPrefix}/${rendition}/index.m3u8`, playlist.checksumSha256,
            contract.width, contract.height, contract.bitrateBps, contract.bufferSizeBps],
        );
      }
      const segments = renditions.flatMap((rendition) => inventory.renditions[rendition].map((segment) => ({
        rendition,
        ...segment,
        objectKey: `${objectPrefix}/${rendition}/${segment.name}`,
        description: descriptions.get(`${rendition}/${segment.name}`) as FileDescription,
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
          segments.map((segment) => segment.rendition),
          segments.map((segment) => segment.index),
          segments.map((segment) => segment.startOffsetMs),
          segments.map((segment) => segment.durationMs),
          segments.map((segment) => segment.objectKey),
          segments.map((segment) => segment.description.sizeBytes),
          segments.map((segment) => segment.description.checksumSha256)],
      );
      const filler = await client.query<{ id: string }>(
        `INSERT INTO tv_channel_transition_fillers
           (station_id, descriptor_id, profile, transition_ms, generation)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [stationId, descriptorId, TV_CHANNEL_PROFILE, durationMs, generation],
      );
      return {
        stationId,
        fillerId: filler.rows[0].id,
        descriptorId,
        generation,
        durationMs,
        created: true,
      };
    });
    if (!result.created) await removePrefix(`${objectPrefix}/`);
    return result;
  } catch (error) {
    await removePrefix(`${objectPrefix}/`).catch(() => undefined);
    throw error;
  } finally {
    await fs.rm(workDirectory, { recursive: true, force: true });
  }
}
