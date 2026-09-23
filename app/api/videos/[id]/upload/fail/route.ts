import { NextResponse } from "next/server";
import { assertVideoOwner, requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { isChunkSourcePrefix } from "@/lib/upload-chunks";
import { failUploadSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertVideoOwner(id, user.id);
    const data = failUploadSchema.parse(await parseJson(request));
    const upload = await query<{ status: string; source_key: string }>("SELECT status, source_key FROM videos WHERE id = $1", [id]);
    const row = upload.rows[0];
    if (!row || !isChunkSourcePrefix(row.source_key)) throw new HttpError(409, "This video is not an active chunked upload.", "NOT_CHUNKED_UPLOAD");
    if (row.status !== "UPLOADING") throw new HttpError(409, "This upload is no longer active.", "UPLOAD_NOT_ACTIVE");
    const cause = data.error || "A chunk could not be uploaded after several attempts.";
    const message = `Upload incomplete: ${cause} Start the upload again to create a new reservation. This retained reservation still counts toward storage.`.slice(0, 1000);
    const updated = await query(
      "UPDATE videos SET status = 'FAILED', processing_progress = 0, processing_error = $1, updated_at = now() WHERE id = $2 AND status = 'UPLOADING'",
      [message, id],
    );
    if (!updated.rowCount) throw new HttpError(409, "This upload is no longer active.", "UPLOAD_NOT_ACTIVE");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
