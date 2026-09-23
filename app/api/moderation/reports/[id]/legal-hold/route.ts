import { NextResponse } from "next/server";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { moderationActor, setLegalHold } from "@/lib/moderation";
import { legalHoldSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await moderationActor(request, "reports:decide");
    if (actor.type !== "HUMAN") throw new HttpError(403, "Only a human moderator can change legal holds.", "FORBIDDEN");
    const data = legalHoldSchema.parse(await parseJson(request));
    const { id } = await context.params;
    await setLegalHold(id, actor, data.active, data.note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
