import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import { ensureClockTimeline } from "@/lib/clock-timeline";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { artworkPackagerArgs, audioPackagerArgs, expiredHlsSegments, hlsSegmentNames, visualizerPackagerArgs } from "@/lib/radio-hls";
import {
  acquireRadioLease,
  activateRadioSession,
  createRadioSession,
  failRadioSession,
  markRadioOffline,
  releaseRadioLease,
  renewRadioLease,
  retireRadioSession,
  touchRadioManifest,
  updateRadioPlayoutState,
  type RadioLease,
  type RadioSession,
} from "@/lib/radio-playout-lease";
import {
  acknowledgeRadioProgramSource,
  calendarRadioPlaybackWindow,
  loadRadioProgramDecision,
  type RadioCalendarProgramContext,
  type RadioProgramDecision,
} from "@/lib/radio-playout-program";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { getRedis } from "@/lib/redis";
import { startWorkerHeartbeat, type WorkerHeartbeat } from "@/lib/worker-health";
import { defaultRadioVisualizer, isRadioVisualizerId, type RadioVisualizerId, type RadioVisualMode } from "@/lib/radio-visualizers";

const PCM_BYTES_PER_SECOND = 48_000 * 2 * 4;

type DesiredStation = {
  id: string;
  active_clock_release_id: string | null;
  calendar_mode: boolean;
  visual_mode: RadioVisualMode;
  visualizer_id: string;
};
type TimelineSource = {
  timeline_item_id: string;
  release_item_id: string;
  release_id: string;
  starts_at: Date;
  ends_at: Date;
  source_offset_ms: string;
  media_key: string;
  artwork_key: string | null;
  database_now: Date;
};
type CalendarTimelineSource = {
  calendar_item_id: string;
  release_item_id: string;
  clock_release_id: string;
  starts_at: Date;
  ends_at: Date;
  source_offset_ms: string;
  media_key: string;
  artwork_key: string | null;
  database_now: Date;
};
type Runtime = { stationId: string; sourceKey: string; abort: AbortController; done: Promise<void> };
type ProcessHandle = { child: ChildProcessWithoutNullStreams; closed: Promise<void>; logs: () => string };
type ArtworkProcess = ProcessHandle & { artworkInput: Writable };
type VisualState = { artwork: Buffer | null; artworkKey: string | null };

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function processWithLogs(command: string, args: string[], consumeStdout = true): ProcessHandle {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], detached: true });
  child.stdin.on("error", () => undefined);
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-16_000); });
  if (consumeStdout) child.stdout.resume();
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? signal}: ${stderr}`)));
  });
  closed.catch(() => undefined);
  return { child, closed, logs: () => stderr };
}

function processWithArtwork(command: string, args: string[]): ArtworkProcess {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe", "pipe"], detached: true }) as unknown as ChildProcessWithoutNullStreams;
  const artworkInput = child.stdio[3] as Writable;
  child.stdin.on("error", () => undefined);
  artworkInput.on("error", () => undefined);
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-16_000); });
  child.stdout.resume();
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? signal}: ${stderr}`)));
  });
  closed.catch(() => undefined);
  return { child, artworkInput, closed, logs: () => stderr };
}

async function stopProcess(child: ChildProcessWithoutNullStreams, closed: Promise<void>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.stdin.end();
  const graceful = await Promise.race([closed.then(() => true).catch(() => true), sleep(5_000).then(() => false)]);
  if (!graceful && child.pid) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* Process already exited. */ }
  }
}

