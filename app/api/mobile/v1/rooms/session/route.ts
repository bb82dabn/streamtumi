import { NextResponse } from "next/server";
import { roomSessionRequestSchema } from "@/packages/contracts/src/rooms";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { playbackForRoomSession } from "@/lib/station-rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "mobile-v1-room-session", 60, 60);
    const input = roomSessionRequestSchema.parse(await parseJson(request));
    return NextResponse.json(await playbackForRoomSession(input.roomSessionToken), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
