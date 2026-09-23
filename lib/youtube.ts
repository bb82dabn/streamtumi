import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { HttpError } from "@/lib/http";

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const formatIdPattern = /^[A-Za-z0-9._-]{1,64}$/;
const ytDlpPath = "/usr/local/bin/yt-dlp";
const metadataLimitBytes = 5 * 1024 * 1024;

export type NormalizedYouTubeUrl = { videoId: string; url: string };
export type YouTubeFormat = {
  formatId: string;
  extension: "mp4" | "webm";
  mimeType: "video/mp4" | "video/webm";
  title: string;
  durationSeconds: number;
};

function invalidUrl(): never {
  throw new HttpError(400, "Enter a direct YouTube video, Shorts, or youtu.be link.", "INVALID_YOUTUBE_URL");
}

export function normalizeYouTubeUrl(value: string): NormalizedYouTubeUrl {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalidUrl();
  }
  const hasExplicitPort = /^https:\/\/[^/?#]+:\d+(?:[/?#]|$)/i.test(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || hasExplicitPort || parsed.hash) return invalidUrl();
  const host = parsed.hostname.toLowerCase();
  let videoId = "";
  if (host === "youtu.be") {
    const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
    if (!match || parsed.searchParams.has("list")) return invalidUrl();
    videoId = match[1];
  } else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (parsed.pathname === "/watch") {
      const values = parsed.searchParams.getAll("v");
      if (values.length !== 1 || parsed.searchParams.has("list")) return invalidUrl();
      videoId = values[0];
    } else {
      const match = parsed.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/);
      if (!match || parsed.searchParams.has("list")) return invalidUrl();
      videoId = match[1];
    }
  } else {
    return invalidUrl();
  }
  if (!videoIdPattern.test(videoId)) return invalidUrl();
  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function safeTitle(value: unknown, videoId: string): string {
  const title = typeof value === "string"
    ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  return title || `YouTube video ${videoId}`;
}

export function selectYouTubeFormat(
  value: unknown,
  expectedVideoId: string,
  maxDurationSeconds: number,
  maxBytes: number,
): YouTubeFormat {
  const metadata = record(value);
  const extractor = String(metadata.extractor ?? "").toLowerCase();
  if (metadata.id !== expectedVideoId || (extractor !== "youtube" && metadata.extractor_key !== "Youtube")) {
    throw new Error("YouTube returned metadata for a different video.");
  }
  if (metadata.is_live === true || ["is_live", "is_upcoming", "post_live"].includes(String(metadata.live_status ?? ""))) {
    throw new Error("Live and upcoming YouTube streams cannot be imported.");
  }
  const durationSeconds = Number(metadata.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("YouTube did not provide a valid video duration.");
  if (durationSeconds > maxDurationSeconds) {
    throw new Error(`This YouTube video exceeds the ${Math.floor(maxDurationSeconds / 60)} minute import limit.`);
  }
  const formats = Array.isArray(metadata.formats) ? metadata.formats.map(record) : [];
  const candidates = formats.filter((format) => {
    const formatId = String(format.format_id ?? "");
    const extension = String(format.ext ?? "");
    const exactBytes = format.filesize == null ? null : Number(format.filesize);
    const approximateBytes = format.filesize_approx == null ? null : Number(format.filesize_approx);
    return formatIdPattern.test(formatId)
      && (extension === "mp4" || extension === "webm")
      && String(format.protocol ?? "") === "https"
      && String(format.vcodec ?? "none") !== "none"
      && String(format.acodec ?? "none") !== "none"
      && (exactBytes === null || (Number.isFinite(exactBytes) && exactBytes > 0 && exactBytes <= maxBytes))
      && (approximateBytes === null || !Number.isFinite(approximateBytes) || approximateBytes <= maxBytes);
  }).sort((left, right) => {
    const leftKnown = left.filesize != null || left.filesize_approx != null ? 1 : 0;
    const rightKnown = right.filesize != null || right.filesize_approx != null ? 1 : 0;
    const leftScore = leftKnown * 1_000_000_000_000 + Number(left.height ?? 0) * 1_000_000 + Number(left.tbr ?? 0) * 1_000 + (left.ext === "mp4" ? 1 : 0);
    const rightScore = rightKnown * 1_000_000_000_000 + Number(right.height ?? 0) * 1_000_000 + Number(right.tbr ?? 0) * 1_000 + (right.ext === "mp4" ? 1 : 0);
    return rightScore - leftScore;
  });
  const selected = candidates[0];
  if (!selected) throw new Error("This YouTube video has no supported combined audio/video format within the import limit.");
  const extension = selected.ext as "mp4" | "webm";
  return {
    formatId: String(selected.format_id),
    extension,
    mimeType: extension === "mp4" ? "video/mp4" : "video/webm",
    title: safeTitle(metadata.title, expectedVideoId),
    durationSeconds,
  };
}

function childEnvironment(): NodeJS.ProcessEnv {
  return {
    HOME: "/tmp",
    LANG: "C.UTF-8",
    NODE_ENV: "production",
    PATH: "/usr/local/bin:/usr/bin:/bin",
    NO_COLOR: "1",
  };
}

function ytDlpArgs(): string[] {
  return [
    "--ignore-config",
    "--no-cache-dir",
    "--no-playlist",
    "--no-warnings",
    "--js-runtimes",
    "node:/usr/local/bin/node",
    "--extractor-args",
    "youtube:player_client=web_embedded",
  ];
}

function killProcessTree(child: ReturnType<typeof spawn>): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch { /* process may have already exited */ }
  }
  child.kill("SIGKILL");
}

