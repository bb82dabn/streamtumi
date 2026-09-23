import { Readable } from "node:stream";
import { jsonError, HttpError } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { bucket, storage } from "@/lib/storage";
import { assertWeatherStationRunning, requireWeatherPlaybackSession, waitForWeatherFeed, weatherFeedObjectKey } from "@/lib/weather-playback";

type Context = { params: Promise<{ token: string; session: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { token, session: sessionToken } = await context.params;
    const station = await resolvePublicStation(token, request);
    if (station.playback_type !== "WEATHERSTAR_4000") throw new HttpError(404, "Not found.", "NOT_FOUND");
    assertWeatherStationRunning(station);
    const session = await requireWeatherPlaybackSession(station.id, sessionToken);
    if (!(await waitForWeatherFeed(session.feed_key, 8_000))) {
      throw new HttpError(503, "Your local weather feed is starting.", "WEATHER_STREAM_STARTING");
    }
    let stream;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        stream = await storage.getObject(bucket, weatherFeedObjectKey(session.feed_key, "index.m3u8"));
        break;
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "NoSuchKey" || attempt === 19) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!stream) throw new HttpError(503, "Your local weather feed is starting.", "WEATHER_STREAM_STARTING");
    const source = await new Response(Readable.toWeb(stream) as ReadableStream).text();
    const playlist = source.split("\n").map((line) => {
      const filename = line.trim();
      if (!/^segment-[0-9]+\.ts$/.test(filename)) return line;
      return `segments/${filename}`;
    }).join("\n");
    return new Response(playlist, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError && error.code === "WEATHER_STREAM_STARTING") {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), {
        status: error.status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "3" },
      });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "NoSuchKey") {
      return new Response(JSON.stringify({ error: "Your local weather feed is starting.", code: "WEATHER_STREAM_STARTING" }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "2" },
      });
    }
    return jsonError(error);
  }
}
