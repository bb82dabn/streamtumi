import { NextResponse } from "next/server";
import { emailVerificationResendMessage, issueAndSendEmailVerification } from "@/lib/email-verification";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "mobile-email-verification-resend-ip", 5, 3_600);
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-email-verification-resend-account", user.id, 3, 3_600);
    const delivery = await issueAndSendEmailVerification(user.id);
    if (delivery === "FAILED") {
      throw new HttpError(503, "Verification email delivery is temporarily unavailable.", "EMAIL_DELIVERY_UNAVAILABLE");
    }
    return NextResponse.json(
      { ok: true, message: emailVerificationResendMessage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
