import { NextResponse } from "next/server";
import { chatActor, messageForStation, presentMessage } from "@/lib/chat";
import { publishStationEvent } from "@/lib/chat-events";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { chatHideSchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string; messageId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { token, messageId } = await context.params;
    const station = await resolvePublicStation(token);
    const actor = await chatActor(station);
    if (actor.kind !== "HOST") throw new HttpError(403, "Only the station host can hide messages.", "FORBIDDEN");
    await messageForStation(station.id, messageId);
    const data = chatHideSchema.parse(await parseJson(request));
    await query(
      `UPDATE chat_messages
          SET hidden_at = now(), hidden_by_user_id = $3, hidden_reason = $4, pinned_at = NULL, pinned_by_user_id = NULL
        WHERE id = $1 AND station_id = $2`,
      [messageId, station.id, actor.id, data.reason ?? "Hidden by host"],
    );
    const message = presentMessage(await messageForStation(station.id, messageId));
    await publishStationEvent(station.id, { type: "message.updated", data: message });
    return NextResponse.json({ message });
  } catch (error) {
    return jsonError(error);
  }
}
