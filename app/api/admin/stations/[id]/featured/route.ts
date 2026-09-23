import { NextResponse } from "next/server";
import { z } from "zod";
import { setStationFeatured } from "@/lib/admin-stations";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";

const stationFeaturedSchema = z.object({ featured: z.boolean() }).strict();

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const data = stationFeaturedSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json(await setStationFeatured(z.string().uuid().parse(id), data.featured, actor));
  } catch (error) {
    return jsonError(error);
  }
}
