import { NextResponse } from "next/server";
import { becomeFan, stationEngagement, stopBeingFan } from "@/lib/guide";
import { jsonError } from "@/lib/http";
import { requireVerifiedMobileUser } from "@/lib/mobile-community";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

async function change(request: Request, context: Context, active: boolean) {
  try {
    const user = await requireVerifiedMobileUser(request);
    await rateLimitByKey("mobile-v1-station-fan", user.id, 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token, request);
    if (active) await becomeFan(station, user);
    else await stopBeingFan(station, user);
    return NextResponse.json(await stationEngagement(station.id, user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export function PUT(request: Request, context: Context) { return change(request, context, true); }
export function DELETE(request: Request, context: Context) { return change(request, context, false); }
