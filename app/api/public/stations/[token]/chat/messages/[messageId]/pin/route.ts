import { NextResponse } from "next/server";
import { chatActor, messageForStation, presentMessage } from "@/lib/chat";
import { publishStationEvent } from "@/lib/chat-events";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";

type Context = { params: Promise<{ token: string; messageId: string }> };

async function setPin(request: Request, context: Context, pinned: boolean) {
  try {
    assertSameOrigin(request);
    const { token, messageId } = await context.params;
    const station = await resolvePublicStation(token);
    const actor = await chatActor(station);
    if (actor.kind !== "HOST") throw new HttpError(403, "Only the station host can pin messages.", "FORBIDDEN");
    await messageForStation(station.id, messageId);
    const updated = await query(
      `UPDATE chat_messages SET pinned_at = ${pinned ? "now()" : "NULL"}, pinned_by_user_id = $3
        WHERE id = $1 AND station_id = $2 ${pinned ? "AND hidden_at IS NULL" : ""}`,
      [messageId, station.id, pinned ? actor.id : null],
    );
    if (!updated.rowCount) throw new HttpError(409, "Hidden messages cannot be pinned.", "MESSAGE_HIDDEN");
    const message = presentMessage(await messageForStation(station.id, messageId));
    await publishStationEvent(station.id, { type: "message.updated", data: message });
    return NextResponse.json({ message });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: Context) { return setPin(request, context, true); }
export async function DELETE(request: Request, context: Context) { return setPin(request, context, false); }
