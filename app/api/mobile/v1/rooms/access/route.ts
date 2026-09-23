import { NextResponse } from "next/server";
import { roomAccessRequestSchema } from "@/packages/contracts/src/rooms";
import { hashToken } from "@/lib/crypto";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { optionalMobileAuth } from "@/lib/mobile-auth";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";
import { exchangeMobileStationRoomKey } from "@/lib/station-rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "mobile-v1-room-access", 12, 900);
    await rateLimitByKey("mobile-v1-room-access-global", "all", 120, 60);
    const clientId = request.headers.get("x-streamtumi-client");
    if (clientId && /^[A-Za-z0-9._:-]{1,128}$/.test(clientId)) {
      await rateLimitByKey("mobile-v1-room-access-client", hashToken(clientId), 12, 900);
    }
    const input = roomAccessRequestSchema.parse(await parseJson(request));
    const identity = await optionalMobileAuth(request);
    return NextResponse.json(await exchangeMobileStationRoomKey(input.accessKey, identity?.user.id ?? null), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
