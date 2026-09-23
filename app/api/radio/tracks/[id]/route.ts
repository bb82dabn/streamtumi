import { NextResponse } from "next/server";
import { assertRadioTrackOwner, requireApiUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { radioTrackUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertRadioTrackOwner(id, user.id);
    const data = radioTrackUpdateSchema.parse(await parseJson(request));
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(data)) {
      values.push(value);
      fields.push(`${key} = $${values.length}`);
    }
    values.push(id);
    const updated = await transaction(async (client) => {
      const locked = await client.query<{ station_id: string }>(
        `SELECT t.station_id FROM radio_tracks t JOIN stations s ON s.id = t.station_id
          WHERE t.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL FOR UPDATE OF s, t`,
        [id, user.id],
      );
      if (!locked.rows[0]) return { rowCount: 0 };
      const changed = await client.query(`UPDATE radio_tracks SET ${fields.join(", ")}, metadata_edited_at = now(), updated_at = now() WHERE id = $${values.length} AND status <> 'ARCHIVED'`, values);
      if (changed.rowCount) {
        await client.query(
          `UPDATE stations SET clock_draft_version = clock_draft_version + 1, updated_at = now()
            WHERE id = $1 AND EXISTS (
              SELECT 1 FROM radio_rotation_items i JOIN radio_rotations r ON r.id = i.rotation_id
               WHERE i.track_id = $2 AND r.station_id = $1
            )`,
          [locked.rows[0].station_id, id],
        );
      }
      return changed;
    });
    if (!updated.rowCount) throw new HttpError(404, "Track not found.", "NOT_FOUND");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertRadioTrackOwner(id, user.id);
    const updated = await transaction(async (client) => {
      const locked = await client.query<{ station_id: string }>(
        `SELECT t.station_id FROM radio_tracks t JOIN stations s ON s.id = t.station_id
          WHERE t.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL FOR UPDATE OF s, t`,
        [id, user.id],
      );
      if (!locked.rows[0]) return { rowCount: 0 };
      const inRotation = await client.query("SELECT 1 FROM radio_rotation_items WHERE track_id = $1 LIMIT 1", [id]);
      if (inRotation.rowCount) throw new HttpError(409, "Remove this track from every rotation before archiving it.", "TRACK_IN_ROTATION");
      return client.query("UPDATE radio_tracks SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND status NOT IN ('PROCESSING', 'ARCHIVED')", [id]);
    });
    if (!updated.rowCount) throw new HttpError(409, "A processing track cannot be archived.", "TRACK_BUSY");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
