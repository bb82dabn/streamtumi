import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { activateCalendarRelease } from "@/lib/calendar-publication";
import { calendarActivationSchema } from "@/lib/calendar-validation";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";

type Context = { params: Promise<{ id: string; releaseId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const params = await context.params;
    const stationId = z.string().uuid().parse(params.id);
    const releaseId = z.string().uuid().parse(params.releaseId);
    const data = calendarActivationSchema.parse(await parseJson(request));
    const activation = await activateCalendarRelease(stationId, user.id, releaseId, data.activation);
    return NextResponse.json(activation, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