export async function loadYouTubeMetadata(url: string, timeoutSeconds: number): Promise<unknown> {
  const child = spawn(ytDlpPath, [...ytDlpArgs(), "--skip-download", "--dump-single-json", "--", url], {
    detached: process.platform !== "win32",
    env: childEnvironment(),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  let outputBytes = 0;
  let exceeded = false;
  let timedOut = false;
  child.stdout.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > metadataLimitBytes) {
      exceeded = true;
      killProcessTree(child);
      return;
    }
    stdout.push(chunk);
  });
  child.stderr.resume();
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
  }, timeoutSeconds * 1000);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error("YouTube metadata lookup timed out.");
  if (exceeded) throw new Error("YouTube returned too much metadata.");
  if (code !== 0) throw new Error("YouTube could not provide this video for import.");
  try {
    return JSON.parse(Buffer.concat(stdout).toString("utf8"));
  } catch {
    throw new Error("YouTube returned invalid video metadata.");
  }
}

export async function downloadYouTubeFormat(
  url: string,
  formatId: string,
  destination: string,
  maxBytes: number,
  timeoutSeconds: number,
): Promise<number> {
  if (!formatIdPattern.test(formatId)) throw new Error("YouTube returned an invalid media format.");
  const output = await fs.open(destination, "wx");
  const child = spawn(ytDlpPath, [...ytDlpArgs(), "--format", formatId, "--output", "-", "--", url], {
    detached: process.platform !== "win32",
    env: childEnvironment(),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.resume();
  let downloadedBytes = 0;
  let tooLarge = false;
  let timedOut = false;
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
  }, timeoutSeconds * 1000);
  try {
    for await (const chunk of child.stdout) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      downloadedBytes += buffer.length;
      if (downloadedBytes > maxBytes) {
        tooLarge = true;
        killProcessTree(child);
        break;
      }
      await output.write(buffer);
    }
    const code = await closed;
    if (timedOut) throw new Error("The YouTube download timed out.");
    if (tooLarge) throw new Error("The YouTube video exceeds the available import storage.");
    if (code !== 0 || downloadedBytes <= 0) throw new Error("YouTube could not download this video.");
    return downloadedBytes;
  } catch (error) {
    killProcessTree(child);
    await closed.catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    await output.close();
  }
}
