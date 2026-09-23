import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { mediaAssetUpdateSchema, ownerMediaAsset, updateOwnerMediaAsset } from "@/lib/media-assets";

type Context = { params: Promise<{ assetId: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { assetId: rawId } = await context.params;
    const asset = await ownerMediaAsset(z.string().uuid().parse(rawId), user.id);
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { assetId: rawId } = await context.params;
    const assetId = z.string().uuid().parse(rawId);
    const input = mediaAssetUpdateSchema.parse(await parseJson(request));
    const asset = await updateOwnerMediaAsset(assetId, user.id, input);
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
