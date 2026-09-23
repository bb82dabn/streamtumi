import { query } from "@/lib/db";
import { resolveCalendarRuntime } from "@/lib/calendar-runtime";
import { HttpError, jsonError } from "@/lib/http";
import { rewriteHlsPlaylist } from "@/lib/media";
import { mobilePlaybackGrantFromRequest } from "@/lib/mobile-playback-grant";
import { stableRadioMaster, staticRadioMaster, type RadioOutputKind } from "@/lib/radio-hls";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string; output: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-radio-master", 180, 60);
    const { token, output: rawOutput } = await context.params;
    const output = rawOutput as RadioOutputKind;
    if (output !== "audio" && output !== "waveform") throw new HttpError(404, "Radio output not found.", "NOT_FOUND");
    const station = await resolvePublicStation(token, request);
    if (station.station_kind !== "RADIO") throw new HttpError(404, "Radio station not found.", "NOT_FOUND");
    if (station.broadcast_state !== "RUNNING") throw new HttpError(409, "This Radio station is off air.", "STATION_STOPPED");
    const calendarRuntime = await resolveCalendarRuntime(station.id, new Date());
    if (calendarRuntime?.plannedStatus === "OFFLINE") {
      throw new HttpError(409, "This Radio station is off air.", "STATION_STOPPED");
    }
    const grant = station.access_password_hash || station.room_access_generation
      ? mobilePlaybackGrantFromRequest(request, token, station.id, Date.now(), station.room_access_generation ?? "legacy")
      : null;
    if (station.radio_delivery_mode === "STATIC_HLS") {
      if (output !== "audio") throw new HttpError(404, "Radio output not found.", "NOT_FOUND");
      if (!station.active_clock_release_id) throw new HttpError(404, "Radio output not found.", "NOT_FOUND");
      const delivery = await query(
        `SELECT 1 FROM clock_timeline_items timeline
          JOIN radio_timeline_delivery delivery ON delivery.timeline_item_id = timeline.id
         WHERE timeline.release_id = $1 AND timeline.starts_at <= now() AND timeline.ends_at > now()
         LIMIT 1`,
        [station.active_clock_release_id],
      );
      if (!delivery.rowCount) throw new HttpError(503, "The Radio stream is preparing its static delivery.", "STREAM_STARTING");
      const manifest = staticRadioMaster(station.active_clock_release_id);
      return new Response(grant ? rewriteHlsPlaylist(manifest, grant) : manifest, {
        headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
      });
    }
    const state = await query<{ active_session_id: string }>(
      `SELECT s.active_session_id FROM radio_playout_state s
       JOIN radio_playout_sessions p ON p.id = s.active_session_id
       WHERE s.station_id = $1 AND s.status = 'RUNNING' AND s.heartbeat_at > now() - interval '30 seconds'
          AND CASE WHEN $2 = 'audio' THEN s.audio_manifest_at ELSE s.waveform_manifest_at END > now() - interval '15 seconds'
          AND p.status = 'ACTIVE' AND p.lease_fence = s.lease_fence`,
      [station.id, output],
    );
    const sessionId = state.rows[0]?.active_session_id;
    if (!sessionId) throw new HttpError(503, "The Radio stream is starting. Try again shortly.", "STREAM_STARTING");
    const manifest = stableRadioMaster(sessionId, output);
    return new Response(grant ? rewriteHlsPlaylist(manifest, grant) : manifest, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
