import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { claimReport, moderationActor } from "@/lib/moderation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await moderationActor(request, "reports:decide");
    if (actor.type === "HUMAN") assertSameOrigin(request);
    const { id } = await context.params;
    return NextResponse.json({ report: await claimReport(id, actor) });
  } catch (error) {
    return jsonError(error);
  }
}
