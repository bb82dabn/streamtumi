import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { getCalendarDraft, replaceCalendarDraft } from "@/lib/calendar-publication";
import { calendarDraftReplaceSchema } from "@/lib/calendar-validation";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const stationId = z.string().uuid().parse(id);
    const profileId = z.string().uuid().parse(new URL(request.url).searchParams.get("profileId"));
    const draft = await getCalendarDraft(stationId, user.id, profileId);
    return NextResponse.json(draft, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const stationId = z.string().uuid().parse(id);
    const data = calendarDraftReplaceSchema.parse(await parseJson(request));
    return NextResponse.json(await replaceCalendarDraft(stationId, user.id, data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
