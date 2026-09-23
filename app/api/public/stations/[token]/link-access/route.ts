import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { grantStationRoomLinkAccess } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "public-link-access", 60, 60);
    const { token } = await context.params;
    await grantStationRoomLinkAccess(token);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
