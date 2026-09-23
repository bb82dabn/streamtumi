import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { createStudioProject, studioKindForStation } from "@/lib/studio";
import { studioProjectCreateSchema } from "@/lib/studio-model";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const data = studioProjectCreateSchema.parse(await parseJson(request));
    const project = await createStudioProject(id, user.id, await studioKindForStation(id, user.id), data.name, data.description);
    return NextResponse.json({ project }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