async function writePcm(child: ChildProcessWithoutNullStreams, chunk: Buffer, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (child.exitCode !== null || child.signalCode !== null || child.stdin.destroyed) throw new Error("Radio packager stopped accepting audio.");
  if (child.stdin.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.stdin.off("drain", onDrain);
      child.stdin.off("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onDrain = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onAbort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Radio packager backpressure exceeded five seconds.")); }, 5_000);
    child.stdin.once("drain", onDrain);
    child.stdin.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function writeStream(stream: Writable, chunk: Buffer, signal: AbortSignal, label: string, timeoutMs = 5_000): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (stream.destroyed) throw new Error(`${label} stopped accepting data.`);
  if (stream.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); stream.off("drain", onDrain); stream.off("error", onError); signal.removeEventListener("abort", onAbort); };
    const onDrain = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onAbort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${label} backpressure exceeded ${Math.round(timeoutMs / 1000)} seconds.`)); }, timeoutMs);
    stream.once("drain", onDrain);
    stream.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function cacheSource(cacheDirectory: string, itemId: string, key: string): Promise<string> {
  const destination = path.join(cacheDirectory, `${itemId}.flac`);
  try { await fs.access(destination); return destination; } catch { /* Download below. */ }
  const temporary = `${destination}.${randomUUID()}.part`;
  await pipeline(await storage.getObject(bucket, key), createWriteStream(temporary, { flags: "wx" }));
  await fs.rename(temporary, destination);
  return destination;
}

async function objectBuffer(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const value of await storage.getObject(bucket, key)) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  return Buffer.concat(chunks);
}

async function currentSource(stationId: string): Promise<TimelineSource | null> {
  const result = await query<TimelineSource>(
    `SELECT t.id AS timeline_item_id, t.release_item_id, t.release_id, t.starts_at, t.ends_at,
            t.source_offset_ms::text, i.media_key, i.artwork_key, clock_timestamp() AS database_now
       FROM stations s JOIN clock_timeline_items t ON t.release_id = s.active_clock_release_id
       JOIN clock_release_items i ON i.id = t.release_item_id
      WHERE s.id = $1 AND s.station_kind = 'RADIO' AND s.programming_mode = 'CLOCK'
        AND s.broadcast_state = 'RUNNING' AND t.starts_at <= clock_timestamp() AND t.ends_at > clock_timestamp()
      ORDER BY t.starts_at DESC LIMIT 1`,
    [stationId],
  );
  return result.rows[0] ?? null;
}

async function feedTimeline(stationId: string, releaseId: string, lease: RadioLease, cacheDirectory: string, sinks: ChildProcessWithoutNullStreams[], visualState: VisualState, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    await ensureClockTimeline(releaseId, new Date(), 3);
    const source = await currentSource(stationId);
    if (!source || source.release_id !== releaseId) throw new Error("The active Radio release changed or has no current timeline item.");
    const elapsedMs = Math.max(0, source.database_now.getTime() - source.starts_at.getTime());
    const localSource = await cacheSource(cacheDirectory, source.release_item_id, source.media_key);
    if (source.artwork_key && visualState.artworkKey !== source.artwork_key) {
      try {
        visualState.artwork = await objectBuffer(source.artwork_key);
        visualState.artworkKey = source.artwork_key;
      } catch { /* Retain the prior cover when artwork is unavailable. */ }
    }
    const preparationMs = Math.max(0, Date.now() - source.database_now.getTime());
    const sourceOffsetMs = Number(source.source_offset_ms) + elapsedMs + preparationMs;
    const remainingMs = source.ends_at.getTime() - source.database_now.getTime() - preparationMs;
    if (remainingMs <= 0) continue;
    await updateRadioPlayoutState(lease, { status: "RUNNING", timelineItemId: source.timeline_item_id, calendarItemId: null, releaseId, sourcePositionMs: sourceOffsetMs, error: null });
    const decoder = processWithLogs("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", (sourceOffsetMs / 1000).toFixed(3), "-i", localSource,
      "-t", (remainingMs / 1000).toFixed(3), "-map", "0:a:0", "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "2",
      "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1",
    ], false);
    let emittedBytes = 0;
    let consecutiveDigitalSilenceBytes = 0;
    try {
      for await (const chunk of decoder.child.stdout) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        emittedBytes += buffer.length;
        let hasSignal = false;
        for (let index = 0; index < buffer.length; index += 1) {
          if (buffer[index] !== 0) { hasSignal = true; break; }
        }
        consecutiveDigitalSilenceBytes = hasSignal ? 0 : consecutiveDigitalSilenceBytes + buffer.length;
        if (consecutiveDigitalSilenceBytes >= PCM_BYTES_PER_SECOND * 30) throw new Error("Radio source decoder produced 30 seconds of digital silence.");
        await Promise.all(sinks.map((sink) => writePcm(sink, buffer, signal)));
      }
      await decoder.closed;
    } finally {
      if (decoder.child.exitCode === null && decoder.child.signalCode === null && decoder.child.pid) {
        try { process.kill(-decoder.child.pid, "SIGKILL"); } catch { /* Decoder already exited. */ }
      }
    }
    const expectedBytes = Math.max(0, Math.floor(remainingMs / 1000 * PCM_BYTES_PER_SECOND));
    let missingBytes = expectedBytes - emittedBytes;
    const silence = Buffer.alloc(PCM_BYTES_PER_SECOND / 10);
    while (missingBytes > 0 && !signal.aborted) {
      const chunk = missingBytes >= silence.length ? silence : silence.subarray(0, missingBytes);
      await Promise.all(sinks.map((sink) => writePcm(sink, chunk, signal)));
      missingBytes -= chunk.length;
    }
  }
}

function calendarContext(decision: RadioProgramDecision): RadioCalendarProgramContext | undefined {
  if (!decision.calendarReleaseId) return undefined;
  return {
    calendarReleaseId: decision.calendarReleaseId,
    occurrenceId: decision.occurrenceId,
    sourceRole: decision.sourceRole,
    calendarItemId: decision.calendarItemId,
  };
}

async function feedCalendarTimeline(
  stationId: string,
  decision: RadioProgramDecision,
  lease: RadioLease,
  cacheDirectory: string,
  sinks: ChildProcessWithoutNullStreams[],
  visualState: VisualState,
  signal: AbortSignal,
): Promise<void> {
  if (!decision.calendarReleaseId || !decision.occurrenceId || !decision.sourceRole
      || !decision.calendarItemId || !decision.calendarClockItemId || !decision.releaseId
      || !decision.calendarItemStartsAt || !decision.calendarItemEndsAt
      || decision.calendarItemSourceOffsetMs === null) {
    throw new Error("Calendar Radio source is incomplete.");
  }
  const sourceRole = decision.sourceRole === "FALLBACK" ? "EVENT_FALLBACK" : "PRIMARY";
  const result = await query<CalendarTimelineSource>(
    `SELECT item.id AS calendar_item_id, item.release_item_id,
            block.release_id AS clock_release_id, item.starts_at, item.ends_at,
            item.source_offset_ms::text, source.media_key, source.artwork_key,
            clock_timestamp() AS database_now
       FROM calendar_radio_occurrence_items item
       JOIN clock_release_items source
         ON source.release_block_id = item.release_block_id
        AND source.id = item.release_item_id
       JOIN clock_release_blocks block
         ON block.id = item.release_block_id
      WHERE item.station_id = $1 AND item.id = $2
        AND item.release_id = $3 AND item.occurrence_id = $4
        AND item.release_item_id = $5 AND block.release_id = $6
        AND item.source_role = $7
        AND item.starts_at = $8 AND item.ends_at = $9
        AND item.source_offset_ms = $10
        AND item.starts_at <= clock_timestamp() AND item.ends_at > clock_timestamp()`,
    [stationId, decision.calendarItemId, decision.calendarReleaseId, decision.occurrenceId,
      decision.calendarClockItemId, decision.releaseId, sourceRole,
      decision.calendarItemStartsAt, decision.calendarItemEndsAt,
      decision.calendarItemSourceOffsetMs],
  );
  const source = result.rows[0];
  if (!source || source.calendar_item_id !== decision.calendarItemId
      || source.clock_release_id !== decision.releaseId) {
    throw new Error("The materialized Calendar Radio item changed or is no longer current.");
  }
  const localSource = await cacheSource(cacheDirectory, source.release_item_id, source.media_key);
  if (source.artwork_key && visualState.artworkKey !== source.artwork_key) {
    try {
      visualState.artwork = await objectBuffer(source.artwork_key);
      visualState.artworkKey = source.artwork_key;
    } catch { /* Retain the prior cover when artwork is unavailable. */ }
  }
  const { sourcePositionMs: sourceOffsetMs, remainingMs } = calendarRadioPlaybackWindow({
    sourceOffsetMs: Number(source.source_offset_ms),
    startsAt: source.starts_at,
    endsAt: source.ends_at,
    databaseNow: source.database_now,
    preparedAt: new Date(),
  });
  if (remainingMs <= 0) return;
  await updateRadioPlayoutState(lease, {
    status: "RUNNING",
    timelineItemId: null,
    releaseId: source.clock_release_id,
    sourcePositionMs: sourceOffsetMs,
    calendarReleaseId: decision.calendarReleaseId,
    occurrenceId: decision.occurrenceId,
    sourceRole: decision.sourceRole,
    calendarItemId: source.calendar_item_id,
    error: null,
  });
  const decoder = processWithLogs("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", (sourceOffsetMs / 1000).toFixed(3), "-i", localSource,
    "-t", (remainingMs / 1000).toFixed(3), "-map", "0:a:0", "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "2",
    "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1",
  ], false);
  let emittedBytes = 0;
  let consecutiveDigitalSilenceBytes = 0;
  try {
    for await (const chunk of decoder.child.stdout) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      emittedBytes += buffer.length;
      let hasSignal = false;
      for (let index = 0; index < buffer.length; index += 1) {
        if (buffer[index] !== 0) { hasSignal = true; break; }
      }
      consecutiveDigitalSilenceBytes = hasSignal ? 0 : consecutiveDigitalSilenceBytes + buffer.length;
      if (consecutiveDigitalSilenceBytes >= PCM_BYTES_PER_SECOND * 30) throw new Error("Calendar Radio source decoder produced 30 seconds of digital silence.");
      await Promise.all(sinks.map((sink) => writePcm(sink, buffer, signal)));
    }
    await decoder.closed;
  } finally {
    if (decoder.child.exitCode === null && decoder.child.signalCode === null && decoder.child.pid) {
      try { process.kill(-decoder.child.pid, "SIGKILL"); } catch { /* Decoder already exited. */ }
    }
  }
  const expectedBytes = Math.max(0, Math.floor(remainingMs / 1000 * PCM_BYTES_PER_SECOND));
  let missingBytes = expectedBytes - emittedBytes;
  const silence = Buffer.alloc(PCM_BYTES_PER_SECOND / 10);
  while (missingBytes > 0 && !signal.aborted) {
    const chunk = missingBytes >= silence.length ? silence : silence.subarray(0, missingBytes);
    await Promise.all(sinks.map((sink) => writePcm(sink, chunk, signal)));
    missingBytes -= chunk.length;
  }
}

async function generateFallbackArtwork(workDirectory: string): Promise<Buffer> {
  const output = path.join(workDirectory, "radio-fallback.jpg");
  const process = processWithLogs("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=#120000:s=720x720", "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "2", output]);
  await process.closed;
  return fs.readFile(output);
}

async function feedArtwork(stream: Writable, state: VisualState, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    if (state.artwork) await writeStream(stream, state.artwork, signal, "Radio artwork pipe", 30_000);
    await sleep(1_000, signal);
  }
}

async function feedSilence(sinks: ChildProcessWithoutNullStreams[], milliseconds: number, signal: AbortSignal): Promise<void> {
  const silence = Buffer.alloc(PCM_BYTES_PER_SECOND / 10);
  for (let elapsed = 0; elapsed < milliseconds && !signal.aborted; elapsed += 100) await Promise.all(sinks.map((sink) => writePcm(sink, silence, signal)));
}

async function feedContinuousSilence(
  decision: RadioProgramDecision,
  lease: RadioLease,
  sinks: ChildProcessWithoutNullStreams[],
  signal: AbortSignal,
): Promise<void> {
  const context = calendarContext(decision);
  while (!signal.aborted) {
    await feedSilence(sinks, 1_000, signal);
    await updateRadioPlayoutState(lease, {
      status: "RUNNING",
      timelineItemId: null,
      calendarReleaseId: context?.calendarReleaseId ?? null,
      occurrenceId: context?.occurrenceId ?? null,
      sourceRole: context?.sourceRole ?? null,
      calendarItemId: null,
      sourcePositionMs: null,
      error: null,
    });
  }
}

async function feedProgram(
  station: DesiredStation,
  lease: RadioLease,
  outputSession: RadioSession,
  cacheDirectory: string,
  sinks: ChildProcessWithoutNullStreams[],
  visualState: VisualState,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const decision = await loadRadioProgramDecision(station.id);
    if (!decision) throw new Error("Radio station is no longer eligible for playout.");
    const sourceAbort = new AbortController();
    const abortSource = () => sourceAbort.abort();
    signal.addEventListener("abort", abortSource, { once: true });
    const acknowledged = await acknowledgeRadioProgramSource(lease, outputSession, decision.source, calendarContext(decision));
    if (!acknowledged) throw new Error("Radio source acknowledgement lost its playout fence.");
    let feederError: unknown;
    let sourceChanged = false;
    const feeder = (decision.source === "CLOCK"
          ? decision.calendarItemId
            ? feedCalendarTimeline(station.id, decision, lease, cacheDirectory, sinks, visualState, sourceAbort.signal)
            : feedTimeline(station.id, decision.releaseId as string, lease, cacheDirectory, sinks, visualState, sourceAbort.signal)
          : feedContinuousSilence(decision, lease, sinks, sourceAbort.signal)
    ).catch((error) => { feederError = error; });
    const watcher = (async () => {
      while (!sourceAbort.signal.aborted) {
        await sleep(500, sourceAbort.signal);
        const current = await loadRadioProgramDecision(station.id);
        if (!current || current.key !== decision.key) {
          sourceChanged = true;
          sourceAbort.abort();
          return;
        }
      }
    })().catch(() => undefined);
    await Promise.race([feeder, watcher]);
    sourceAbort.abort();
    await Promise.allSettled([feeder, watcher]);
    signal.removeEventListener("abort", abortSource);
    if (feederError && !sourceChanged) throw feederError;
    if (!signal.aborted) await sleep(100, signal);
  }
}

async function publishOutput(directory: string, objectPrefix: string, signal: AbortSignal, onManifest: () => Promise<void>): Promise<void> {
  const uploaded = new Set<string>();
  let publishedPlaylist = "";
  let lastSuccessAt = Date.now();
  while (!signal.aborted) {
    try {
      const playlistPath = path.join(directory, "index.m3u8");
      const playlist = await fs.readFile(playlistPath, "utf8");
      if (playlist !== publishedPlaylist) {
        const segments = hlsSegmentNames(playlist);
        for (const segment of segments) {
          if (uploaded.has(segment)) continue;
          await storage.fPutObject(bucket, `${objectPrefix}/${segment}`, path.join(directory, segment), { "Content-Type": "video/mp2t" });
          uploaded.add(segment);
        }
        await storage.putObject(bucket, `${objectPrefix}/index.m3u8`, Buffer.from(playlist), Buffer.byteLength(playlist), { "Content-Type": "application/vnd.apple.mpegurl" });
        publishedPlaylist = playlist;
        for (const expired of expiredHlsSegments(uploaded, segments)) {
          await storage.removeObject(bucket, `${objectPrefix}/${expired}`).catch(() => undefined);
          uploaded.delete(expired);
        }
        await onManifest();
        lastSuccessAt = Date.now();
      } else {
        lastSuccessAt = Date.now();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error(`Radio HLS publication retry for ${objectPrefix}:`, error instanceof Error ? error.message : error);
      if (Date.now() - lastSuccessAt > 30_000) throw new Error(`Radio HLS publication stalled for ${objectPrefix}.`);
    }
    await sleep(500, signal);
  }
}

async function runStation(station: DesiredStation, initialLease: RadioLease, signal: AbortSignal): Promise<void> {
  let lease = initialLease;
  let session: RadioSession | null = null;
  const workDirectory = await fs.mkdtemp(path.join(tmpdir(), `streamtumi-playout-${station.id}-`));
  const cacheDirectory = path.join(workDirectory, "cache");
  const audioDirectory = path.join(workDirectory, "audio");
  const waveformDirectory = path.join(workDirectory, "waveform");
  await Promise.all([fs.mkdir(cacheDirectory), fs.mkdir(audioDirectory), fs.mkdir(waveformDirectory)]);
  const localAbort = new AbortController();
  const abort = () => localAbort.abort();
  signal.addEventListener("abort", abort, { once: true });
  const visualState: VisualState = { artwork: null, artworkKey: null };
  const coverMode = station.visual_mode === "COVER";
  const visualizerId: RadioVisualizerId = isRadioVisualizerId(station.visualizer_id) ? station.visualizer_id : defaultRadioVisualizer;
  let audio: ProcessHandle | null = null;
  let waveform: ProcessHandle | null = null;
  let artworkProcess: ArtworkProcess | null = null;
  let audioReady = false;
  let waveformReady = false;
  let activated = false;
  try {
    await ensureBucket();
    if (coverMode && station.active_clock_release_id) {
      const source = await currentSource(station.id);
      if (source?.artwork_key) {
        try { visualState.artwork = await objectBuffer(source.artwork_key); visualState.artworkKey = source.artwork_key; }
        catch { /* Generate the fallback below. */ }
      }
    }
    if (coverMode && !visualState.artwork) visualState.artwork = await generateFallbackArtwork(workDirectory);
    audio = processWithLogs("ffmpeg", audioPackagerArgs(audioDirectory, env().RADIO_HLS_SEGMENT_SECONDS));
    if (coverMode) {
      artworkProcess = processWithArtwork("ffmpeg", artworkPackagerArgs(waveformDirectory, env().RADIO_HLS_SEGMENT_SECONDS));
      waveform = artworkProcess;
    } else {
      waveform = processWithLogs("ffmpeg", visualizerPackagerArgs(waveformDirectory, env().RADIO_HLS_SEGMENT_SECONDS, visualizerId));
    }
    const outputSession = await createRadioSession(lease, station.active_clock_release_id);
    session = outputSession;
    const maybeActivate = async () => {
      if (!activated && audioReady && waveformReady) {
        activated = await activateRadioSession(lease, outputSession);
        if (!activated) localAbort.abort();
      }
    };
    const backgroundTasks = [
      publishOutput(audioDirectory, `${outputSession.objectPrefix}/audio`, localAbort.signal, async () => { audioReady = true; await maybeActivate(); if (activated) await touchRadioManifest(lease, "audio"); }),
      publishOutput(waveformDirectory, `${outputSession.objectPrefix}/waveform`, localAbort.signal, async () => { waveformReady = true; await maybeActivate(); if (activated) await touchRadioManifest(lease, "waveform"); }),
      ...(artworkProcess ? [feedArtwork(artworkProcess.artworkInput, visualState, localAbort.signal)] : []),
    ].map((task) => task.catch((error) => { if (!localAbort.signal.aborted) throw error; }));
    const backgroundFailure = Promise.race(backgroundTasks.map((task) => task.then(() => localAbort.signal.aborted
      ? new Promise<void>(() => undefined)
      : Promise.reject(new Error("A Radio playout background task exited unexpectedly.")))));
    const renewal = (async () => {
      while (!localAbort.signal.aborted) {
        await sleep(Math.max(2_000, env().RADIO_PLAYOUT_LEASE_SECONDS * 400), localAbort.signal);
        const renewed = await renewRadioLease(lease, env().RADIO_PLAYOUT_LEASE_SECONDS);
        if (!renewed) { localAbort.abort(); break; }
        lease = renewed;
        await updateRadioPlayoutState(lease, {});
        const desired = await query<{ id: string }>(
          `SELECT s.id FROM stations s
            WHERE s.id = $1 AND s.broadcast_state = 'RUNNING'
              AND s.deleted_at IS NULL AND s.moderation_status = 'ACTIVE'`,
          [station.id],
        );
        if (!desired.rows[0]) { localAbort.abort(); break; }
      }
    })().catch((error) => { if (!localAbort.signal.aborted) throw error; });
    const packagerFailure = Promise.race([
      audio!.closed.then(() => Promise.reject(new Error(`Audio HLS packager exited: ${audio!.logs()}`))),
      waveform!.closed.then(() => Promise.reject(new Error(`Waveform HLS packager exited: ${waveform!.logs()}`))),
    ]);
    await Promise.race([
      feedProgram(station, lease, outputSession, cacheDirectory, [audio!.child, waveform!.child], visualState, localAbort.signal),
      packagerFailure,
      backgroundFailure,
      renewal,
    ]);
    localAbort.abort();
    await Promise.allSettled([...backgroundTasks, renewal]);
  } catch (error) {
    if (!localAbort.signal.aborted && session) await failRadioSession(lease, session.id, error instanceof Error ? error.message : "Radio playout failed.");
    if (!localAbort.signal.aborted) throw error;
  } finally {
    localAbort.abort();
    signal.removeEventListener("abort", abort);
    artworkProcess?.artworkInput.end();
    await Promise.all([
      ...(audio ? [stopProcess(audio.child, audio.closed)] : []),
      ...(waveform ? [stopProcess(waveform.child, waveform.closed)] : []),
    ]);
    if (session) await retireRadioSession(lease, session.id).catch(() => undefined);
    await releaseRadioLease(lease).catch(() => undefined);
    await fs.rm(workDirectory, { recursive: true, force: true });
  }
}

const holderId = randomUUID();
const runtimes = new Map<string, Runtime>();
let heartbeat: WorkerHeartbeat | null = null;
const retryState = new Map<string, { failures: number; retryAt: number }>();
let shuttingDown = false;

async function reconcile(): Promise<void> {
  const desiredResult = await query<DesiredStation>(
    `SELECT s.id, s.active_clock_release_id,
             COALESCE(profile.strategy = 'CALENDAR_EVENTS', false) AS calendar_mode,
             COALESCE(visual.mode, 'VISUALIZER') AS visual_mode,
             COALESCE(visual.visualizer_id, 'mirrored-wave') AS visualizer_id
       FROM stations s
       LEFT JOIN station_programming_profiles profile
         ON profile.station_id = s.id AND profile.id = s.active_programming_profile_id
       LEFT JOIN calendar_releases calendar_release
         ON calendar_release.station_id = s.id
        AND calendar_release.profile_id = profile.id
        AND calendar_release.id = s.active_calendar_release_id
       LEFT JOIN calendar_release_materialization_state materialization
         ON materialization.station_id = s.id
        AND materialization.release_id = calendar_release.id
        LEFT JOIN radio_visual_settings visual ON visual.station_id = s.id
         LEFT JOIN radio_playout_leases active_lease
           ON active_lease.station_id = s.id
          AND active_lease.lease_until > clock_timestamp()
        WHERE s.station_kind = 'RADIO' AND s.broadcast_state = 'RUNNING'
         AND (
           (profile.strategy = 'CALENDAR_EVENTS' AND profile.lifecycle = 'ACTIVE'
             AND s.radio_delivery_mode = 'PLAYOUT' AND s.active_clock_release_id IS NOT NULL
             AND calendar_release.id IS NOT NULL AND materialization.status = 'READY')
            OR
            (profile.strategy IS DISTINCT FROM 'CALENDAR_EVENTS' AND s.programming_mode = 'CLOCK'
              AND s.radio_delivery_mode = 'PLAYOUT' AND s.active_clock_release_id IS NOT NULL)
          )
          AND (active_lease.station_id IS NULL OR active_lease.holder_id = $1::uuid)
          AND s.deleted_at IS NULL AND s.moderation_status = 'ACTIVE'
        ORDER BY (active_lease.holder_id = $1::uuid) DESC, s.updated_at, s.id
        LIMIT $2`,
    [holderId, env().RADIO_PLAYOUT_MAX_STATIONS],
  );
  const desired = new Map(desiredResult.rows.map((station) => [station.id, station]));
  for (const runtime of runtimes.values()) {
    const current = desired.get(runtime.stationId);
    const sourceKey = current ? `clock-visual:${current.calendar_mode}:visual:${current.visual_mode}:${current.visualizer_id}` : "";
    if (!current || sourceKey !== runtime.sourceKey) runtime.abort.abort();
  }
  for (const station of desired.values()) {
    if (runtimes.has(station.id)) continue;
    if ((retryState.get(station.id)?.retryAt ?? 0) > Date.now()) continue;
    const lease = await acquireRadioLease(station.id, holderId, env().RADIO_PLAYOUT_LEASE_SECONDS);
    if (!lease) continue;
    const abort = new AbortController();
    const sourceKey = `clock-visual:${station.calendar_mode}:visual:${station.visual_mode}:${station.visualizer_id}`;
    const runtime: Runtime = { stationId: station.id, sourceKey, abort, done: Promise.resolve() };
    const startedAt = Date.now();
    runtime.done = runStation(station, lease, abort.signal)
      .catch(async (error) => {
        console.error(`Radio playout failed for ${station.id}:`, error instanceof Error ? error.message : error);
        const previous = retryState.get(station.id)?.failures ?? 0;
        const failures = Date.now() - startedAt > 30_000 ? 1 : previous + 1;
        retryState.set(station.id, { failures, retryAt: Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(failures - 1, 5)) });
        await markRadioOffline(station.id, lease.fence).catch(() => undefined);
      })
      .finally(() => {
        if (runtimes.get(station.id) === runtime) runtimes.delete(station.id);
        if (abort.signal.aborted) retryState.delete(station.id);
      });
    runtimes.set(station.id, runtime);
  }
}

async function main() {
  console.info(`Starting Radio playout supervisor ${holderId} with capacity ${env().RADIO_PLAYOUT_MAX_STATIONS}`);
  heartbeat = await startWorkerHeartbeat("radio-playout");
  while (!shuttingDown) {
    try { await reconcile(); } catch (error) { console.error("Radio playout reconciliation failed:", error); }
    await sleep(env().RADIO_PLAYOUT_RECONCILE_SECONDS * 1000).catch(() => undefined);
  }
}

async function shutdown(signal: string) {
  console.info(`Received ${signal}; stopping Radio playout`);
  shuttingDown = true;
  await heartbeat?.stop();
  for (const runtime of runtimes.values()) runtime.abort.abort();
  await Promise.allSettled([...runtimes.values()].map((runtime) => runtime.done));
  await getRedis().quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void main();
