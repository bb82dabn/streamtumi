import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/device-auth";
import { env } from "@/lib/env";
import { listGenres } from "@/lib/genres";
import { loadGuideCatalog } from "@/lib/guide";
import { jsonError } from "@/lib/http";
import { buildRokuCatalogV2 } from "@/lib/roku-catalog-v2";
import { rokuCatalogQuerySchema } from "@/lib/roku-catalog";
import { recentTuneStationIds } from "@/lib/tune-history";
import { listDeviceRooms } from "@/lib/station-rooms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const device = await requireDeviceAuth(request, "catalog:read");
    const { user } = device;
    const url = new URL(request.url);
    const options = rokuCatalogQuerySchema.parse({
      includeExplicit: url.searchParams.get("includeExplicit") ?? undefined,
      adultAttested: url.searchParams.get("adultAttested") ?? undefined,
    });
    const includeExplicit = options.includeExplicit
      && options.adultAttested
      && user.showExplicitContent === true
      && Boolean(user.explicitAgeAttestedAt);
    const [stations, genres, recentStationIds, privateRooms] = await Promise.all([
      loadGuideCatalog(user.id, includeExplicit),
      listGenres(true),
      recentTuneStationIds(user.id),
      listDeviceRooms(user.id, includeExplicit),
    ]);
    return NextResponse.json({
      ...buildRokuCatalogV2(stations, genres, new URL(env().APP_URL).origin, includeExplicit),
      recentStationIds,
      privateRooms,
      account: { displayName: user.displayName, email: user.email },
      scopes: device.scopes,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
