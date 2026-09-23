import { NextResponse } from "next/server";
import { assertStationOwnerKind, requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonError } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertStationOwnerKind(id, user.id, "RADIO");
    const [tracks, usage] = await Promise.all([
      query(
        `SELECT id, title, artist, album, status, source_file_name, mime_type, size_bytes::text,
                duration_ms::text, source_codec, source_sample_rate, source_channels,
                integrated_lufs, true_peak_db, loudness_range_lu, artwork_key IS NOT NULL AS has_artwork,
                processing_progress, processing_attempts, processing_error, created_at, updated_at
           FROM radio_tracks WHERE station_id = $1 AND status <> 'ARCHIVED' ORDER BY created_at DESC`,
        [id],
      ),
      query<{ bytes: string }>(
        `SELECT quota_bytes::text AS bytes FROM station_media_storage_usage_v WHERE station_id = $1`,
        [id],
      ),
    ]);
    return NextResponse.json({ tracks: tracks.rows, stationStorageBytes: usage.rows[0]?.bytes ?? "0" });
  } catch (error) {
    return jsonError(error);
  }
}
