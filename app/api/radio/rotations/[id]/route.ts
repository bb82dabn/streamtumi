import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireApiUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { radioRotationUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

async function lockRotation(client: PoolClient, id: string, ownerId: string) {
  const result = await client.query<{ station_id: string; clock_draft_version: number }>(
    `SELECT r.station_id, s.clock_draft_version FROM radio_rotations r JOIN stations s ON s.id = r.station_id
      WHERE r.id = $1 AND s.owner_id = $2 AND s.station_kind = 'RADIO' AND s.deleted_at IS NULL FOR UPDATE OF s, r`,
    [id, ownerId],
  );
  if (!result.rows[0]) throw new HttpError(404, "Rotation not found.", "NOT_FOUND");
  return result.rows[0];
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const data = radioRotationUpdateSchema.parse(await parseJson(request));
    const draftVersion = await transaction(async (client) => {
      const rotation = await lockRotation(client, id, user.id);
      if (rotation.clock_draft_version !== data.expectedDraftVersion) throw new HttpError(409, "The programming draft changed. Refresh and try again.", "PROGRAMMING_CONFLICT");
      await client.query("UPDATE radio_rotations SET name = $1, purpose = $2, updated_at = now() WHERE id = $3", [data.name, data.purpose, id]);
      const version = data.expectedDraftVersion + 1;
      await client.query("UPDATE stations SET clock_draft_version = $1, updated_at = now() WHERE id = $2", [version, rotation.station_id]);
      return version;
    });
    return NextResponse.json({ draftVersion });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return jsonError(new HttpError(409, "A rotation with that name already exists.", "ROTATION_NAME_CONFLICT"));
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const expectedDraftVersion = Number(new URL(request.url).searchParams.get("expectedDraftVersion"));
    if (!Number.isInteger(expectedDraftVersion) || expectedDraftVersion < 0) throw new HttpError(400, "A valid draft version is required.", "INVALID_DRAFT_VERSION");
    const draftVersion = await transaction(async (client) => {
      const rotation = await lockRotation(client, id, user.id);
      if (rotation.clock_draft_version !== expectedDraftVersion) throw new HttpError(409, "The programming draft changed. Refresh and try again.", "PROGRAMMING_CONFLICT");
      const used = await client.query("SELECT 1 FROM clock_draft_blocks WHERE radio_rotation_id = $1", [id]);
      if (used.rowCount) throw new HttpError(409, "Remove this rotation from the weekly clock before deleting it.", "ROTATION_IN_CLOCK");
      await client.query("DELETE FROM radio_rotations WHERE id = $1", [id]);
      const version = expectedDraftVersion + 1;
      await client.query("UPDATE stations SET clock_draft_version = $1, updated_at = now() WHERE id = $2", [version, rotation.station_id]);
      return version;
    });
    return NextResponse.json({ draftVersion });
  } catch (error) {
    return jsonError(error);
  }
}
