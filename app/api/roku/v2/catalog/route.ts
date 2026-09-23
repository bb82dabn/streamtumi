import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { listGenres } from "@/lib/genres";
import { loadPublicGuideCatalog } from "@/lib/guide";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { rokuCatalogQuerySchema } from "@/lib/roku-catalog";
import { buildRokuCatalogV2 } from "@/lib/roku-catalog-v2";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await rateLimit(request, "roku-catalog-v2", 60, 60);
    const url = new URL(request.url);
    const options = rokuCatalogQuerySchema.parse({ includeExplicit: url.searchParams.get("includeExplicit") ?? undefined, adultAttested: url.searchParams.get("adultAttested") ?? undefined });
    const includeExplicit = options.includeExplicit && options.adultAttested;
    const [stations, genres] = await Promise.all([loadPublicGuideCatalog(includeExplicit), listGenres(true)]);
    const origin = new URL(env().APP_URL).origin;
    return NextResponse.json(buildRokuCatalogV2(stations, genres, origin, includeExplicit), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
