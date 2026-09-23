import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/device-auth";
import { jsonError } from "@/lib/http";
import { playbackForDeviceRoom } from "@/lib/station-rooms";

type Context = { params: Promise<{ stationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { user } = await requireDeviceAuth(request, "catalog:read");
    const { stationId } = await context.params;
    return NextResponse.json(await playbackForDeviceRoom(user.id, stationId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
