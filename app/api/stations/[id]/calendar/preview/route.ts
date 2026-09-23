import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { previewCalendarDraft } from "@/lib/calendar-publication";
import { calendarPreviewSchema } from "@/lib/calendar-validation";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const stationId = z.string().uuid().parse(id);
    const data = calendarPreviewSchema.parse(await parseJson(request));
    const preview = await previewCalendarDraft(stationId, user.id, data.profileId, { from: data.from, to: data.to });
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
