import { NextResponse } from "next/server";
import { z } from "zod";
import { auditAdminPreviewOpen, grantAdminPreview } from "@/lib/admin-preview";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { adminPreviewOpenSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { id: rawId } = await context.params;
    const id = z.string().uuid().parse(rawId);
    const form = await request.formData();
    const { reason } = adminPreviewOpenSchema.parse({ reason: form.get("reason") });
    await auditAdminPreviewOpen(actor, id, reason);
    await grantAdminPreview(actor.id, id);
    const response = NextResponse.redirect(new URL(`/admin/stations/${id}/preview`, env().APP_URL), 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
