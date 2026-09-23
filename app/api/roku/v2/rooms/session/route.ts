import { NextResponse } from "next/server";
import { roomSessionRequestSchema } from "@/packages/contracts/src/rooms";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { playbackForRoomSession, revokeRoomSession } from "@/lib/station-rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "roku-v2-room-session", 120, 60);
    const input = roomSessionRequestSchema.parse(await parseJson(request));
    return NextResponse.json(await playbackForRoomSession(input.roomSessionToken), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const input = roomSessionRequestSchema.parse(await parseJson(request));
    await revokeRoomSession(input.roomSessionToken);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
