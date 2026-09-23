import { query } from "@/lib/db";
import { resolveCalendarRuntime } from "@/lib/calendar-runtime";
import { jsonError, HttpError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { mobilePlaybackGrantFromRequest } from "@/lib/mobile-playback-grant";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string; videoId: string; path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-media", 600, 60);
    const { token, videoId, path } = await context.params;
    const station = await resolvePublicStation(token, request);
    if (station.broadcast_state === "STOPPED") throw new HttpError(409, "This station is currently off air.", "STATION_STOPPED");
    const calendarRuntime = await resolveCalendarRuntime(station.id, new Date());
    if (calendarRuntime?.plannedStatus === "OFFLINE") {
      throw new HttpError(409, "This station is currently off air.", "STATION_STOPPED");
    }
    const calendarScheduleId = calendarRuntime?.stationKind === "TV"
      && calendarRuntime.desiredSource.kind === "TV_SCHEDULE"
      ? calendarRuntime.desiredSource.scheduleId
      : null;
    const media = await query<{ hls_key: string; thumbnail_key: string | null; captions_key: string | null }>(
      `SELECT i.hls_key, i.thumbnail_key, i.captions_key
         FROM schedule_items i
        WHERE i.video_id = $1 AND i.schedule_id IN ($2, $3) LIMIT 1`,
      [
        videoId,
        calendarRuntime ? calendarScheduleId : station.active_schedule_id,
        calendarRuntime ? null : station.pending_schedule_id,
      ],
    );
    const row = media.rows[0];
    if (!row) throw new HttpError(404, "Media not found in this station schedule.", "MEDIA_NOT_FOUND");
    const relative = path.join("/");
    let key: string | null;
    if (relative === "thumbnail.jpg") key = row.thumbnail_key;
    else if (relative === "captions.vtt") key = row.captions_key;
    else key = `${row.hls_key.replace(/master\.m3u8$/, "")}${relative}`;
    if (!key) throw new HttpError(404, "Media object not found.", "MEDIA_NOT_FOUND");
    const grant = station.access_password_hash || station.room_access_generation
      ? mobilePlaybackGrantFromRequest(request, token, station.id, Date.now(), station.room_access_generation ?? "legacy") ?? undefined
      : undefined;
    return objectResponse(key, request, "private, max-age=3600", grant);
  } catch (error) {
    return jsonError(error);
  }
}
