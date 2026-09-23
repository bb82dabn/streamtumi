import { NextResponse } from "next/server";
import { deviceActivationRequestSchema } from "@/packages/contracts/src/device";
import { requireApiUser } from "@/lib/auth";
import { approveDeviceUser } from "@/lib/device-auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimitByKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = request.headers.get("authorization") === null
      ? { user: await requireApiUser() }
      : await requireMobileAuth(request);
    await rateLimitByKey("device-v1-activate", identity.user.id, 20, 60);
    const input = deviceActivationRequestSchema.parse(await parseJson(request));
    const device = await approveDeviceUser(identity.user, input.userCode);
    return NextResponse.json({ ok: true, device }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
