import { NextResponse } from "next/server";
import { clearStationRating, rateStation, stationEngagement } from "@/lib/guide";
import { jsonError, parseJson } from "@/lib/http";
import { requireVerifiedMobileUser } from "@/lib/mobile-community";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";
import { stationRatingSchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireVerifiedMobileUser(request);
    await rateLimitByKey("mobile-v1-station-rating", user.id, 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token, request);
    const data = stationRatingSchema.parse(await parseJson(request));
    await rateStation(station, user, data.rating);
    return NextResponse.json(await stationEngagement(station.id, user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireVerifiedMobileUser(request);
    await rateLimitByKey("mobile-v1-station-rating", user.id, 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token, request);
    await clearStationRating(station, user);
    return NextResponse.json(await stationEngagement(station.id, user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
