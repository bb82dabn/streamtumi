import { NextResponse } from "next/server";
import { hashToken } from "@/lib/crypto";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import {
  passwordResetRequestMessage,
  passwordResetRequestSchema,
  requestPasswordResetByEmail,
} from "@/lib/password-reset";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "mobile-password-reset-request-ip", 5, 3_600);
    const input = passwordResetRequestSchema.parse(await parseJson(request));
    await rateLimitByKey("mobile-password-reset-request-account", hashToken(`password:${input.email}`), 3, 3_600);
    await requestPasswordResetByEmail(input.email);
    return NextResponse.json(
      { ok: true, message: passwordResetRequestMessage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
