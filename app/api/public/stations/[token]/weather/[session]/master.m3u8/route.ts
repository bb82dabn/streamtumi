import { jsonError } from "@/lib/http";
import { env } from "@/lib/env";
import { resolvePublicStation } from "@/lib/public-access";
import { assertWeatherStationRunning, requireWeatherPlaybackSession } from "@/lib/weather-playback";

type Context = { params: Promise<{ token: string; session: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { token, session } = await context.params;
    const station = await resolvePublicStation(token, request);
    if (station.playback_type !== "WEATHERSTAR_4000") return new Response("Not found", { status: 404 });
    assertWeatherStationRunning(station);
    await requireWeatherPlaybackSession(station.id, session);
    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-STREAM-INF:BANDWIDTH=2800000,AVERAGE-BANDWIDTH=2200000,RESOLUTION=1280x720,FRAME-RATE=${env().WEATHER_RENDER_FRAME_RATE.toFixed(3)},CODECS="avc1.42c01f,mp4a.40.2"`,
      "index.m3u8",
      "",
    ].join("\n");
    return new Response(playlist, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
