import { NextResponse } from "next/server";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { parseMobileBearerToken, parseMobileRefreshToken, revokeMobileCredentials } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = parseMobileBearerToken(request.headers.get("authorization"));
    if (!token) throw new HttpError(401, "A valid bearer token is required.", "UNAUTHENTICATED");
    const refreshToken = parseMobileRefreshToken(await parseJson(request));
    await revokeMobileCredentials(token, refreshToken);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
