import { NextResponse } from "next/server";
import { listGenres } from "@/lib/genres";
import { loadGuideCatalog } from "@/lib/guide";
import { jsonError } from "@/lib/http";
import { optionalMobileAuth } from "@/lib/mobile-auth";
import { buildMobileCatalogV1, mobileExplicitContentAllowed } from "@/lib/mobile-catalog";
import { rateLimit } from "@/lib/rate-limit";
import { recentTuneStationIds } from "@/lib/tune-history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await rateLimit(request, "mobile-v1-catalog", 60, 60);
    const identity = await optionalMobileAuth(request);
    const includeExplicit = mobileExplicitContentAllowed(identity?.user);
    const [stations, genres, recentStationIds] = await Promise.all([
      loadGuideCatalog(identity?.user.id, includeExplicit),
      listGenres(true),
      identity ? recentTuneStationIds(identity.user.id) : Promise.resolve([]),
    ]);
    return NextResponse.json(buildMobileCatalogV1(stations, genres, includeExplicit, undefined, recentStationIds), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
