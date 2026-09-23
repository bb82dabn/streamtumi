import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { ownerVariantObject } from "@/lib/media-assets";

type Context = { params: Promise<{ assetId: string; variantId: string; path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const params = await context.params;
    const assetId = z.string().uuid().parse(params.assetId);
    const variantId = z.string().uuid().parse(params.variantId);
    const key = await ownerVariantObject(assetId, variantId, user.id, params.path);
    return objectResponse(key, request, "private, max-age=300");
  } catch (error) {
    return jsonError(error);
  }
}
