import { jsonError, HttpError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string; kind: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-assets", 120, 60);
    const { token, kind } = await context.params;
    const station = await resolvePublicStation(token, request);
    const key = kind === "logo" ? station.logo_key : kind === "slate" ? station.offline_slate_key : null;
    if (!key) throw new HttpError(404, "Station asset not found.", "NOT_FOUND");
    return objectResponse(key, request, "private, max-age=300");
  } catch (error) {
    return jsonError(error);
  }
}
