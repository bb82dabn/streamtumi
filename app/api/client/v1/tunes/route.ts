import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";
import { assertCanRecordTune, mobileTuneSchema, recordTune } from "@/lib/tune-history";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await rateLimitByKey("client-v1-tunes", user.id, 30, 60);
    const data = mobileTuneSchema.parse(await parseJson(request));
    const station = await resolvePublicStation(data.stationToken);
    if (user.emailVerified !== true && station.playback_type !== "WEATHERSTAR_4000") {
      throw new HttpError(403, "Verify your email before saving tune history.", "EMAIL_VERIFICATION_REQUIRED");
    }
    assertCanRecordTune(station, user.id);
    const playback = station.playback_type === "WEATHERSTAR_4000"
      ? await import("@/lib/weather-playback").then(({ issueWeatherPlayback }) => issueWeatherPlayback(user.id, station, data.stationToken, data.id))
      : undefined;
    if (user.emailVerified !== true && playback) {
      return NextResponse.json({
        tune: { id: data.id, stationId: station.id, client: "WEB", tunedAt: new Date().toISOString() },
        playback,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    const tune = await recordTune(data.id, user.id, station.id, "WEB");
    return NextResponse.json(
      { tune: { id: tune.id, stationId: tune.stationId, client: tune.client, tunedAt: tune.tunedAt }, ...(playback ? { playback } : {}) },
      { status: tune.created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
