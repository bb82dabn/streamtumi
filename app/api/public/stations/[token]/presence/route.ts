import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { heartbeatPresence } from "@/lib/presence";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "presence", 240, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token);
    const viewerCount = await heartbeatPresence(station.id);
    return NextResponse.json({ viewerCount });
  } catch (error) {
    return jsonError(error);
  }
}
