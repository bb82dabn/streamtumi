import { NextResponse } from "next/server";
import { assertRadioTrackOwner, requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { isRadioTrackChunkSourcePrefix } from "@/lib/upload-chunks";
import { failUploadSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertRadioTrackOwner(id, user.id);
    const data = failUploadSchema.parse(await parseJson(request));
    const upload = await query<{ status: string; source_key: string }>("SELECT status, source_key FROM radio_tracks WHERE id = $1", [id]);
    const row = upload.rows[0];
    if (!row || !isRadioTrackChunkSourcePrefix(row.source_key)) throw new HttpError(409, "This track is not an active chunked upload.", "NOT_CHUNKED_UPLOAD");
    if (row.status !== "UPLOADING") throw new HttpError(409, "This upload is no longer active.", "UPLOAD_NOT_ACTIVE");
    const cause = data.error || "A chunk could not be uploaded after several attempts.";
    const updated = await query("UPDATE radio_tracks SET status = 'FAILED', processing_progress = 0, processing_error = $1, updated_at = now() WHERE id = $2 AND status = 'UPLOADING'", [`Upload incomplete: ${cause}`.slice(0, 1000), id]);
    if (!updated.rowCount) throw new HttpError(409, "This upload is no longer active.", "UPLOAD_NOT_ACTIVE");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
