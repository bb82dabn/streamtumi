import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { revokeServiceToken } from "@/lib/moderation";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    await revokeServiceToken(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
