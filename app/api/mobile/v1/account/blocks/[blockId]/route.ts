import { NextResponse } from "next/server";
import { z } from "zod";
import { unblockById } from "@/lib/community-safety";
import { jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimitByKey } from "@/lib/rate-limit";

type Context = { params: Promise<{ blockId: string }> };
const blockIdSchema = z.string().uuid();

export async function DELETE(request: Request, context: Context) {
  try {
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-v1-community-unblock", user.id, 30, 60);
    const { blockId: rawBlockId } = await context.params;
    const blockId = blockIdSchema.parse(rawBlockId);
    const removed = await unblockById(user.id, blockId);
    return NextResponse.json({ ok: true, removed }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
