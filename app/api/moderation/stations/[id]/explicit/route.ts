import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { setStationExplicitEnforcement } from "@/lib/moderation";
import { explicitEnforcementSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireModerator();
    const data = explicitEnforcementSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json(await setStationExplicitEnforcement(z.string().uuid().parse(id), data.enforced, data.note, user));
  } catch (error) {
    return jsonError(error);
  }
}
