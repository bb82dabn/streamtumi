import { NextResponse } from "next/server";
import { assertRadioTrackOwner, requireApiUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { getRadioPrepQueue } from "@/lib/queue";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { chunkManifest, isRadioTrackChunkSourcePrefix, type StoredChunk, validateChunkInventory } from "@/lib/upload-chunks";

type Context = { params: Promise<{ id: string }> };
type UploadRow = { status: string; source_key: string; size_bytes: string };

function activeUpload(row: UploadRow | undefined): UploadRow {
  if (!row) throw new HttpError(404, "Track not found.", "NOT_FOUND");
  if (row.status !== "UPLOADING") throw new HttpError(409, "This upload cannot be completed from its current state.", "UPLOAD_NOT_ACTIVE");
  if (!isRadioTrackChunkSourcePrefix(row.source_key)) throw new HttpError(409, "This track does not use chunked upload storage.", "NOT_CHUNKED_UPLOAD");
  return row;
}

function listStoredChunks(prefix: string): Promise<StoredChunk[]> {
  return new Promise((resolve, reject) => {
    const chunks: StoredChunk[] = [];
    const stream = storage.listObjectsV2(bucket, prefix, true);
    stream.on("data", (item) => { if (item.name) chunks.push({ name: item.name, size: item.size }); });
    stream.on("error", reject);
    stream.on("end", () => resolve(chunks));
  });
}

function requireInventory(prefix: string, size: number, chunks: StoredChunk[]): void {
  if (!validateChunkInventory(prefix, size, chunks).ok) {
    throw new HttpError(409, "The upload is incomplete or contains a chunk with the wrong size.", "INCOMPLETE_UPLOAD");
  }
}

export async function POST(request: Request, context: Context) {
  let queuedTrackId: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertRadioTrackOwner(id, user.id);
    await ensureBucket();
    await transaction(async (client) => {
      const locked = await client.query<UploadRow>("SELECT status, source_key, size_bytes::text FROM radio_tracks WHERE id = $1 FOR UPDATE", [id]);
      const upload = activeUpload(locked.rows[0]);
      const totalSize = Number(upload.size_bytes);
      requireInventory(upload.source_key, totalSize, await listStoredChunks(upload.source_key));
      const stated: StoredChunk[] = [];
      try {
        for (const chunk of chunkManifest(upload.source_key, totalSize)) {
          stated.push({ name: chunk.name, size: (await storage.statObject(bucket, chunk.name)).size });
        }
      } catch {
        throw new HttpError(409, "A required chunk disappeared before completion.", "INCOMPLETE_UPLOAD");
      }
      requireInventory(upload.source_key, totalSize, stated);
      const updated = await client.query("UPDATE radio_tracks SET status = 'QUEUED', processing_progress = 1, processing_error = NULL, updated_at = now() WHERE id = $1 AND status = 'UPLOADING'", [id]);
      if (!updated.rowCount) throw new HttpError(409, "This upload was already completed or failed.", "UPLOAD_NOT_ACTIVE");
    });
    queuedTrackId = id;
    await getRadioPrepQueue().add("prepare-radio-track", { trackId: id }, { jobId: `radio-track-${id}` });
    return NextResponse.json({ trackId: id, status: "QUEUED" }, { status: 202 });
  } catch (error) {
    if (queuedTrackId) {
      await query("UPDATE radio_tracks SET status = 'FAILED', processing_error = $1, updated_at = now() WHERE id = $2 AND status = 'QUEUED'", [error instanceof Error ? `Upload completed but queueing failed: ${error.message}`.slice(0, 1000) : "Upload completed but queueing failed.", queuedTrackId]).catch(console.error);
    }
    return jsonError(error);
  }
}
