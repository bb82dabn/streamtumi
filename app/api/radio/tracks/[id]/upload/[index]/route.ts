import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";
import { assertRadioTrackOwner, requireApiUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { readBoundedUploadBody } from "@/lib/upload-body";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { chunkObjectKey, chunkSizeForIndex, isRadioTrackChunkSourcePrefix, UPLOAD_CHUNK_SIZE_BYTES, validateChunkLength } from "@/lib/upload-chunks";
import { detectedAudioMimes } from "@/lib/validation";

type Context = { params: Promise<{ id: string; index: string }> };
type UploadRow = { status: string; source_key: string; size_bytes: string };

function chunkIndex(value: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new HttpError(400, "The chunk index must be a non-negative integer.", "INVALID_CHUNK_INDEX");
  const index = Number(value);
  if (!Number.isSafeInteger(index)) throw new HttpError(400, "The chunk index is invalid.", "INVALID_CHUNK_INDEX");
  return index;
}

function activeUpload(row: UploadRow | undefined): UploadRow {
  if (!row) throw new HttpError(404, "Track not found.", "NOT_FOUND");
  if (row.status !== "UPLOADING") throw new HttpError(409, "This upload is no longer accepting chunks.", "UPLOAD_NOT_ACTIVE");
  if (!isRadioTrackChunkSourcePrefix(row.source_key)) throw new HttpError(409, "This track does not use chunked upload storage.", "NOT_CHUNKED_UPLOAD");
  return row;
}

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id, index: value } = await context.params;
    await assertRadioTrackOwner(id, user.id);
    const index = chunkIndex(value);
    const initial = await query<UploadRow>("SELECT status, source_key, size_bytes::text FROM radio_tracks WHERE id = $1", [id]);
    const upload = activeUpload(initial.rows[0]);
    let expectedSize: number;
    try {
      expectedSize = chunkSizeForIndex(Number(upload.size_bytes), index);
    } catch {
      throw new HttpError(400, "The chunk index is outside this upload's range.", "CHUNK_OUT_OF_RANGE");
    }
    const length = validateChunkLength(request.headers.get("content-length"), expectedSize);
    if (!length.ok) {
      if (length.reason === "too-large") throw new HttpError(413, "The chunk exceeds the 512 KiB limit.", "CHUNK_TOO_LARGE");
      throw new HttpError(400, "Content-Length must exactly match the expected chunk size.", "CHUNK_SIZE_MISMATCH");
    }
    const body = await readBoundedUploadBody(request.body, expectedSize, UPLOAD_CHUNK_SIZE_BYTES);
    const detected = index === 0 ? await fileTypeFromBuffer(body) : undefined;
    if (index === 0 && (!detected || !detectedAudioMimes.has(detected.mime))) {
      throw new HttpError(415, "The uploaded bytes are not a supported audio file.", "INVALID_FILE_SIGNATURE");
    }
    await ensureBucket();
    await transaction(async (client) => {
      const locked = await client.query<UploadRow>("SELECT status, source_key, size_bytes::text FROM radio_tracks WHERE id = $1 FOR UPDATE", [id]);
      const current = activeUpload(locked.rows[0]);
      if (current.source_key !== upload.source_key || current.size_bytes !== upload.size_bytes) throw new HttpError(409, "The upload metadata changed while this chunk was being sent.", "UPLOAD_CHANGED");
      await storage.putObject(bucket, chunkObjectKey(current.source_key, index), body, body.length, { "Content-Type": "application/octet-stream" });
      if (detected) await client.query("UPDATE radio_tracks SET mime_type = $1, processing_error = NULL, updated_at = now() WHERE id = $2", [detected.mime, id]);
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
