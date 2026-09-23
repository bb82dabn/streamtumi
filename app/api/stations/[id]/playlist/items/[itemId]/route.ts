import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireApiUser, assertStationOwnerKind } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { lockPublicationStation, publishAfterScheduleMutation, publishScheduleRefresh } from "@/lib/schedule-publication";
import { stationRundownItemMutationSchema, stationRundownItemSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string; itemId: string }> };

async function mutateRundown(
  stationId: string,
  ownerId: string,
  expectedPlaylistVersion: number,
  work: (client: PoolClient) => Promise<unknown>,
) {
  await assertStationOwnerKind(stationId, ownerId, "TV");
  const result = await transaction(async (client) => {
    const locked = await lockPublicationStation(client, stationId, undefined, ownerId);
    if (!locked.station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    if (locked.station.playlist_version !== expectedPlaylistVersion) {
      throw new HttpError(409, "The rundown changed. Refresh and try again.", "RUNDOWN_CONFLICT");
    }
    await work(client);
    await client.query("UPDATE stations SET playlist_version = playlist_version + 1, updated_at = now() WHERE id = $1", [stationId]);
    const publication = await publishAfterScheduleMutation(client, stationId);
    return { refresh: locked.promoted || publication.activeChanged, playlistVersion: expectedPlaylistVersion + 1 };
  });
  if (result.refresh) await publishScheduleRefresh(stationId);
  return result.playlistVersion;
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id, itemId } = await context.params;
    const data = stationRundownItemSchema.parse(await parseJson(request));
    const playlistVersion = await mutateRundown(id, user.id, data.expectedPlaylistVersion, async (client) => {
      const updated = await client.query(
        `UPDATE playlist_items
            SET page = $1, story_slug = $2, segment_type = $3, planned_duration_ms = $4,
                timing_mode = $5, hard_start_offset_ms = $6, editorial_status = $7,
                technical_status = $8, talent = $9, camera_source_note = $10,
                script = $11, notes = $12
          WHERE id = $13 AND station_id = $14
          RETURNING id`,
        [data.page, data.storySlug, data.segmentType, data.plannedDurationMs,
          data.timingMode, data.hardStartOffsetMs, data.editorialStatus,
          data.technicalStatus, data.talent, data.cameraSourceNote,
          data.script, data.notes, itemId, id],
      );
      if (!updated.rowCount) throw new HttpError(404, "Rundown row not found.", "NOT_FOUND");
    });
    return NextResponse.json({ ok: true, playlistVersion });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id, itemId } = await context.params;
    const data = stationRundownItemMutationSchema.parse(await parseJson(request));
    let newItemId = "";
    const playlistVersion = await mutateRundown(id, user.id, data.expectedPlaylistVersion, async (client) => {
      const source = await client.query<{ position: number }>(
        "SELECT position FROM playlist_items WHERE id = $1 AND station_id = $2 FOR UPDATE",
        [itemId, id],
      );
      if (!source.rows[0]) throw new HttpError(404, "Rundown row not found.", "NOT_FOUND");
      await client.query("UPDATE playlist_items SET position = position + 1000000 WHERE station_id = $1 AND position > $2", [id, source.rows[0].position]);
      await client.query("UPDATE playlist_items SET position = position - 999999 WHERE station_id = $1 AND position >= 1000000", [id]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO playlist_items
           (station_id, video_id, position, page, story_slug, segment_type, planned_duration_ms,
            timing_mode, hard_start_offset_ms, editorial_status, technical_status, talent,
            camera_source_note, script, notes)
         SELECT station_id, video_id, $1, LEAST(page + 1, 9999), left(story_slug || ' copy', 160),
                segment_type, planned_duration_ms, timing_mode, hard_start_offset_ms,
                editorial_status, technical_status, talent, camera_source_note, script, notes
           FROM playlist_items WHERE id = $2 AND station_id = $3
         RETURNING id`,
        [source.rows[0].position + 1, itemId, id],
      );
      if (!inserted.rows[0]) throw new HttpError(404, "Rundown row not found.", "NOT_FOUND");
      newItemId = inserted.rows[0].id;
    });
    return NextResponse.json({ ok: true, itemId: newItemId, playlistVersion });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id, itemId } = await context.params;
    const data = stationRundownItemMutationSchema.parse(await parseJson(request));
    const playlistVersion = await mutateRundown(id, user.id, data.expectedPlaylistVersion, async (client) => {
      const removed = await client.query<{ position: number }>(
        "DELETE FROM playlist_items WHERE id = $1 AND station_id = $2 RETURNING position",
        [itemId, id],
      );
      if (!removed.rows[0]) throw new HttpError(404, "Rundown row not found.", "NOT_FOUND");
      await client.query("UPDATE playlist_items SET position = position + 1000000 WHERE station_id = $1 AND position > $2", [id, removed.rows[0].position]);
      await client.query("UPDATE playlist_items SET position = position - 1000001 WHERE station_id = $1 AND position >= 1000000", [id]);
    });
    return NextResponse.json({ ok: true, playlistVersion });
  } catch (error) {
    return jsonError(error);
  }
}
