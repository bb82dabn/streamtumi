import { Readable } from "node:stream";
import { bucket, storage } from "@/lib/storage";
import { HttpError } from "@/lib/http";
import { withMobilePlaybackGrant } from "@/lib/mobile-playback-grant";

function contentType(key: string): string {
  if (key.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (key.endsWith(".ts")) return "video/mp2t";
  if (key.endsWith(".m4s")) return "video/iso.segment";
  if (key.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".flac")) return "audio/flac";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".m4a") || key.endsWith(".aac")) return "audio/mp4";
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".mp4") || key.endsWith(".m4v")) return "video/mp4";
  return "application/octet-stream";
}

export function rewriteHlsPlaylist(playlist: string, grant: string): string {
  return playlist.split("\n").map((line) => {
    const carriageReturn = line.endsWith("\r") ? "\r" : "";
    const content = carriageReturn ? line.slice(0, -1) : line;
    const uri = content.trim();
    if (!uri || uri.startsWith("#")) return line;
    const start = content.indexOf(uri);
    return `${content.slice(0, start)}${withMobilePlaybackGrant(uri, grant)}${content.slice(start + uri.length)}${carriageReturn}`;
  }).join("\n");
}

export async function objectResponse(
  key: string,
  request: Request,
  cacheControl = "private, max-age=300",
  grant?: string,
): Promise<Response> {
  try {
    const stat = await storage.statObject(bucket, key);
    if (grant && key.endsWith(".m3u8")) {
      const stream = await storage.getObject(bucket, key);
      const playlist = await new Response(Readable.toWeb(stream) as ReadableStream).text();
      const rewritten = rewriteHlsPlaylist(playlist, grant);
      return new Response(rewritten, {
        headers: {
          "Content-Type": contentType(key),
          "Content-Length": String(Buffer.byteLength(rewritten)),
          "Cache-Control": cacheControl,
        },
      });
    }
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) throw new HttpError(416, "Invalid byte range.", "INVALID_RANGE");
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) throw new HttpError(416, "Byte range is outside the object.", "INVALID_RANGE");
      const stream = await storage.getPartialObject(bucket, key, start, end - start + 1);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType(key),
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControl,
        },
      });
    }
    const stream = await storage.getObject(bucket, key);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": contentType(key),
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, "Media object not found.", "MEDIA_NOT_FOUND");
  }
}
