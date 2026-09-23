import { NextResponse } from "next/server";
import { assertVideoOwner, requireApiUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { getTranscodeQueue } from "@/lib/queue";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import {
  chunkManifest,
  isChunkSourcePrefix,
  type StoredChunk,
  validateChunkInventory,
} from "@/lib/upload-chunks";

type Context = { params: Promise<{ id: string }> };
type UploadRow = { status: string; source_key: string; size_bytes: string };

function activeChunkUpload(row: UploadRow | undefined): UploadRow {
  if (!row) throw new HttpError(404, "Video not found.", "NOT_FOUND");
  if (row.status !== "UPLOADING") throw new HttpError(409, "This upload cannot be completed from its current state.", "UPLOAD_NOT_ACTIVE");
  if (!isChunkSourcePrefix(row.source_key)) throw new HttpError(409, "This video does not use chunked upload storage.", "NOT_CHUNKED_UPLOAD");
  return row;
}

function listStoredChunks(prefix: string): Promise<StoredChunk[]> {
  return new Promise((resolve, reject) => {
    const chunks: StoredChunk[] = [];
    const stream = storage.listObjectsV2(bucket, prefix, true);
    stream.on("data", (item) => {
      if (item.name) chunks.push({ name: item.name, size: item.size });
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(chunks));
  });
}

async function mapConcurrent<T, Result>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(items[index]);
      }
    }),
  );
  return results;
}

function requireCompleteInventory(prefix: string, totalSize: number, chunks: StoredChunk[]): void {
  const validation = validateChunkInventory(prefix, totalSize, chunks);
  if (!validation.ok) {
    throw new HttpError(409, "The upload is incomplete or contains a chunk with the wrong size. Upload the missing chunk and try again.", "INCOMPLETE_UPLOAD");
  }
}

export async function POST(request: Request, context: Context) {
  let queuedVideoId: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertVideoOwner(id, user.id);
    await ensureBucket();
    await transaction(async (client) => {
      const locked = await client.query<UploadRow>(
        "SELECT status, source_key, size_bytes::text FROM videos WHERE id = $1 FOR UPDATE",
        [id],
      );
      const upload = activeChunkUpload(locked.rows[0]);
      const totalSize = Number(upload.size_bytes);
      const listed = await listStoredChunks(upload.source_key);
      requireCompleteInventory(upload.source_key, totalSize, listed);
      const manifest = chunkManifest(upload.source_key, totalSize);
      let stated: StoredChunk[];
      try {
        stated = await mapConcurrent(manifest, 12, async (chunk) => ({
          name: chunk.name,
          size: (await storage.statObject(bucket, chunk.name)).size,
        }));
      } catch {
        throw new HttpError(409, "A required chunk disappeared before completion. Upload it again and retry.", "INCOMPLETE_UPLOAD");
      }
      requireCompleteInventory(upload.source_key, totalSize, stated);
      const updated = await client.query(
        "UPDATE videos SET status = 'QUEUED', processing_progress = 1, processing_error = NULL, updated_at = now() WHERE id = $1 AND status = 'UPLOADING'",
        [id],
      );
      if (!updated.rowCount) throw new HttpError(409, "This upload was already completed or failed.", "UPLOAD_NOT_ACTIVE");
    });
    queuedVideoId = id;
    await getTranscodeQueue().add("transcode-video", { videoId: id }, { jobId: `video-${id}` });
    return NextResponse.json({ videoId: id, status: "QUEUED" }, { status: 202 });
  } catch (error) {
    if (queuedVideoId) {
      await query(
        "UPDATE videos SET status = 'FAILED', processing_error = $1, updated_at = now() WHERE id = $2 AND status = 'QUEUED'",
        [error instanceof Error ? `Upload completed but queueing failed: ${error.message}`.slice(0, 1000) : "Upload completed but queueing failed.", queuedVideoId],
      ).catch(console.error);
    }
    return jsonError(error);
  }
}
