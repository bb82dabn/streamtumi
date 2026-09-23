import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/device-auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { leaveDeviceRoom } from "@/lib/station-rooms";

type Context = { params: Promise<{ stationId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { user } = await requireDeviceAuth(request, "rooms:join");
    const { stationId } = await context.params;
    return NextResponse.json({ ok: true, removed: await leaveDeviceRoom(user.id, stationId) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
