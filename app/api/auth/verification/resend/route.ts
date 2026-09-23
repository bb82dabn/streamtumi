import { NextResponse } from "next/server";
import { hashToken } from "@/lib/crypto";
import { emailDeliveryConfigured } from "@/lib/email-delivery";
import {
  emailVerificationResendMessage,
  emailVerificationResendRequestSchema,
  requestEmailVerificationByEmail,
} from "@/lib/email-verification";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "email-verification-resend-ip", 5, 3_600);
    const input = emailVerificationResendRequestSchema.parse(await parseJson(request));
    await rateLimitByKey("email-verification-resend-account", hashToken(`email:${input.email}`), 3, 3_600);
    if (process.env.NODE_ENV === "production" && !emailDeliveryConfigured()) {
      throw new HttpError(503, "Verification email delivery is temporarily unavailable.", "EMAIL_DELIVERY_UNAVAILABLE");
    }
    await requestEmailVerificationByEmail(input.email);
    return NextResponse.json(
      { ok: true, message: emailVerificationResendMessage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
