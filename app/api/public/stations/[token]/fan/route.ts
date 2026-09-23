import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { becomeFan, stationEngagement, stopBeingFan } from "@/lib/guide";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

async function change(request: Request, context: Context, active: boolean) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    if (user.emailVerified !== true) {
      throw new HttpError(403, "Verify your email before joining station communities.", "EMAIL_VERIFICATION_REQUIRED");
    }
    await rateLimitByKey("station-fan", user.id, 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token);
    if (active) await becomeFan(station, user);
    else await stopBeingFan(station, user);
    return NextResponse.json(await stationEngagement(station.id, user.id));
  } catch (error) {
    return jsonError(error);
  }
}

export function PUT(request: Request, context: Context) { return change(request, context, true); }
export function DELETE(request: Request, context: Context) { return change(request, context, false); }
