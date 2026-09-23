import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { setStudioEnabled, studioKindForStation, studioOverview } from "@/lib/studio";
import { studioSettingsUpdateSchema } from "@/lib/studio-model";

type Context = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const overview = await studioOverview(id, user.id, await studioKindForStation(id, user.id));
    return NextResponse.json(overview, { headers: noStore });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const kind = await studioKindForStation(id, user.id);
    const data = studioSettingsUpdateSchema.parse(await parseJson(request));
    await setStudioEnabled(id, user.id, kind, data.enabled, data.expectedVersion);
    const overview = await studioOverview(id, user.id, kind);
    return NextResponse.json(overview, { headers: noStore });
  } catch (error) {
    return jsonError(error);
  }
}
