import { Worker, type Job } from "bullmq";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { env } from "@/lib/env";
import { type WeatherRenderJob } from "@/lib/queue";
import { getRedis } from "@/lib/redis";
import { bucket, ensureBucket, removePrefix, storage } from "@/lib/storage";
import { weatherFeedObjectKey } from "@/lib/weather-playback";
import {
  cacheGuideWeatherSummary,
  extractGuideWeatherSummary,
  installWs4kpSummaryCapture,
  readWs4kpSummarySnapshot,
} from "@/lib/weather-summary";
import { weatherstarWidescreenUrl } from "@/lib/weatherstar";

const config = env();
const availableDisplayNumbers = Array.from({ length: config.WEATHER_RENDER_CONCURRENCY }, (_, index) => 100 + index);
const activeStops = new Set<() => Promise<void>>();

function acquireDisplayNumber(): number {
  const value = availableDisplayNumbers.shift();
  if (value === undefined) throw new Error("Weather renderer display capacity is exhausted.");
  return value;
}

function releaseDisplayNumber(value: number): void {
  if (!availableDisplayNumbers.includes(value)) availableDisplayNumbers.push(value);
}

async function waitForDevtools(port: number, browserProcess: ChildProcess): Promise<string> {
  const endpoint = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (browserProcess.exitCode !== null) throw new Error("Chromium app window exited before DevTools became ready.");
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return endpoint;
    } catch {
      // Chromium has not opened its DevTools socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chromium app window did not become ready.");
}

async function stopProcess(process: ChildProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => process.once("exit", () => resolve()));
  process.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (process.exitCode === null) {
    process.kill("SIGKILL");
    await exited;
  }
}

async function uploadChangedFiles(
  directory: string,
  feedKey: string,
  uploaded: Map<string, number>,
  publishedAt: Map<string, number>,
): Promise<boolean> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && (entry.name === "index.m3u8" || /^segment-[0-9]+\.ts$/.test(entry.name)));
  files.sort((left, right) => Number(left.name === "index.m3u8") - Number(right.name === "index.m3u8"));
  for (const file of files) {
    const absolute = path.join(directory, file.name);
    const stat = await fs.stat(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) continue;
    if (uploaded.get(file.name) === stat.mtimeMs) continue;
    await storage.fPutObject(bucket, weatherFeedObjectKey(feedKey, file.name), absolute, {
      "Content-Type": file.name.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t",
      "Cache-Control": file.name.endsWith(".m3u8") ? "no-store" : "private, max-age=120",
    });
    uploaded.set(file.name, stat.mtimeMs);
    publishedAt.set(file.name, Date.now());
  }
  const playlist = await fs.readFile(path.join(directory, "index.m3u8"), "utf8").catch(() => "");
  const referenced = new Set(playlist.split("\n").map((line) => line.trim()).filter((line) => /^segment-[0-9]+\.ts$/.test(line)));
  const cutoff = Date.now() - 120_000;
  for (const filename of [...uploaded.keys()]) {
    if (!filename.startsWith("segment-") || referenced.has(filename) || (publishedAt.get(filename) ?? Date.now()) > cutoff) continue;
    await storage.removeObject(bucket, weatherFeedObjectKey(feedKey, filename));
    uploaded.delete(filename);
    publishedAt.delete(filename);
  }
  return uploaded.has("index.m3u8");
}

async function pruneRemoteSegments(feedKey: string, referenced: Set<string>, cutoffMs: number): Promise<number> {
  const prefix = `weather/feeds/${feedKey}/`;
  const stream = storage.listObjectsV2(bucket, prefix, true);
  let batch: string[] = [];
  let removed = 0;
  for await (const item of stream) {
    if (!item.name || !item.lastModified) continue;
    const filename = item.name.slice(prefix.length);
    if (!/^segment-[0-9]+\.ts$/.test(filename) || referenced.has(filename) || item.lastModified.getTime() > cutoffMs) continue;
    batch.push(item.name);
    if (batch.length >= 500) {
      await storage.removeObjects(bucket, batch);
      removed += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await storage.removeObjects(bucket, batch);
    removed += batch.length;
  }
  return removed;
}

async function downloadWeatherMusic(directory: string): Promise<string[]> {
  const filenames = ["Catch the Sun.mp3", "Crisp day.mp3", "Rolling Clouds.mp3", "Strong Breeze.mp3"];
  return Promise.all(filenames.map(async (filename, index) => {
    const response = await fetch(new URL(`/music/default/${filename}`, config.WEATHERSTAR_URL), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Weather music download failed with HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 20_000_000) throw new Error("Weather music file exceeds the size limit.");
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > 20_000_000) throw new Error("Weather music file exceeds the size limit.");
    const localPath = path.join(directory, `music-${index}.mp3`);
    await fs.writeFile(localPath, data);
    return localPath;
  }));
}

