import { z } from "zod";
import { requireAdminPreview } from "@/lib/admin-preview";
import { query } from "@/lib/db";
import { jsonError, HttpError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { promoteDueStation } from "@/lib/schedule-publication";

type Context = { params: Promise<{ id: string; videoId: string; path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    const parameters = await context.params;
    const id = z.string().uuid().parse(parameters.id);
    const videoId = z.string().uuid().parse(parameters.videoId);
    await requireAdminPreview(id);
    await promoteDueStation(id);
    const media = await query<{
      hls_key: string;
      captions_key: string | null;
      broadcast_state: "RUNNING" | "STOPPED";
    }>(
      `SELECT i.hls_key, i.captions_key, s.broadcast_state
         FROM stations s
         JOIN schedule_items i ON i.schedule_id = s.active_schedule_id
        WHERE s.id = $1 AND s.deleted_at IS NULL AND i.video_id = $2
        LIMIT 1`,
      [id, videoId],
    );
    const row = media.rows[0];
    if (!row) throw new HttpError(404, "Media not found in this station schedule.", "MEDIA_NOT_FOUND");
    if (row.broadcast_state === "STOPPED") throw new HttpError(409, "This station is currently off air.", "STATION_STOPPED");
    const relative = parameters.path.join("/");
    const key = relative === "captions.vtt"
      ? row.captions_key
      : `${row.hls_key.replace(/master\.m3u8$/, "")}${relative}`;
    if (!key) throw new HttpError(404, "Media object not found.", "MEDIA_NOT_FOUND");
    return objectResponse(key, request, "private, no-store");
  } catch (error) {
    return jsonError(error);
  }
}
