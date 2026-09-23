import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { mobileUser, requireMobileAuth } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileAuth(request);
    return NextResponse.json(
      { user: mobileUser(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
