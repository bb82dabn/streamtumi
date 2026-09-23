import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { parseOwnerMediaPartNumber, writeOwnerMediaPart } from "@/lib/media-uploads";

type Context = { params: Promise<{ uploadId: string; partNumber: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { uploadId, partNumber: partNumberValue } = await context.params;
    const receipt = await writeOwnerMediaPart(user.id, uploadId, parseOwnerMediaPartNumber(partNumberValue), request);
    return NextResponse.json(receipt);
  } catch (error) {
    return jsonError(error);
  }
}
