import { query } from "@/lib/db";
import { HttpError, jsonError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import {
  matchesPublicCalendarRadioItemRef,
  resolvePublicStation,
} from "@/lib/public-access";

type Context = { params: Promise<{ token: string; timelineItemId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { token, timelineItemId } = await context.params;
    const station = await resolvePublicStation(token, request);
    if (station.station_kind !== "RADIO") throw new HttpError(404, "Radio artwork not found.", "NOT_FOUND");
    if (timelineItemId.startsWith("cal_")) {
      const calendar = await query<{ id: string; artwork_key: string }>(
        `SELECT calendar_item.id, item.artwork_key
           FROM radio_playout_state state
           JOIN calendar_radio_occurrence_items calendar_item
             ON calendar_item.id = state.current_calendar_item_id
            AND calendar_item.station_id = state.station_id
            AND calendar_item.release_id = state.calendar_release_id
            AND calendar_item.occurrence_id = state.occurrence_id
           JOIN clock_release_items item
             ON item.release_block_id = calendar_item.release_block_id
            AND item.id = calendar_item.release_item_id
          WHERE state.station_id = $1 AND item.artwork_key IS NOT NULL
            AND state.heartbeat_at > now() - interval '30 seconds'`,
        [station.id],
      );
      const row = calendar.rows[0];
      if (!row || !matchesPublicCalendarRadioItemRef(station.id, row.id, timelineItemId)) {
        throw new HttpError(404, "Radio artwork not found.", "NOT_FOUND");
      }
      return objectResponse(row.artwork_key, request, station.access_password_hash || station.room_access_generation ? "private, max-age=86400" : "public, max-age=86400, s-maxage=86400");
    }
    const result = await query<{ artwork_key: string }>(
      `SELECT item.artwork_key FROM clock_timeline_items timeline
        JOIN clock_releases release ON release.id = timeline.release_id
        JOIN clock_release_items item ON item.id = timeline.release_item_id
       WHERE timeline.id = $1 AND release.station_id = $2 AND item.artwork_key IS NOT NULL`,
      [timelineItemId, station.id],
    );
    if (!result.rows[0]) throw new HttpError(404, "Radio artwork not found.", "NOT_FOUND");
    return objectResponse(result.rows[0].artwork_key, request, station.access_password_hash || station.room_access_generation ? "private, max-age=86400" : "public, max-age=86400, s-maxage=86400");
  } catch (error) {
    return jsonError(error);
  }
}
