import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { viewerCounts } from "@/lib/presence";

export async function GET() {
  try {
    const user = await requireApiUser();
    const stations = await query<{ id: string }>("SELECT id FROM stations WHERE owner_id = $1 AND deleted_at IS NULL AND COALESCE(playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')", [user.id]);
    return NextResponse.json({ counts: await viewerCounts(stations.rows.map((station) => station.id)) });
  } catch (error) {
    return jsonError(error);
  }
}