async function refreshGuideWeatherSummary(page: Page, feedKey: string): Promise<boolean> {
  const snapshot = await page.evaluate(readWs4kpSummarySnapshot);
  const summary = extractGuideWeatherSummary(snapshot);
  if (!summary) return false;
  return cacheGuideWeatherSummary(feedKey, summary);
}

async function renderWeather(job: Job<WeatherRenderJob>): Promise<void> {
  const { feedKey, zipCode } = job.data;
  const redis = getRedis();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `streamtumi-weather-${feedKey.slice(0, 8)}-`));
  const displayNumber = acquireDisplayNumber();
  const display = `:${displayNumber}`;
  let xvfb: ChildProcess | undefined;
  let browserProcess: ChildProcess | undefined;
  let ffmpeg: ChildProcess | undefined;
  let browser: Browser | undefined;
  let stopping = false;
  let runtimeError: Error | undefined;
  let idleStop = false;
  const stopActive = async () => {
    stopping = true;
    await stopProcess(ffmpeg);
    await browser?.close().catch(() => undefined);
    await stopProcess(browserProcess);
    await stopProcess(xvfb);
  };
  activeStops.add(stopActive);
  try {
    if (!(await redis.exists(`weather:demand:${feedKey}`))) return;
    await ensureBucket();
    await redis.hset(`weather:feed:${feedKey}`, { status: "STARTING", worker: os.hostname(), updatedAt: String(Date.now()), errorCode: "", failedAt: "" });
    await redis.expire(`weather:feed:${feedKey}`, config.WEATHER_RENDER_IDLE_SECONDS + 60);

    xvfb = spawn("Xvfb", [display, "-screen", "0", "1280x720x24", "-nolisten", "tcp", "-ac"], { stdio: "ignore" });
    xvfb.once("error", (error) => { if (!stopping) runtimeError = error; });
    xvfb.once("exit", (code, signal) => { if (!stopping) runtimeError = new Error(`Xvfb exited unexpectedly with ${code ?? signal}.`); });
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (xvfb.exitCode !== null) throw new Error("Xvfb failed to start.");

    const browserEnvironment = {
      DISPLAY: display,
      HOME: directory,
      LANG: process.env.LANG ?? "C.UTF-8",
      NODE_ENV: process.env.NODE_ENV,
      PATH: process.env.PATH,
      XDG_CACHE_HOME: path.join(directory, ".cache"),
      XDG_CONFIG_HOME: path.join(directory, ".config"),
    };
    const weatherUrl = weatherstarWidescreenUrl(config.WEATHERSTAR_URL, zipCode);
    const devtoolsPort = 9_000 + displayNumber;
    browserProcess = spawn(config.WEATHER_CHROMIUM_PATH, [
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-crash-reporter",
      "--disable-session-crashed-bubble",
      "--test-type",
      "--no-first-run",
      "--autoplay-policy=no-user-gesture-required",
      "--window-position=0,0",
      "--window-size=1280,720",
      "--start-fullscreen",
      `--remote-debugging-port=${devtoolsPort}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${path.join(directory, "chromium")}`,
      "--app=about:blank",
    ], { env: browserEnvironment, stdio: ["ignore", "ignore", "inherit"] });
    browserProcess.once("exit", (code, signal) => {
      if (!stopping) runtimeError = new Error(`Chromium exited unexpectedly with ${code ?? signal}.`);
    });
    browser = await chromium.connectOverCDP(await waitForDevtools(devtoolsPort, browserProcess));
    const context = browser.contexts()[0];
    const page = context?.pages()[0];
    if (!context || !page) throw new Error("Chromium did not create the WeatherStar app window.");
    await context.addInitScript(installWs4kpSummaryCapture);
    const cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "fullscreen" } });
    await page.goto(weatherUrl, { waitUntil: "domcontentloaded", timeout: config.WEATHER_RENDER_STARTUP_SECONDS * 1000 });
    await page.waitForFunction(() => {
      const loading = document.querySelector<HTMLElement>("#loading");
      const station = document.querySelector<HTMLElement>("#spanStationId");
      return document.body.classList.contains("kiosk")
        && loading?.style.display === "none"
        && Boolean(document.querySelector(".weather-display.show"))
        && Boolean(station?.textContent?.trim());
    }, undefined, { timeout: config.WEATHER_RENDER_STARTUP_SECONDS * 1000 });
    let nextSummaryRefreshAt = Date.now() + ((await refreshGuideWeatherSummary(page, feedKey).catch(() => false)) ? 30_000 : 5_000);

    const segmentPattern = path.join(directory, "segment-%010d.ts");
    const playlistPath = path.join(directory, "index.m3u8");
    const musicPlaylistPath = path.join(directory, "music.ffconcat");
    const musicTracks = await downloadWeatherMusic(directory);
    await fs.writeFile(musicPlaylistPath, `ffconcat version 1.0\n${musicTracks.map((track) => `file '${track}'`).join("\n")}\n`);
    const frameRate = String(config.WEATHER_RENDER_FRAME_RATE);
    const keyframeGap = String(config.WEATHER_RENDER_FRAME_RATE);
    ffmpeg = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "warning",
      "-thread_queue_size", "512", "-f", "x11grab", "-draw_mouse", "0", "-framerate", frameRate, "-video_size", "1280x720", "-i", `${display}.0+0,0`,
      "-thread_queue_size", "512", "-stream_loop", "-1", "-f", "concat", "-safe", "0", "-protocol_whitelist", "file", "-i", musicPlaylistPath,
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-profile:v", "baseline", "-level:v", "3.1", "-pix_fmt", "yuv420p",
      "-b:v", "2200k", "-maxrate", "2800k", "-bufsize", "5600k",
      "-r", frameRate, "-g", keyframeGap, "-keyint_min", keyframeGap, "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "2",
      "-f", "hls", "-hls_time", "1", "-hls_list_size", "5", "-hls_delete_threshold", "2",
      "-hls_start_number_source", "epoch",
      "-hls_flags", "delete_segments+omit_endlist+independent_segments+program_date_time+temp_file",
      "-hls_segment_filename", segmentPattern, playlistPath,
    ], { stdio: ["ignore", "ignore", "inherit"] });
    ffmpeg.once("error", (error) => { if (!stopping) runtimeError = error; });
    ffmpeg.once("exit", (code, signal) => {
      if (!stopping) runtimeError = new Error(`FFmpeg exited unexpectedly with ${code ?? signal}.`);
    });
    const uploaded = new Map<string, number>();
    const publishedAt = new Map<string, number>();
    let lastPlaylistAdvanceAt = Date.now();
    const ffmpegStartedAt = Date.now();
    let lastRemotePruneAt = 0;
    await redis.hdel(`weather:feed:${feedKey}`, "error", "errorCode", "failedAt", "nextRetryAt");

    let demandMissingAt: number | null = null;
    while (true) {
      if (!(await redis.exists(`weather:demand:${feedKey}`))) {
        demandMissingAt ??= Date.now();
        if (Date.now() - demandMissingAt >= 2_000) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      demandMissingAt = null;
      if (runtimeError) throw runtimeError;
      if (Date.now() >= nextSummaryRefreshAt) {
        const refreshed = await refreshGuideWeatherSummary(page, feedKey).catch(() => false);
        nextSummaryRefreshAt = Date.now() + (refreshed ? 30_000 : 5_000);
      }
      const previousPlaylistMtime = uploaded.get("index.m3u8");
      const ready = await uploadChangedFiles(directory, feedKey, uploaded, publishedAt);
      const playlistMtime = uploaded.get("index.m3u8");
      if (ready && playlistMtime !== previousPlaylistMtime) lastPlaylistAdvanceAt = Date.now();
      if (!ready && Date.now() - ffmpegStartedAt > 30_000) throw new Error("Weather HLS playlist did not start.");
      if (ready && Date.now() - lastPlaylistAdvanceAt > 15_000) {
        throw new Error("Weather HLS playlist stopped advancing.");
      }
      if (ready && Date.now() - lastRemotePruneAt >= 30_000) {
        const playlist = await fs.readFile(playlistPath, "utf8");
        const referenced = new Set(playlist.split("\n").map((line) => line.trim()).filter((line) => /^segment-[0-9]+\.ts$/.test(line)));
        await pruneRemoteSegments(feedKey, referenced, Date.now() - 120_000);
        lastRemotePruneAt = Date.now();
      }
      await redis.hset(`weather:feed:${feedKey}`, {
        status: ready ? "RUNNING" : "STARTING",
        worker: os.hostname(),
        updatedAt: String(Date.now()),
        playlistAdvancedAt: ready ? String(lastPlaylistAdvanceAt) : "",
      });
      await redis.expire(`weather:feed:${feedKey}`, config.WEATHER_RENDER_IDLE_SECONDS + 60);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    idleStop = true;
    await redis.hset(`weather:feed:${feedKey}`, { status: "IDLE", worker: os.hostname(), updatedAt: String(Date.now()) });
    await redis.expire(`weather:feed:${feedKey}`, 60);
  } catch (error) {
    const failureCount = await redis.hincrby(`weather:feed:${feedKey}`, "failureCount", 1);
    const backoffSeconds = Math.min(300, 5 * (2 ** Math.min(failureCount - 1, 6)));
    await redis.hset(`weather:feed:${feedKey}`, {
      status: "FAILED",
      errorCode: "WEATHER_RENDER_FAILED",
      failedAt: String(Date.now()),
      nextRetryAt: String(Date.now() + backoffSeconds * 1000),
      updatedAt: String(Date.now()),
    });
    await redis.expire(`weather:feed:${feedKey}`, 300);
    throw error;
  } finally {
    await stopActive();
    activeStops.delete(stopActive);
    releaseDisplayNumber(displayNumber);
    if (idleStop) await removePrefix(`weather/feeds/${feedKey}/`).catch((error) => console.error("Weather idle object cleanup failed:", error));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const worker = new Worker<WeatherRenderJob>("weather-render", renderWeather, {
  connection: getRedis(),
  concurrency: config.WEATHER_RENDER_CONCURRENCY,
  lockDuration: 60_000,
  stalledInterval: 15_000,
  maxStalledCount: 3,
});

worker.on("completed", (job) => console.info(`Weather feed ${job.data.feedKey.slice(0, 8)} stopped after becoming idle.`));
worker.on("failed", (job, error) => console.error(`Weather feed ${job?.data.feedKey.slice(0, 8) ?? "unknown"} failed:`, error));
worker.on("error", (error) => console.error("Weather renderer worker error:", error));

const heartbeatKey = `health:worker:weather:${os.hostname()}`;
async function writeHeartbeat(): Promise<void> {
  const now = String(Date.now());
  await Promise.all([
    getRedis().set(heartbeatKey, now, "EX", 20),
    getRedis().set("health:worker:weather-ready", now, "EX", 20),
  ]);
}
void writeHeartbeat().catch((error) => {
  console.error("Initial Weather renderer heartbeat failed:", error);
});
const heartbeatTimer = setInterval(() => void writeHeartbeat().catch((error) => {
  console.error("Weather renderer heartbeat failed:", error);
}), 5_000);

let shutdownPromise: Promise<void> | undefined;
async function shutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    clearInterval(heartbeatTimer);
    await worker.pause(true);
    await Promise.allSettled([...activeStops].map((stop) => stop()));
    await Promise.race([
      worker.close(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Weather worker shutdown timed out.")), 30_000)),
    ]);
    await getRedis().del(heartbeatKey);
    await getRedis().quit();
  })();
  return shutdownPromise;
}

function handleSignal(): void {
  void shutdown().then(() => process.exit(0), (error) => {
    console.error("Weather renderer shutdown failed:", error);
    process.exit(1);
  });
}

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);
