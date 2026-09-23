import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertStationOwnerKind } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { assertSameOrigin, jsonError, parseJson, HttpError } from "@/lib/http";
import { lockPublicationStation, publishAfterScheduleMutation, publishScheduleRefresh } from "@/lib/schedule-publication";

const schema = z.object({ itemIds: z.array(z.string().uuid()).min(1).max(1000) });
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertStationOwnerKind(id, user.id, "TV");
    const { itemIds } = schema.parse(await parseJson(request));
    if (new Set(itemIds).size !== itemIds.length) throw new HttpError(400, "Playlist items cannot be duplicated.", "DUPLICATE_ITEMS");
    const refresh = await transaction(async (client) => {
      const locked = await lockPublicationStation(client, id);
      const current = await client.query<{ id: string }>("SELECT id FROM playlist_items WHERE station_id = $1 ORDER BY position FOR UPDATE", [id]);
      const actual = new Set(current.rows.map((row) => row.id));
      if (actual.size !== itemIds.length || itemIds.some((itemId) => !actual.has(itemId))) {
        throw new HttpError(409, "The playlist changed. Refresh and try again.", "PLAYLIST_CONFLICT");
      }
      if (current.rows.every((item, index) => item.id === itemIds[index])) return locked.promoted;
      await client.query("UPDATE playlist_items SET position = position + 1000000 WHERE station_id = $1", [id]);
      for (const [position, itemId] of itemIds.entries()) {
        await client.query("UPDATE playlist_items SET position = $1 WHERE id = $2 AND station_id = $3", [position, itemId, id]);
      }
      await client.query("UPDATE stations SET playlist_version = playlist_version + 1, updated_at = now() WHERE id = $1", [id]);
      const publication = await publishAfterScheduleMutation(client, id);
      return locked.promoted || publication.activeChanged;
    });
    if (refresh) await publishScheduleRefresh(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
