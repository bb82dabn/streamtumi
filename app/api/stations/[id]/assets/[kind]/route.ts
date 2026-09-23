import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";
import { requireApiUser, assertStationOwner } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, jsonError, HttpError } from "@/lib/http";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { objectResponse } from "@/lib/media";

type Context = { params: Promise<{ id: string; kind: string }> };
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAssetBytes = 5 * 1024 * 1024;

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id, kind } = await context.params;
    if (kind !== "logo" && kind !== "slate") throw new HttpError(404, "Asset type not found.", "NOT_FOUND");
    await assertStationOwner(id, user.id);
    const result = await query<{ key: string | null }>(
      `SELECT ${kind === "logo" ? "logo_key" : "offline_slate_key"} AS key FROM stations WHERE id = $1`,
      [id],
    );
    if (!result.rows[0]?.key) throw new HttpError(404, "Asset not found.", "NOT_FOUND");
    return objectResponse(result.rows[0].key, request);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id, kind } = await context.params;
    if (kind !== "logo" && kind !== "slate") throw new HttpError(404, "Asset type not found.", "NOT_FOUND");
    await assertStationOwner(id, user.id);
    const contentLength = request.headers.get("content-length");
    if (contentLength && (!Number.isSafeInteger(Number(contentLength)) || Number(contentLength) <= 0 || Number(contentLength) > maxAssetBytes + 64 * 1024)) {
      throw new HttpError(413, "The asset upload is too large.", "ASSET_TOO_LARGE");
    }
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || file.size <= 0 || file.size > maxAssetBytes) {
      throw new HttpError(400, "Choose a PNG, JPEG, or WebP image up to 5 MB.", "INVALID_ASSET");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !allowed.has(detected.mime)) throw new HttpError(415, "The asset must be a PNG, JPEG, or WebP image.", "INVALID_ASSET");
    const key = `stations/${id}/branding/${kind}.${detected.ext}`;
    await ensureBucket();
    await storage.putObject(bucket, key, buffer, buffer.byteLength, { "Content-Type": detected.mime, "Cache-Control": "private, max-age=300" });
    await query(`UPDATE stations SET ${kind === "logo" ? "logo_key" : "offline_slate_key"} = $1, updated_at = now() WHERE id = $2`, [key, id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
