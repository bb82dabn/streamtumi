import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { parseMobileRefreshToken, rotateMobileRefreshToken } from "@/lib/mobile-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "mobile-auth-refresh", 60, 900);
    const refreshToken = parseMobileRefreshToken(await parseJson(request));
    const credentials = await rotateMobileRefreshToken(refreshToken);
    return NextResponse.json(credentials, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
