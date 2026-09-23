import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { updateMobileAdultPreference } from "@/lib/mobile-account";
import { rateLimitByKey } from "@/lib/rate-limit";
import { contentPreferenceSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-content-preferences", user.id, 20, 60);
    const input = contentPreferenceSchema.parse(await parseJson(request));
    return NextResponse.json(
      await updateMobileAdultPreference(user.id, input.showExplicitContent),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
