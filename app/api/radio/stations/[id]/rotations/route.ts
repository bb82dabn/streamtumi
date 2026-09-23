import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { radioRotationCreateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const data = radioRotationCreateSchema.parse(await parseJson(request));
    const result = await transaction(async (client) => {
      const station = await client.query<{ clock_draft_version: number }>(
        "SELECT clock_draft_version FROM stations WHERE id = $1 AND owner_id = $2 AND station_kind = 'RADIO' AND programming_mode = 'CLOCK' AND deleted_at IS NULL FOR UPDATE",
        [id, user.id],
      );
      if (!station.rows[0]) throw new HttpError(404, "Radio station not found.", "NOT_FOUND");
      if (station.rows[0].clock_draft_version !== data.expectedDraftVersion) throw new HttpError(409, "The programming draft changed. Refresh and try again.", "PROGRAMMING_CONFLICT");
      const rotation = await client.query<{ id: string }>("INSERT INTO radio_rotations (station_id, name, purpose) VALUES ($1, $2, $3) RETURNING id", [id, data.name, data.purpose]);
      const version = data.expectedDraftVersion + 1;
      await client.query("UPDATE stations SET clock_draft_version = $1, updated_at = now() WHERE id = $2", [version, id]);
      return { id: rotation.rows[0].id, draftVersion: version };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return jsonError(new HttpError(409, "A rotation with that name already exists.", "ROTATION_NAME_CONFLICT"));
    return jsonError(error);
  }
}
