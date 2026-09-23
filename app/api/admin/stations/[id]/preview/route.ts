import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPreview } from "@/lib/admin-preview";
import { query } from "@/lib/db";
import { jsonError, HttpError } from "@/lib/http";
import { playbackAt, playlistForCycle, type PlaybackOrder } from "@/lib/schedule";
import { promoteDueStation } from "@/lib/schedule-publication";

type Context = { params: Promise<{ id: string }> };
type ScheduleItem = {
  video_id: string;
  title: string;
  duration_ms: string;
  position: number;
  captions_key: string | null;
};

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(_: Request, context: Context) {
  try {
    const { id: rawId } = await context.params;
    const id = z.string().uuid().parse(rawId);
    await requireAdminPreview(id);
    await promoteDueStation(id);
    const stationResult = await query<{
      name: string;
      description: string;
      broadcast_state: "RUNNING" | "STOPPED";
      active_schedule_id: string | null;
      schedule_started_at: Date | null;
      effective_explicit: boolean;
    }>(
      `SELECT s.name, s.description, s.broadcast_state, s.active_schedule_id, s.schedule_started_at,
              (s.owner_declared_explicit OR s.explicit_enforced_at IS NOT NULL OR g.is_explicit) AS effective_explicit
         FROM stations s JOIN station_genres g ON g.id = s.genre_id
        WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id],
    );
    const station = stationResult.rows[0];
    if (!station) throw new HttpError(404, "Station not found or no longer available.", "NOT_FOUND");
    const nowMs = Date.now();
    const stationMetadata = {
      name: station.name,
      description: station.description,
      mode: "SYNCHRONIZED" as const,
      broadcastState: station.broadcast_state,
      explicit: station.effective_explicit,
    };
    if (station.broadcast_state === "STOPPED" || !station.active_schedule_id || !station.schedule_started_at) {
      return NextResponse.json({ station: stationMetadata, online: false, serverTime: new Date(nowMs).toISOString(), playlist: [] }, { headers: noStore });
    }
    const schedule = await query<{ transition_ms: number; playback_order: PlaybackOrder; shuffle_seed: string; items: ScheduleItem[] }>(
      `SELECT a.transition_ms, a.playback_order, a.shuffle_seed::text,
              json_agg(json_build_object(
                'video_id', i.video_id, 'title', i.title, 'duration_ms', i.duration_ms::text,
                'position', i.position, 'captions_key', i.captions_key
              ) ORDER BY i.position) AS items
         FROM schedules a JOIN schedule_items i ON i.schedule_id = a.id
        WHERE a.id = $1 GROUP BY a.id`,
      [station.active_schedule_id],
    );
    const row = schedule.rows[0];
    if (!row?.items.length) {
      return NextResponse.json({ station: stationMetadata, online: false, serverTime: new Date(nowMs).toISOString(), playlist: [] }, { headers: noStore });
    }
    const canonicalPlaylist = row.items.map((item) => ({
      id: item.video_id,
      title: item.title,
      durationMs: Number(item.duration_ms),
      schedulePosition: item.position,
      hlsUrl: `/api/admin/stations/${id}/preview/media/${item.video_id}/master.m3u8`,
      thumbnailUrl: null,
      captionsUrl: item.captions_key ? `/api/admin/stations/${id}/preview/media/${item.video_id}/captions.vtt` : null,
    }));
    const position = playbackAt(canonicalPlaylist, station.schedule_started_at.getTime(), nowMs, row.transition_ms, row.playback_order, row.shuffle_seed);
    const playlist = playlistForCycle(canonicalPlaylist, row.playback_order, row.shuffle_seed, position.cycleNumber);
    return NextResponse.json({
      station: { ...stationMetadata, transitionMs: row.transition_ms, playbackOrder: row.playback_order },
      online: true,
      serverTime: new Date(nowMs).toISOString(),
      scheduleId: station.active_schedule_id,
      scheduleStartedAt: station.schedule_started_at.toISOString(),
      playbackOrder: row.playback_order,
      shuffleSeed: row.shuffle_seed,
      playlist,
      position,
    }, { headers: noStore });
  } catch (error) {
    return jsonError(error);
  }
}
