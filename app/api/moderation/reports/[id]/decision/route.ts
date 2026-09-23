import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { decideReport, moderationActor } from "@/lib/moderation";
import { moderationDecisionSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await moderationActor(request, "reports:decide");
    if (actor.type === "HUMAN") assertSameOrigin(request);
    const data = moderationDecisionSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json({ report: await decideReport(id, actor, data) });
  } catch (error) {
    return jsonError(error);
  }
}
