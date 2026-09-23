import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { upgradeTvStudioProjectToV2 } from "@/lib/studio";
import { studioProjectUpgradeSchema } from "@/lib/studio-model";

type Context = { params: Promise<{ id: string; projectId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const params = await context.params;
    const id = z.string().uuid().parse(params.id);
    const projectId = z.string().uuid().parse(params.projectId);
    const data = studioProjectUpgradeSchema.parse(await parseJson(request));
    const project = await upgradeTvStudioProjectToV2(id, projectId, user.id, data.expectedDraftVersion, data.idempotencyKey);
    return NextResponse.json({ project }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
