import { assertRadioTrackOwner, requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError, jsonError } from "@/lib/http";
import { objectResponse } from "@/lib/media";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertRadioTrackOwner(id, user.id);
    const result = await query<{ artwork_key: string | null }>("SELECT artwork_key FROM radio_tracks WHERE id = $1 AND status <> 'ARCHIVED'", [id]);
    const key = result.rows[0]?.artwork_key;
    if (!key) throw new HttpError(404, "Track artwork not found.", "NOT_FOUND");
    return objectResponse(key, request, "private, max-age=3600");
  } catch (error) {
    return jsonError(error);
  }
}
