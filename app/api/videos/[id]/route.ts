import { NextResponse } from "next/server";
import { requireApiUser, assertVideoOwner } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { playbackAt, type PlaybackOrder } from "@/lib/schedule";
import { assertSameOrigin, jsonError, parseJson, HttpError } from "@/lib/http";
import { videoUpdateSchema } from "@/lib/validation";
import { lockPublicationStation, publishAfterScheduleMutation, publishScheduleRefresh } from "@/lib/schedule-publication";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const { stationId } = await assertVideoOwner(id, user.id);
    const data = videoUpdateSchema.parse(await parseJson(request));
    if (data.title === undefined && data.description === undefined) throw new HttpError(400, "No changes supplied.", "NO_CHANGES");
    const refresh = await transaction(async (client) => {
      const locked = await lockPublicationStation(client, stationId);
      const current = await client.query<{
        title: string;
        description: string;
        status: string;
        in_playlist: boolean;
      }>(
        `SELECT v.title, v.description, v.status,
                EXISTS (SELECT 1 FROM playlist_items p WHERE p.station_id = v.station_id AND p.video_id = v.id) AS in_playlist
           FROM videos v WHERE v.id = $1 AND v.station_id = $2 FOR UPDATE`,
        [id, stationId],
      );
      const video = current.rows[0];
      if (!video) throw new HttpError(404, "Video not found.", "NOT_FOUND");
      const titleChanged = data.title !== undefined && data.title !== video.title;
      const descriptionChanged = data.description !== undefined && data.description !== video.description;
      if (!titleChanged && !descriptionChanged) return locked.promoted;
      await client.query(
        "UPDATE videos SET title = $1, description = $2, updated_at = now() WHERE id = $3",
        [data.title ?? video.title, data.description ?? video.description, id],
      );
      if (!titleChanged || !video.in_playlist || video.status !== "READY") return locked.promoted;
      await client.query("UPDATE stations SET playlist_version = playlist_version + 1, updated_at = now() WHERE id = $1", [stationId]);
      const publication = await publishAfterScheduleMutation(client, stationId);
      return locked.promoted || publication.activeChanged;
    });
    if (refresh) await publishScheduleRefresh(stationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const { stationId } = await assertVideoOwner(id, user.id);
    const force = new URL(request.url).searchParams.get("force") === "true";
    const refresh = await transaction(async (client) => {
      const locked = await lockPublicationStation(client, stationId);
      const station = locked.station;
      if (station?.broadcast_state === "RUNNING" && station.schedule_started_at && station.active_schedule_id) {
        const schedule = await client.query<{
          transition_ms: number;
          playback_order: PlaybackOrder;
          shuffle_seed: string;
          items: Array<{ id: string; durationMs: number }>;
        }>(
          `SELECT a.transition_ms, a.playback_order, a.shuffle_seed::text,
                  COALESCE(json_agg(json_build_object('id', i.video_id, 'durationMs', i.duration_ms) ORDER BY i.position)
                    FILTER (WHERE i.id IS NOT NULL), '[]') AS items
             FROM schedules a LEFT JOIN schedule_items i ON i.schedule_id = a.id
            WHERE a.id = $1 GROUP BY a.id`,
          [station.active_schedule_id],
        );
        const active = schedule.rows[0];
        if (active?.items.length) {
          const current = playbackAt(active.items, station.schedule_started_at.getTime(), Date.now(), active.transition_ms, active.playback_order, active.shuffle_seed);
          if (!current.inTransition && current.itemId === id && !force) {
            throw new HttpError(409, "This video is currently playing. Removing it affects the editable playlist only until publication.", "CURRENTLY_PLAYING");
          }
        }
      }
      await client.query("SELECT id FROM videos WHERE id = $1 AND station_id = $2 FOR UPDATE", [id, stationId]);
      const removed = await client.query("DELETE FROM playlist_items WHERE station_id = $1 AND video_id = $2", [stationId, id]);
      if (removed.rowCount) {
        await client.query("UPDATE playlist_items SET position = position + 1000000 WHERE station_id = $1", [stationId]);
        await client.query(
          `WITH ordered AS (SELECT id, row_number() OVER (ORDER BY position) - 1 AS next_position FROM playlist_items WHERE station_id = $1)
           UPDATE playlist_items p SET position = ordered.next_position FROM ordered WHERE p.id = ordered.id`,
          [stationId],
        );
      }
      await client.query("UPDATE videos SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND status NOT IN ('ARCHIVED', 'REPLACED')", [id]);
      if (!removed.rowCount) return locked.promoted;
      await client.query("UPDATE stations SET playlist_version = playlist_version + 1, updated_at = now() WHERE id = $1", [stationId]);
      const publication = await publishAfterScheduleMutation(client, stationId);
      return locked.promoted || publication.activeChanged;
    });
    if (refresh) await publishScheduleRefresh(stationId);
    try {
      const { releaseInactiveVideoSource } = await import("@/lib/video-source-lifecycle");
      await releaseInactiveVideoSource(id);
    } catch (cleanupError) {
      console.error(`Could not release archived source storage for ${id}:`, cleanupError);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
