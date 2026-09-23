import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { createMediaClip, createMediaClipSchema } from "@/lib/media-clips";

type Context = { params: Promise<{ assetId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { assetId: rawId } = await context.params;
    const assetId = z.string().uuid().parse(rawId);
    const input = createMediaClipSchema.parse(await parseJson(request));
    const result = await createMediaClip(user.id, assetId, input);
    return NextResponse.json(result, { status: result.created ? 202 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
