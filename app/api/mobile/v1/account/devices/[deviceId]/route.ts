import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeLinkedDevice } from "@/lib/device-auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimitByKey } from "@/lib/rate-limit";

type Context = { params: Promise<{ deviceId: string }> };
const deviceIdSchema = z.string().uuid();

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-v1-linked-device-revoke", user.id, 30, 60);
    const { deviceId: rawDeviceId } = await context.params;
    const revoked = await revokeLinkedDevice(user.id, deviceIdSchema.parse(rawDeviceId));
    return NextResponse.json({ ok: true, revoked }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
