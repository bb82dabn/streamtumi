import { HttpError, jsonError } from "@/lib/http";
import { resolveCalendarRuntime } from "@/lib/calendar-runtime";
import { rewriteHlsPlaylist } from "@/lib/media";
import { mobilePlaybackGrantFromRequest } from "@/lib/mobile-playback-grant";
import { resolvePublicStation, resolvePublicTvChannelReadiness } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";
import { buildTvHlsMasterManifest } from "@/lib/tv-hls";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-tv-hls", 1200, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token, request);
    if (station.station_kind !== "TV" || station.tv_delivery_mode !== "CHANNEL_HLS") {
      throw new HttpError(404, "TV channel stream not found.", "NOT_FOUND");
    }
    if (station.broadcast_state !== "RUNNING") {
      throw new HttpError(409, "This TV station is off air.", "STATION_STOPPED");
    }
    const requestedAt = new Date();
    const calendarRuntime = await resolveCalendarRuntime(station.id, requestedAt);
    if (calendarRuntime?.plannedStatus === "OFFLINE") {
      throw new HttpError(409, "This TV station is off air.", "STATION_STOPPED");
    }
    const readiness = await resolvePublicTvChannelReadiness(station, requestedAt, calendarRuntime);
    if (readiness.status !== "AVAILABLE") {
      const failed = readiness.status === "FAILED";
      throw new HttpError(503, failed ? "The TV channel stream failed." : "The TV channel stream is starting. Try again shortly.", failed ? "STREAM_FAILED" : "STREAM_STARTING");
    }

    const base = `/api/public/stations/${token}/tv`;
    const renditionMode = station.tv_channel_rendition_mode;
    const uris = renditionMode === "DUAL"
      ? { "720p": `${base}/720p/index.m3u8`, "360p": `${base}/360p/index.m3u8` }
      : { "720p": `${base}/720p/index.m3u8` };
    const manifest = buildTvHlsMasterManifest(uris, renditionMode);
    const grant = station.access_password_hash || station.room_access_generation
      ? mobilePlaybackGrantFromRequest(request, token, station.id, Date.now(), station.room_access_generation ?? "legacy")
      : null;
    return new Response(grant ? rewriteHlsPlaylist(manifest, grant) : manifest, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
