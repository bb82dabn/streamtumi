import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { initiateOwnerMediaUpload, initiateOwnerMediaUploadSchema } from "@/lib/media-uploads";
import { rateLimitByKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await rateLimitByKey("media-upload-initiate", user.id, 120, 3_600);
    const input = initiateOwnerMediaUploadSchema.parse(await parseJson(request));
    const reservation = await initiateOwnerMediaUpload(user.id, input);
    return NextResponse.json(reservation, { status: reservation.created ? 201 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
