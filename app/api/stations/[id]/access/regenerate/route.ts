import { NextResponse } from "next/server";
import { requireApiUser, assertStationOwner } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { newAccessToken, viewerUrl } from "@/lib/stations";
import type { StationKind } from "@/lib/station-kind";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertStationOwner(id, user.id);
    const access = newAccessToken();
    const updated = await query<{ station_kind: StationKind }>(
      "UPDATE stations SET access_token_hash = $1, access_token_ciphertext = $2, access_token_hint = $3, updated_at = now() WHERE id = $4 RETURNING station_kind",
      [access.hash, access.ciphertext, access.hint, id],
    );
    return NextResponse.json({ viewerUrl: viewerUrl(access.ciphertext, updated.rows[0].station_kind) });
  } catch (error) {
    return jsonError(error);
  }
}
