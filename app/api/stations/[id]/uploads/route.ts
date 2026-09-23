import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";
import { requireApiUser, assertStationOwnerKind } from "@/lib/auth";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { assertSameOrigin, jsonError, HttpError } from "@/lib/http";
import { bucket, ensureBucket, storage } from "@/lib/storage";
import { getTranscodeQueue } from "@/lib/queue";
import { detectedVideoMimes, validateUpload } from "@/lib/validation";
import { assertReplacementTarget, reserveVideoUpload, safeUploadFilename } from "@/lib/upload-reservation";

type Context = { params: Promise<{ id: string }> };

async function inspectAndStream(body: ReadableStream<Uint8Array>, expectedBytes: number): Promise<{ firstBytes: Buffer; stream: Readable }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let readBytes = 0;
  while (readBytes < 8192) {
    const result = await reader.read();
    if (result.done) break;
    readBytes += result.value.byteLength;
    if (readBytes > expectedBytes) throw new HttpError(400, "The upload body exceeds its declared size.", "UPLOAD_SIZE_MISMATCH");
    chunks.push(result.value);
  }
  const firstBytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const stream = Readable.from(
    (async function* () {
      yield firstBytes;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        readBytes += result.value.byteLength;
        if (readBytes > expectedBytes) throw new HttpError(400, "The upload body exceeds its declared size.", "UPLOAD_SIZE_MISMATCH");
        yield Buffer.from(result.value);
      }
      if (readBytes !== expectedBytes) throw new HttpError(400, "The upload body does not match its declared size.", "UPLOAD_SIZE_MISMATCH");
    })(),
  );
  return { firstBytes, stream };
}

export async function POST(request: Request, context: Context) {
  let videoId: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id: stationId } = await context.params;
    await assertStationOwnerKind(stationId, user.id, "TV");
    const url = new URL(request.url);
    const filename = safeUploadFilename(decodeURIComponent(url.searchParams.get("filename") ?? ""));
    const replacementForId = url.searchParams.get("replacementForId");
    const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    const size = Number(request.headers.get("content-length"));
    const validationError = validateUpload(filename, mimeType, size, env().MAX_UPLOAD_BYTES);
    if (validationError) throw new HttpError(400, validationError, "INVALID_UPLOAD");
    await assertReplacementTarget(stationId, replacementForId);
    if (!request.body) throw new HttpError(400, "The upload body is empty.", "EMPTY_UPLOAD");
    const inspected = await inspectAndStream(request.body, size);
    const detected = await fileTypeFromBuffer(inspected.firstBytes);
    if (!detected || (!detectedVideoMimes.has(detected.mime) && !detected.mime.startsWith("video/"))) {
      throw new HttpError(415, "The uploaded bytes are not a supported video file.", "INVALID_FILE_SIGNATURE");
    }
    const reservation = await reserveVideoUpload({
      userId: user.id,
      stationId,
      filename,
      mimeType: detected.mime,
      size,
      replacementForId,
      sourceKey: (reservedVideoId) => `stations/${stationId}/sources/${reservedVideoId}/${filename}`,
    });
    videoId = reservation.videoId;
    await ensureBucket();
    await storage.putObject(bucket, reservation.sourceKey, inspected.stream, size, { "Content-Type": detected.mime });
    await query("UPDATE videos SET status = 'QUEUED', processing_progress = 1, updated_at = now() WHERE id = $1", [videoId]);
    await getTranscodeQueue().add("transcode-video", { videoId }, { jobId: `video-${videoId}` });
    return NextResponse.json({ videoId, status: "QUEUED" }, { status: 202 });
  } catch (error) {
    if (videoId) {
      await query("UPDATE videos SET status = 'FAILED', processing_error = $1, updated_at = now() WHERE id = $2", [
        error instanceof Error ? error.message.slice(0, 1000) : "Upload failed",
        videoId,
      ]).catch(console.error);
    }
    return jsonError(error);
  }
}
