import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { publishCalendarRelease } from "@/lib/calendar-publication";
import { calendarPublishSchema } from "@/lib/calendar-validation";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const stationId = z.string().uuid().parse(id);
    const data = calendarPublishSchema.parse(await parseJson(request));
    const release = await publishCalendarRelease(
      stationId,
      user.id,
      data.profileId,
      data.expectedDraftVersion,
      data.idempotencyKey,
    );
    return NextResponse.json(release, {
      status: release.idempotent ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
