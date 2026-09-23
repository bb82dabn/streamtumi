import { NextResponse } from "next/server";
import { z } from "zod";
import { setUserDisabled } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { adminUserStatusSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const data = adminUserStatusSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json(await setUserDisabled(
      z.string().uuid().parse(id),
      data.disabled,
      data.reason,
      data.expectedVersion,
      actor,
    ));
  } catch (error) {
    return jsonError(error);
  }
}
