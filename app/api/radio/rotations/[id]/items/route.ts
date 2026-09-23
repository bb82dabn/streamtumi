import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { radioRotationItemsSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const data = radioRotationItemsSchema.parse(await parseJson(request));
    const draftVersion = await transaction(async (client) => {
      const rotation = await client.query<{ station_id: string; clock_draft_version: number }>(
        `SELECT r.station_id, s.clock_draft_version FROM radio_rotations r JOIN stations s ON s.id = r.station_id
          WHERE r.id = $1 AND s.owner_id = $2 AND s.station_kind = 'RADIO' AND s.deleted_at IS NULL FOR UPDATE OF s, r`,
        [id, user.id],
      );
      const current = rotation.rows[0];
      if (!current) throw new HttpError(404, "Rotation not found.", "NOT_FOUND");
      if (current.clock_draft_version !== data.expectedDraftVersion) throw new HttpError(409, "The programming draft changed. Refresh and try again.", "PROGRAMMING_CONFLICT");
      const uniqueTrackIds = [...new Set(data.trackIds)];
      const available = await client.query<{ id: string }>(
        "SELECT id FROM radio_tracks WHERE station_id = $1 AND id = ANY($2::uuid[]) AND status = 'READY' AND duration_ms > 0 AND mezzanine_key IS NOT NULL FOR SHARE",
        [current.station_id, uniqueTrackIds],
      );
      if (available.rows.length !== uniqueTrackIds.length) throw new HttpError(409, "Every rotation track must be ready and belong to this station.", "TRACK_NOT_READY");
      await client.query("DELETE FROM radio_rotation_items WHERE rotation_id = $1", [id]);
      for (const [position, trackId] of data.trackIds.entries()) await client.query("INSERT INTO radio_rotation_items (rotation_id, track_id, position) VALUES ($1, $2, $3)", [id, trackId, position]);
      const version = data.expectedDraftVersion + 1;
      await client.query("UPDATE stations SET clock_draft_version = $1, updated_at = now() WHERE id = $2", [version, current.station_id]);
      return version;
    });
    return NextResponse.json({ draftVersion });
  } catch (error) {
    return jsonError(error);
  }
}
