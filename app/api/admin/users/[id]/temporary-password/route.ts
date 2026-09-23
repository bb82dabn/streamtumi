import { NextResponse } from "next/server";
import { z } from "zod";
import { assignTemporaryPassword } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { adminTemporaryPasswordSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const data = adminTemporaryPasswordSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json(await assignTemporaryPassword(
      z.string().uuid().parse(id),
      data.password,
      data.expectedVersion,
      actor,
    ));
  } catch (error) {
    return jsonError(error);
  }
}
