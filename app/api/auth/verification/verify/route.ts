import { NextResponse } from "next/server";
import { consumeEmailVerificationToken, emailVerificationRequestSchema } from "@/lib/email-verification";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "email-verification-consume-ip", 20, 900);
    const input = emailVerificationRequestSchema.parse(await parseJson(request));
    if (!(await consumeEmailVerificationToken(input.token))) {
      throw new HttpError(400, "This verification link is invalid or expired.", "EMAIL_VERIFICATION_INVALID");
    }
    return NextResponse.json(
      { ok: true, verified: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
