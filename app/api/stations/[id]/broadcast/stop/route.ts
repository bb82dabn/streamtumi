import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { stopStation } from "@/lib/station-lifecycle";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await stopStation(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
