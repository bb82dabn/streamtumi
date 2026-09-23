import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { clearStationRating, rateStation, stationEngagement } from "@/lib/guide";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";
import { stationRatingSchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    if (user.emailVerified !== true) {
      throw new HttpError(403, "Verify your email before joining station communities.", "EMAIL_VERIFICATION_REQUIRED");
    }
    await rateLimitByKey("station-rating", user.id, 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token);
    const data = stationRatingSchema.parse(await parseJson(request));
    await rateStation(station, user, data.rating);
    return NextResponse.json(await stationEngagement(station.id, user.id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    if (user.emailVerified !== true) {
      throw new HttpError(403, "Verify your email before joining station communities.", "EMAIL_VERIFICATION_REQUIRED");
    }
    await rateLimitByKey("station-rating", user.id, 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token);
    await clearStationRating(station, user);
    return NextResponse.json(await stationEngagement(station.id, user.id));
  } catch (error) {
    return jsonError(error);
  }
}
