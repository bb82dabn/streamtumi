import { requireApiUser, assertStationOwner } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonError, HttpError } from "@/lib/http";
import { objectResponse } from "@/lib/media";

type Context = { params: Promise<{ id: string; videoId: string; path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id, videoId, path } = await context.params;
    await assertStationOwner(id, user.id);
    const video = await query<{ hls_key: string | null; thumbnail_key: string | null; captions_key: string | null }>(
      "SELECT hls_key, thumbnail_key, captions_key FROM videos WHERE id = $1 AND station_id = $2",
      [videoId, id],
    );
    const row = video.rows[0];
    if (!row) throw new HttpError(404, "Video not found.", "NOT_FOUND");
    const relative = path.join("/");
    let key: string | null;
    if (relative === "thumbnail.jpg") key = row.thumbnail_key;
    else if (relative === "captions.vtt") key = row.captions_key;
    else key = row.hls_key ? `${row.hls_key.replace(/master\.m3u8$/, "")}${relative}` : null;
    if (!key) throw new HttpError(404, "Media is not ready.", "MEDIA_NOT_READY");
    return objectResponse(key, request);
  } catch (error) {
    return jsonError(error);
  }
}
