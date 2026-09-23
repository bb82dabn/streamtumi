import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { publishStudioProject, studioKindForStation } from "@/lib/studio";
import { studioProjectPublishSchema } from "@/lib/studio-model";

type Context = { params: Promise<{ id: string; projectId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id, projectId } = await context.params;
    const data = studioProjectPublishSchema.parse(await parseJson(request));
    const project = await publishStudioProject(id, projectId, user.id, await studioKindForStation(id, user.id), data.expectedDraftVersion, data.idempotencyKey);
    return NextResponse.json({ project }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
