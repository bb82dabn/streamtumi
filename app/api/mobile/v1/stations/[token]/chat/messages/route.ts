import { NextResponse } from "next/server";
import { createMessage, pinnedMessages, recentMessages, registeredChatActor } from "@/lib/chat";
import { publishStationEvent } from "@/lib/chat-events";
import { hashToken } from "@/lib/crypto";
import { jsonError, parseJson } from "@/lib/http";
import { optionalMobileUser, requireVerifiedMobileUser } from "@/lib/mobile-community";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";
import { chatCursorSchema, chatMessageSchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "mobile-v1-chat-read", 180, 60);
    const { token } = await context.params;
    const [station, user] = await Promise.all([resolvePublicStation(token, request), optionalMobileUser(request)]);
    const url = new URL(request.url);
    const beforeAt = url.searchParams.get("beforeAt");
    const beforeId = url.searchParams.get("beforeId");
    const before = beforeAt && beforeId
      ? (() => {
          const value = chatCursorSchema.parse({ beforeAt, beforeId });
          return { at: new Date(value.beforeAt), id: value.beforeId };
        })()
      : undefined;
    const [messages, pinned] = user
      ? await Promise.all([recentMessages(station.id, before, 100, user.id), pinnedMessages(station.id, user.id)])
      : await Promise.all([recentMessages(station.id, before), pinnedMessages(station.id)]);
    const actor = user ? registeredChatActor(station, user) : null;
    return NextResponse.json({
      messages,
      pinned,
      viewer: actor ? { kind: actor.kind, displayName: actor.name, canModerate: actor.kind === "HOST" } : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    await rateLimit(request, "mobile-v1-chat-post", 30, 60);
    const user = await requireVerifiedMobileUser(request);
    await rateLimitByKey("mobile-v1-chat-actor", hashToken(user.id), 10, 10);
    const { token } = await context.params;
    const station = await resolvePublicStation(token, request);
    const data = chatMessageSchema.parse(await parseJson(request));
    const message = await createMessage(station.id, registeredChatActor(station, user), data.body);
    await publishStationEvent(station.id, { type: "message.created", data: message });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
