import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { materializeMediaAsset } from "@/lib/media-projections";

const inputSchema = z.object({ assetId: z.string().uuid() }).strict();
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id: rawId } = await context.params;
    const stationId = z.string().uuid().parse(rawId);
    const input = inputSchema.parse(await parseJson(request));
    const projection = await materializeMediaAsset(stationId, input.assetId, user.id);
    return NextResponse.json({ projection }, { status: projection.created ? 201 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
