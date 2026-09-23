import { NextResponse } from "next/server";
import { chatActor, createMessage, pinnedMessages, recentMessages } from "@/lib/chat";
import { publishStationEvent } from "@/lib/chat-events";
import { hashToken } from "@/lib/crypto";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";
import { chatCursorSchema, chatMessageSchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "chat-read", 180, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token, request);
    const actor = await chatActor(station, false);
    const url = new URL(request.url);
    const beforeAt = url.searchParams.get("beforeAt");
    const beforeId = url.searchParams.get("beforeId");
    const before = beforeAt && beforeId ? (() => { const value = chatCursorSchema.parse({ beforeAt, beforeId }); return { at: new Date(value.beforeAt), id: value.beforeId }; })() : undefined;
    const viewerUserId = actor && actor.kind !== "GUEST" ? actor.id : undefined;
    const [messages, pinned] = viewerUserId
      ? await Promise.all([recentMessages(station.id, before, 100, viewerUserId), pinnedMessages(station.id, viewerUserId)])
      : await Promise.all([recentMessages(station.id, before), pinnedMessages(station.id)]);
    return NextResponse.json({
      messages,
      pinned,
      viewer: actor ? { kind: actor.kind, displayName: actor.name, canModerate: actor.kind === "HOST" } : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "chat-post", 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token);
    const actor = await chatActor(station);
    await rateLimitByKey("chat-actor", hashToken(`${actor.kind}:${actor.id}`), 10, 10);
    const data = chatMessageSchema.parse(await parseJson(request));
    const message = await createMessage(station.id, actor, data.body);
    await publishStationEvent(station.id, { type: "message.created", data: message });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
