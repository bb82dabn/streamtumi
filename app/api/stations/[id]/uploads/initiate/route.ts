import { NextResponse } from "next/server";
import { assertStationOwnerKind, requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { chunkCountForSize, chunkSourcePrefix, UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload-chunks";
import { assertReplacementTarget, reserveVideoUpload, safeUploadFilename } from "@/lib/upload-reservation";
import { initiateUploadSchema, validateUpload } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id: stationId } = await context.params;
    await assertStationOwnerKind(stationId, user.id, "TV");
    const data = initiateUploadSchema.parse(await parseJson(request));
    const filename = safeUploadFilename(data.filename);
    const mimeType = data.mimeType.split(";")[0].toLowerCase();
    const validationError = validateUpload(filename, mimeType, data.size, env().MAX_UPLOAD_BYTES);
    if (validationError) throw new HttpError(400, validationError, "INVALID_UPLOAD");
    await assertReplacementTarget(stationId, data.replacementForId);
    const reservation = await reserveVideoUpload({
      userId: user.id,
      stationId,
      filename,
      mimeType,
      size: data.size,
      replacementForId: data.replacementForId,
      sourceKey: (videoId) => chunkSourcePrefix(stationId, videoId),
    });
    return NextResponse.json(
      {
        videoId: reservation.videoId,
        chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
        chunkCount: chunkCountForSize(data.size),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
