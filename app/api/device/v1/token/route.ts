import { NextResponse } from "next/server";
import { pollDeviceAuthorization } from "@/lib/device-auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "device-v1-token-poll", 120, 60);
    const input = await parseJson(request);
    const deviceCode = typeof input === "object" && input !== null && "deviceCode" in input
      ? (input as { deviceCode?: unknown }).deviceCode
      : undefined;
    const result = await pollDeviceAuthorization(typeof deviceCode === "string" ? deviceCode : "");
    if (result.status === "authorized") {
      return NextResponse.json({
        deviceToken: result.deviceToken,
        tokenType: "Device",
        expiresAt: result.expiresAt,
        scopes: result.scopes,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      error: result.status,
      ...(result.status === "authorization_pending" || result.status === "slow_down"
        ? { interval: result.interval }
        : {}),
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
