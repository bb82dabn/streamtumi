import { NextResponse } from "next/server";
import { deviceTuneRequestSchema } from "@/packages/contracts/src/device";
import { requireDeviceAuth } from "@/lib/device-auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";
import { assertCanRecordTune, recordTune } from "@/lib/tune-history";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await requireDeviceAuth(request, "tunes:write");
    await rateLimitByKey("device-v1-tunes", identity.sessionId, 30, 60);
    const input = deviceTuneRequestSchema.parse(await parseJson(request));
    const station = await resolvePublicStation(input.stationToken);
    assertCanRecordTune(station, identity.user.id);
    const playback = station.playback_type === "WEATHERSTAR_4000"
      ? await import("@/lib/weather-playback").then(({ issueWeatherPlayback }) => issueWeatherPlayback(identity.user.id, station, input.stationToken, input.id))
      : undefined;
    const tune = await recordTune(input.id, identity.user.id, station.id, identity.deviceType);
    return NextResponse.json({
      tune: { id: tune.id, stationId: tune.stationId, client: tune.client, tunedAt: tune.tunedAt },
      ...(playback ? { playback } : {}),
    }, {
      status: tune.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
