import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { startStation } from "@/lib/station-lifecycle";
import { stationStartSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const data = stationStartSchema.parse(await parseJson(request));
    await startStation(id, user.id, data.strategy);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
