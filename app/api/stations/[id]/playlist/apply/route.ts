import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertStationOwnerKind } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { publishEditableSchedule, publishScheduleRefresh } from "@/lib/schedule-publication";
import { assertSameOrigin, jsonError, parseJson, HttpError } from "@/lib/http";

const schema = z.object({ timing: z.enum(["immediate", "next-loop"]) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertStationOwnerKind(id, user.id, "TV");
    const data = schema.parse(await parseJson(request));
    const outcome = await transaction((client) => publishEditableSchedule(client, id, data.timing));
    if (outcome.activeChanged) await publishScheduleRefresh(id);
    return NextResponse.json({ scheduleId: outcome.scheduleId, activationAt: outcome.activationAt, timing: outcome.timing });
  } catch (error) {
    if (error instanceof Error && error.message.includes("requires at least one")) {
      return jsonError(new HttpError(409, "Add at least one fully processed video before applying the playlist.", "EMPTY_READY_PLAYLIST"));
    }
    return jsonError(error);
  }
}
