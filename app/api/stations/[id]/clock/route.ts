import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { weeklyClockDraftSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const data = weeklyClockDraftSchema.parse(await parseJson(request));
    const draftVersion = await transaction(async (client) => {
      const station = await client.query<{ clock_draft_version: number }>(
        "SELECT clock_draft_version FROM stations WHERE id = $1 AND owner_id = $2 AND station_kind = 'RADIO' AND programming_mode = 'CLOCK' AND deleted_at IS NULL FOR UPDATE",
        [id, user.id],
      );
      const current = station.rows[0];
      if (!current) throw new HttpError(404, "Radio station not found.", "NOT_FOUND");
      if (current.clock_draft_version !== data.expectedDraftVersion) throw new HttpError(409, "The programming draft changed. Refresh and try again.", "PROGRAMMING_CONFLICT");
      const rotationIds = [...new Set(data.blocks.map((block) => block.rotationId))];
      const rotations = await client.query<{ id: string }>("SELECT id FROM radio_rotations WHERE station_id = $1 AND id = ANY($2::uuid[]) FOR SHARE", [id, rotationIds]);
      if (rotations.rows.length !== rotationIds.length) throw new HttpError(409, "Every clock block must use a rotation from this station.", "ROTATION_NOT_FOUND");
      await client.query("DELETE FROM clock_draft_blocks WHERE station_id = $1", [id]);
      for (const [index, block] of [...data.blocks].sort((left, right) => left.startMinute - right.startMinute).entries()) {
        const rotation = await client.query<{ name: string }>("SELECT name FROM radio_rotations WHERE id = $1 AND station_id = $2", [block.rotationId, id]);
        await client.query(
          `INSERT INTO clock_draft_blocks
             (station_id, start_minute, source_kind, radio_rotation_id, page, story_slug,
              segment_type, planned_duration_ms, editorial_status, technical_status,
              talent, camera_source_note, script, notes)
           VALUES ($1, $2, 'RADIO_ROTATION', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [id, block.startMinute, block.rotationId, block.page ?? index + 1,
            block.storySlug ?? rotation.rows[0]?.name ?? `Clock block ${index + 1}`,
            block.segmentType, block.plannedDurationMs, block.editorialStatus,
            block.technicalStatus, block.talent, block.cameraSourceNote, block.script, block.notes],
        );
      }
      const version = data.expectedDraftVersion + 1;
      await client.query("UPDATE stations SET time_zone = $1, clock_draft_version = $2, updated_at = now() WHERE id = $3", [data.timeZone, version, id]);
      return version;
    });
    return NextResponse.json({ draftVersion });
  } catch (error) {
    return jsonError(error);
  }
}
