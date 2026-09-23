import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { productOrigin } from "@/lib/product-host";
import { stationByToken } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "mobile-v1-station-resolve", 120, 60);
    const { token } = await context.params;
    const station = await stationByToken(token, false);
    const origin = productOrigin("MAIN");
    const stationUrl = new URL(`/api/public/stations/${encodeURIComponent(token)}`, `${origin}/`).toString();
    return NextResponse.json({
      apiVersion: 1,
      stationUrl,
      stationKind: station.station_kind,
      playbackKind: station.playback_type === "WEATHERSTAR_4000"
        ? "PERSONALIZED_WEATHER"
        : station.station_kind === "RADIO" ? "CONTINUOUS_RADIO" : "SCHEDULED_TV",
      name: station.name,
      description: station.description,
      timeZone: station.time_zone,
      explicit: station.effective_explicit,
      requiresPassword: Boolean(station.access_password_hash),
      requiresAccessKey: Boolean(station.room_access_generation),
      broadcastState: station.broadcast_state,
      hasLogo: Boolean(station.logo_key),
      hasOfflineSlate: Boolean(station.offline_slate_key),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
