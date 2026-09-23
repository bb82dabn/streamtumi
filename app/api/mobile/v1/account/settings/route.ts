import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileAccountSettings } from "@/lib/mobile-account";
import { rateLimitByKey } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-account-settings", user.id, 60, 60);
    return NextResponse.json(
      { account: await mobileAccountSettings(user.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
