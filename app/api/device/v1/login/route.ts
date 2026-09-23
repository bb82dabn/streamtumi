import { NextResponse } from "next/server";
import { deviceLoginRequestSchema } from "@/packages/contracts/src/device";
import { hashToken } from "@/lib/crypto";
import { loginDeviceWithPassword } from "@/lib/device-auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "device-v1-login", 20, 900);
    const input = deviceLoginRequestSchema.parse(await parseJson(request));
    await rateLimitByKey("password-login-account", hashToken(`password-login:${input.email}`), 10, 900);
    const result = await loginDeviceWithPassword(input);
    return NextResponse.json({
      deviceToken: result.deviceToken,
      tokenType: "Device",
      expiresAt: result.expiresAt,
      scopes: result.scopes,
      account: result.account,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
