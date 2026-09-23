import { NextResponse } from "next/server";
import { z } from "zod";
import { blockMessageAuthor, unblockMessageAuthor } from "@/lib/community-safety";
import { jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { requireVerifiedMobileUser } from "@/lib/mobile-community";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimitByKey } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string; messageId: string }> };
const messageIdSchema = z.string().uuid();

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireVerifiedMobileUser(request);
    await rateLimitByKey("mobile-v1-community-block", user.id, 30, 60);
    const { token, messageId: rawMessageId } = await context.params;
    const messageId = messageIdSchema.parse(rawMessageId);
    const station = await resolvePublicStation(token, request);
    const block = await blockMessageAuthor(user, station.id, messageId);
    return NextResponse.json({ ok: true, block }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-v1-community-unblock", user.id, 30, 60);
    const { token, messageId: rawMessageId } = await context.params;
    const messageId = messageIdSchema.parse(rawMessageId);
    const station = await resolvePublicStation(token, request);
    const removed = await unblockMessageAuthor(user.id, station.id, messageId);
    return NextResponse.json({ ok: true, removed }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
