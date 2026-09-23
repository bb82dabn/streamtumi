import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { studioKindForStation, studioProject, updateStudioProject } from "@/lib/studio";
import { studioProjectUpdateSchema } from "@/lib/studio-model";

type Context = { params: Promise<{ id: string; projectId: string }> };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id, projectId } = await context.params;
    const project = await studioProject(id, projectId, user.id, await studioKindForStation(id, user.id));
    return NextResponse.json({ project }, { headers: noStore });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id, projectId } = await context.params;
    const data = studioProjectUpdateSchema.parse(await parseJson(request));
    const project = await updateStudioProject(id, projectId, user.id, await studioKindForStation(id, user.id), data);
    return NextResponse.json({ project }, { headers: noStore });
  } catch (error) {
    return jsonError(error);
  }
}
