import { NextResponse } from "next/server";
import { deviceActivationRequestSchema } from "@/packages/contracts/src/device";
import { approveDeviceUser } from "@/lib/device-auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimitByKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-v1-device-activate", user.id, 20, 60);
    const input = deviceActivationRequestSchema.parse(await parseJson(request));
    const device = await approveDeviceUser(user, input.userCode);
    return NextResponse.json({ ok: true, device }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
