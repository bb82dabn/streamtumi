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
    const [station, rotations, items, blocks, tracks] = await Promise.all([
      query<{ time_zone: string; clock_draft_version: number; active_clock_release_id: string | null; broadcast_state: "RUNNING" | "STOPPED"; release_number: number | null; source_draft_version: number | null; published_at: Date | null; radio_delivery_mode: "PLAYOUT" | "STATIC_HLS"; delivery_ready: boolean; playout_status: string | null; playout_error: string | null }>(
        `SELECT s.time_zone, s.clock_draft_version, s.active_clock_release_id, s.broadcast_state,
                s.radio_delivery_mode, r.release_number, r.source_draft_version, r.published_at,
                CASE WHEN s.radio_delivery_mode = 'STATIC_HLS' THEN s.active_clock_release_id IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM clock_release_items item
                  JOIN clock_release_blocks block ON block.id = item.release_block_id
                  LEFT JOIN radio_release_item_delivery delivery ON delivery.release_item_id = item.id
                  WHERE block.release_id = s.active_clock_release_id AND item.media_kind = 'RADIO_TRACK' AND delivery.release_item_id IS NULL
                ) ELSE false END AS delivery_ready,
                p.status AS playout_status, p.last_error AS playout_error
           FROM stations s LEFT JOIN clock_releases r ON r.id = s.active_clock_release_id
           LEFT JOIN radio_playout_state p ON p.station_id = s.id
          WHERE s.id = $1`,
        [id],
      ),
      query<{ id: string; name: string; purpose: "CONTENT" | "JINGLE" | "FALLBACK" }>("SELECT id, name, purpose FROM radio_rotations WHERE station_id = $1 ORDER BY created_at, id", [id]),
      query<{ id: string; rotation_id: string; track_id: string; position: number }>(
        `SELECT i.id, i.rotation_id, i.track_id, i.position
           FROM radio_rotation_items i JOIN radio_rotations r ON r.id = i.rotation_id
          WHERE r.station_id = $1 ORDER BY i.rotation_id, i.position`,
        [id],
      ),
      query<{ id: string; start_minute: number; radio_rotation_id: string; page: number; story_slug: string; segment_type: string; planned_duration_ms: string | null; editorial_status: string; technical_status: string; talent: string; camera_source_note: string; script: string; notes: string }>(
        `SELECT id, start_minute, radio_rotation_id, page, story_slug, segment_type,
                planned_duration_ms::text, editorial_status, technical_status, talent,
                camera_source_note, script, notes
           FROM clock_draft_blocks WHERE station_id = $1 ORDER BY start_minute`, [id]),
      query<{ id: string; title: string; artist: string; album: string; duration_ms: string; has_artwork: boolean }>(
        `SELECT id, title, artist, album, duration_ms::text, artwork_key IS NOT NULL AS has_artwork
           FROM radio_tracks WHERE station_id = $1 AND status = 'READY' AND duration_ms > 0 AND mezzanine_key IS NOT NULL
          ORDER BY artist, title, created_at`,
        [id],
      ),
    ]);
    const current = station.rows[0];
    return NextResponse.json({
      draftVersion: current.clock_draft_version,
      timeZone: current.time_zone,
      broadcastState: current.broadcast_state,
      delivery: { mode: current.radio_delivery_mode, ready: current.delivery_ready },
      playout: { status: current.radio_delivery_mode === "STATIC_HLS" ? current.delivery_ready ? "RUNNING" : "STARTING" : current.playout_status ?? "OFFLINE", error: current.playout_error },
      activeRelease: current.active_clock_release_id ? {
        id: current.active_clock_release_id,
        releaseNumber: current.release_number,
        sourceDraftVersion: current.source_draft_version,
        publishedAt: current.published_at?.toISOString() ?? null,
      } : null,
      rotations: rotations.rows.map((rotation) => ({ ...rotation, trackIds: items.rows.filter((item) => item.rotation_id === rotation.id).map((item) => item.track_id) })),
      blocks: blocks.rows.map((block) => ({ id: block.id, startMinute: block.start_minute, rotationId: block.radio_rotation_id,
        page: block.page, storySlug: block.story_slug, segmentType: block.segment_type,
        plannedDurationMs: block.planned_duration_ms === null ? null : Number(block.planned_duration_ms),
        editorialStatus: block.editorial_status, technicalStatus: block.technical_status,
        talent: block.talent, cameraSourceNote: block.camera_source_note, script: block.script, notes: block.notes })),
      tracks: tracks.rows.map((track) => ({ ...track, durationMs: Number(track.duration_ms) })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
