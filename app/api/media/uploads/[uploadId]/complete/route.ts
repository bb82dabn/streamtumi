import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { completeOwnerMediaUpload } from "@/lib/media-uploads";

type Context = { params: Promise<{ uploadId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { uploadId } = await context.params;
    return NextResponse.json(await completeOwnerMediaUpload(user.id, uploadId), { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
