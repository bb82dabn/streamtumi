import { query } from "@/lib/db";
import { HttpError, jsonError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";
import { radioSegmentKey } from "@/lib/radio-delivery";

type Context = { params: Promise<{ token: string; releaseId: string; timelineItemId: string; segment: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-radio-media", 1200, 60);
    const { token, releaseId, timelineItemId, segment } = await context.params;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(releaseId) || !uuid.test(timelineItemId) || !/^segment_\d{10}\.ts$/.test(segment)) {
      throw new HttpError(404, "Radio segment not found.", "NOT_FOUND");
    }
    const station = await resolvePublicStation(token, request);
    if (station.station_kind !== "RADIO" || station.broadcast_state !== "RUNNING" || station.radio_delivery_mode !== "STATIC_HLS") {
      throw new HttpError(404, "Radio segment not found.", "NOT_FOUND");
    }
    const handoverRelease = station.previous_clock_release_id === releaseId
      && Boolean(station.radio_release_changed_at && Date.now() - station.radio_release_changed_at.getTime() < 120_000);
    if (station.active_clock_release_id !== releaseId && !handoverRelease) throw new HttpError(404, "Radio segment not found.", "NOT_FOUND");
    const result = await query<{ audio_hls_key: string; segment_duration_ms: number; first_segment: number; segment_count: number }>(
      `SELECT item.audio_hls_key, item.segment_duration_ms, delivery.first_segment, delivery.segment_count
         FROM clock_timeline_items timeline
         JOIN clock_releases release ON release.id = timeline.release_id
         JOIN radio_timeline_delivery delivery ON delivery.timeline_item_id = timeline.id
         JOIN radio_release_item_delivery item ON item.release_item_id = timeline.release_item_id
        WHERE timeline.id = $1 AND timeline.release_id = $2 AND release.station_id = $3
          AND timeline.starts_at + (((($4::int * item.segment_duration_ms) - timeline.source_offset_ms)::text || ' milliseconds')::interval)
                <= clock_timestamp() + (((item.segment_duration_ms + 1000)::text || ' milliseconds')::interval)
          AND timeline.ends_at > clock_timestamp() - interval '2 minutes'`,
      [timelineItemId, releaseId, station.id, Number(/^segment_(\d{10})\.ts$/.exec(segment)?.[1])],
    );
    const delivery = result.rows[0];
    const segmentIndex = Number(/^segment_(\d{10})\.ts$/.exec(segment)?.[1]);
    if (!delivery || segmentIndex < delivery.first_segment || segmentIndex >= delivery.first_segment + delivery.segment_count) {
      throw new HttpError(404, "Radio segment not found.", "NOT_FOUND");
    }
    const cacheControl = station.access_password_hash || station.room_access_generation
      ? "private, max-age=86400, immutable"
      : "public, max-age=31536000, s-maxage=31536000, immutable";
    return objectResponse(radioSegmentKey(delivery.audio_hls_key, segment), request, cacheControl);
  } catch (error) {
    return jsonError(error);
  }
}
