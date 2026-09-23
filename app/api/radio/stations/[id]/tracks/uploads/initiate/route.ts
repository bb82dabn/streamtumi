import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { reserveRadioTrackUpload } from "@/lib/radio-tracks";
import { chunkCountForSize, UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload-chunks";
import { safeUploadFilename } from "@/lib/upload-reservation";
import { radioTrackInitiateSchema, validateAudioUpload } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id: stationId } = await context.params;
    const data = radioTrackInitiateSchema.parse(await parseJson(request));
    const filename = safeUploadFilename(data.filename);
    const mimeType = data.mimeType.split(";")[0].toLowerCase();
    const validationError = validateAudioUpload(filename, mimeType, data.size, env().MAX_UPLOAD_BYTES);
    if (validationError) throw new HttpError(400, validationError, "INVALID_UPLOAD");
    const reservation = await reserveRadioTrackUpload({
      userId: user.id,
      stationId,
      uploadRequestId: data.uploadRequestId,
      filename,
      mimeType,
      size: data.size,
    });
    return NextResponse.json({
      trackId: reservation.trackId,
      status: reservation.status,
      chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
      chunkCount: chunkCountForSize(data.size),
    }, { status: reservation.created ? 201 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
