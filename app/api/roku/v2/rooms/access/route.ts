import { NextResponse } from "next/server";
import { roomAccessRequestSchema } from "@/packages/contracts/src/rooms";
import { optionalDeviceAuth } from "@/lib/device-auth";
import { hashToken } from "@/lib/crypto";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";
import { exchangeStationRoomKey } from "@/lib/station-rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "roku-v2-room-access", 12, 900);
    await rateLimitByKey("roku-v2-room-access-global", "all", 120, 60);
    const clientId = request.headers.get("x-streamtumi-client");
    if (clientId && /^[A-Za-z0-9._:-]{1,128}$/.test(clientId)) {
      await rateLimitByKey("roku-v2-room-access-client", hashToken(clientId), 12, 900);
    }
    const input = roomAccessRequestSchema.parse(await parseJson(request));
    const device = await optionalDeviceAuth(request);
    return NextResponse.json(await exchangeStationRoomKey(input.accessKey, device), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
