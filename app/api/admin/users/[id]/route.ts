import { NextResponse } from "next/server";
import { z } from "zod";
import { requestUserDeletion, updateUserProfile } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { adminUserDeleteSchema, adminUserProfileSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const data = adminUserProfileSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json(await updateUserProfile(z.string().uuid().parse(id), data, actor));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const data = adminUserDeleteSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json(await requestUserDeletion(
      z.string().uuid().parse(id),
      data.confirmation,
      data.expectedVersion,
      actor,
    ));
  } catch (error) {
    return jsonError(error);
  }
}
