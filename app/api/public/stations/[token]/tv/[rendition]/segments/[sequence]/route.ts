import { query } from "@/lib/db";
import { HttpError, jsonError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";
import type { TvChannelRendition } from "@/lib/tv-segment-journal";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string; rendition: string; sequence: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-tv-segment", 2400, 60);
    const { token, rendition: rawRendition, sequence: rawSequence } = await context.params;
    if (rawRendition !== "720p" && rawRendition !== "360p") {
      throw new HttpError(404, "TV channel segment not found.", "NOT_FOUND");
    }
    const match = /^(0|[1-9]\d*)\.ts$/.exec(rawSequence);
    const mediaSequence = match ? Number(match[1]) : Number.NaN;
    if (!Number.isSafeInteger(mediaSequence)) {
      throw new HttpError(404, "TV channel segment not found.", "NOT_FOUND");
    }
    const rendition: TvChannelRendition = rawRendition;
    const station = await resolvePublicStation(token, request);
    if (station.station_kind !== "TV" || station.tv_delivery_mode !== "CHANNEL_HLS") {
      throw new HttpError(404, "TV channel segment not found.", "NOT_FOUND");
    }
    if (rendition === "360p" && station.tv_channel_rendition_mode === "HD_ONLY") {
      throw new HttpError(404, "TV channel segment not found.", "NOT_FOUND");
    }

    const result = await query<{ object_key: string }>(
      `SELECT automation_segment.object_key
         FROM tv_segment_journal journal
         JOIN schedules schedule
            ON schedule.id = journal.automation_schedule_id AND schedule.station_id = journal.station_id
         JOIN tv_channel_delivery_segments automation_segment
           ON automation_segment.descriptor_id = journal.descriptor_id
          AND automation_segment.segment_index = journal.descriptor_segment_index
          AND automation_segment.rendition = $3
         WHERE journal.station_id = $1 AND journal.media_sequence = $2
           AND journal.source_kind = 'AUTOMATION'
           AND journal.ends_at > clock_timestamp() - interval '2 minutes'
           AND journal.starts_at < clock_timestamp() + interval '30 seconds'
         LIMIT 1`,
      [station.id, mediaSequence, rendition],
    );
    const objectKey = result.rows[0]?.object_key;
    if (!objectKey) throw new HttpError(404, "TV channel segment not found.", "NOT_FOUND");
    const cacheControl = station.visibility === "PUBLIC" && !station.access_password_hash && !station.room_access_generation
      ? "public, max-age=31536000, s-maxage=31536000, immutable"
      : "private, max-age=86400, immutable";
    return objectResponse(objectKey, request, cacheControl);
  } catch (error) {
    return jsonError(error);
  }
}
