import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { changeMobilePassword } from "@/lib/mobile-account";
import { rateLimitByKey } from "@/lib/rate-limit";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-password-change", user.id, 5, 900);
    const input = passwordChangeSchema.parse(await parseJson(request));
    return NextResponse.json(
      await changeMobilePassword(user.id, input.currentPassword, input.newPassword),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
