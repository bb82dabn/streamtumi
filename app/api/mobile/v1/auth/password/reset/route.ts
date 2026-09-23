import { NextResponse } from "next/server";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { passwordResetSchema, resetPasswordWithToken } from "@/lib/password-reset";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "mobile-password-reset-consume-ip", 10, 900);
    const input = passwordResetSchema.parse(await parseJson(request));
    if (!(await resetPasswordWithToken(input.token, input.newPassword))) {
      throw new HttpError(400, "This password reset link is invalid or expired.", "PASSWORD_RESET_INVALID");
    }
    return NextResponse.json(
      { ok: true, loginRequired: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
