import { NextResponse } from "next/server";
import { z } from "zod";
import { changeUserRole } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { adminRoleUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const data = adminRoleUpdateSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json(await changeUserRole(z.string().uuid().parse(id), data.role, data.expectedVersion, actor));
  } catch (error) {
    return jsonError(error);
  }
}
