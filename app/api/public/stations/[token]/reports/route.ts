import { NextResponse } from "next/server";
import { chatActor } from "@/lib/chat";
import { createContentReport } from "@/lib/community-safety";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";
import { reportSchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "content-report", 5, 3600);
    const { token } = await context.params;
    const station = await resolvePublicStation(token);
    const data = reportSchema.parse(await parseJson(request));
    const actor = await chatActor(station, false);
    const reference = await createContentReport(station, data, {
      userId: actor && actor.kind !== "GUEST" ? actor.id : undefined,
      guestId: actor?.kind === "GUEST" ? actor.id : undefined,
    });
    return NextResponse.json({ ok: true, reference }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
