import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { listOwnerMediaAssets, mediaAssetListQuerySchema } from "@/lib/media-assets";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(request.url);
    const input = mediaAssetListQuerySchema.parse({
      q: url.searchParams.get("q") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const assets = await listOwnerMediaAssets(user.id, input);
    return NextResponse.json({ assets }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
