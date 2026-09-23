import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";
import { assertCanRecordTune, mobileTuneSchema, recordTune } from "@/lib/tune-history";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-v1-tunes", user.id, 30, 60);
    const data = mobileTuneSchema.parse(await parseJson(request));
    const station = await resolvePublicStation(data.stationToken);
    assertCanRecordTune(station, user.id);
    const playback = station.playback_type === "WEATHERSTAR_4000"
      ? await import("@/lib/weather-playback").then(({ issueWeatherPlayback }) => issueWeatherPlayback(user.id, station, data.stationToken, data.id))
      : undefined;
    const tune = await recordTune(data.id, user.id, station.id, "MOBILE");
    return NextResponse.json(
      { tune: { id: tune.id, stationId: tune.stationId, client: tune.client, tunedAt: tune.tunedAt }, ...(playback ? { playback } : {}) },
      { status: tune.created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
