import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { publishClockRelease } from "@/lib/clock-publication";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { clockPublishSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const data = clockPublishSchema.parse(await parseJson(request));
    return NextResponse.json(await publishClockRelease(id, user.id, data.expectedDraftVersion), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
