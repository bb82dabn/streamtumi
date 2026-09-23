import { NextResponse } from "next/server";
import { resolveCalendarRuntime } from "@/lib/calendar-runtime";
import { query } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { mobilePlaybackGrantFromRequest, withMobilePlaybackGrant } from "@/lib/mobile-playback-grant";
import { rateLimit } from "@/lib/rate-limit";
import {
  resolvePublicStation,
  resolvePublicTvChannelProgram,
  resolvePublicTvChannelReadiness,
  presentPublicCalendarRuntime,
  publicCalendarRadioItemRef,
  type PublicTvChannelProgram,
} from "@/lib/public-access";
import { playbackAt, playlistForCycle, type PlaybackOrder } from "@/lib/schedule";

type Context = { params: Promise<{ token: string }> };
type ScheduleItem = {
  video_id: string;
  title: string;
  duration_ms: string;
  position: number;
  thumbnail_key: string | null;
  captions_key: string | null;
};

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-station", 120, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token, request);
    const nowMs = Date.now();
    const requestedAt = new Date(nowMs);
    const stationMetadata = {
      name: station.name,
      description: station.description,
      stationKind: station.station_kind,
      timeZone: station.time_zone,
      mode: "SYNCHRONIZED" as const,
      hasLogo: Boolean(station.logo_key),
      hasOfflineSlate: Boolean(station.offline_slate_key),
      broadcastState: station.broadcast_state,
      explicit: station.effective_explicit,
      playbackKind: station.playback_type === "WEATHERSTAR_4000"
        ? "PERSONALIZED_WEATHER" as const
        : station.station_kind === "RADIO" ? "CONTINUOUS_RADIO" as const : "SCHEDULED_TV" as const,
    };
    const grant = station.access_password_hash || station.room_access_generation
      ? mobilePlaybackGrantFromRequest(request, token, station.id, nowMs, station.room_access_generation ?? "legacy")
      : null;
    const publicUrl = (path: string) => grant ? withMobilePlaybackGrant(path, grant) : path;
    const resolvedCalendarRuntime = await resolveCalendarRuntime(station.id, requestedAt);
    const calendarRuntime = resolvedCalendarRuntime?.stationKind === station.station_kind
      ? resolvedCalendarRuntime
      : null;
    const calendarFields = calendarRuntime
      ? { calendarRuntime: presentPublicCalendarRuntime(calendarRuntime) }
      : {};
    if (station.station_kind === "RADIO") {
      const visualResult = await query<{ mode: "COVER" | "VISUALIZER"; visualizer_id: string }>(
        "SELECT mode, visualizer_id FROM radio_visual_settings WHERE station_id = $1",
        [station.id],
      );
      const visual = visualResult.rows[0] ?? { mode: "VISUALIZER" as const, visualizer_id: "mirrored-wave" };
      type ProgramState = {
        program_source: "CLOCK" | "SILENCE";
        active_session_id: string | null;
        status: string;
        calendar_item_id: string | null;
        calendar_item_starts_at: Date | null;
        calendar_item_ends_at: Date | null;
        calendar_item_source_offset_ms: string | null;
        calendar_item_title: string | null;
        calendar_item_artist: string | null;
        calendar_item_album: string | null;
        calendar_item_artwork_key: string | null;
      };
      let programState: ProgramState | undefined;
      if (station.radio_delivery_mode !== "STATIC_HLS") {
        const program = await query<ProgramState>(
           `SELECT playout.program_source, playout.active_session_id, playout.status,
                 calendar_item.id AS calendar_item_id,
                 calendar_item.starts_at AS calendar_item_starts_at,
                 calendar_item.ends_at AS calendar_item_ends_at,
                 calendar_item.source_offset_ms::text AS calendar_item_source_offset_ms,
                 calendar_metadata.title AS calendar_item_title,
                 calendar_metadata.artist AS calendar_item_artist,
                 calendar_metadata.album AS calendar_item_album,
                 calendar_metadata.artwork_key AS calendar_item_artwork_key
            FROM radio_playout_state playout
            LEFT JOIN radio_playout_sessions output ON output.id = playout.active_session_id
            LEFT JOIN calendar_radio_occurrence_items calendar_item
              ON calendar_item.id = playout.current_calendar_item_id
             AND calendar_item.station_id = playout.station_id
             AND calendar_item.release_id = playout.calendar_release_id
             AND calendar_item.occurrence_id = playout.occurrence_id
             AND calendar_item.starts_at <= now() AND calendar_item.ends_at > now()
            LEFT JOIN clock_release_items calendar_metadata
              ON calendar_metadata.release_block_id = calendar_item.release_block_id
             AND calendar_metadata.id = calendar_item.release_item_id
           WHERE playout.station_id = $1 AND playout.heartbeat_at > now() - interval '30 seconds'
             AND playout.audio_manifest_at > now() - interval '15 seconds'
             AND playout.waveform_manifest_at > now() - interval '15 seconds'
             AND output.status = 'ACTIVE' AND output.lease_fence = playout.lease_fence`,
          [station.id],
        );
        programState = program.rows[0];
      }
      const availablePlayoutSessionId = programState?.active_session_id
        && (programState.status === "RUNNING" || programState.status === "DEGRADED")
        ? programState.active_session_id
        : null;
      const availablePlayoutStream = availablePlayoutSessionId ? {
        status: "AVAILABLE" as const,
        sessionId: availablePlayoutSessionId,
        audioHlsUrl: publicUrl(`/api/public/stations/${token}/radio/audio/master.m3u8`),
        waveformHlsUrl: publicUrl(`/api/public/stations/${token}/radio/waveform/master.m3u8`),
        visualHlsUrl: publicUrl(`/api/public/stations/${token}/radio/waveform/master.m3u8`),
      } : null;
      if (calendarRuntime?.plannedStatus === "OFFLINE") {
        return NextResponse.json({
          station: stationMetadata,
          online: false,
          serverTime: requestedAt.toISOString(),
          visual: { mode: visual.mode, visualizerId: visual.visualizer_id },
          ...(availablePlayoutStream ? { stream: availablePlayoutStream } : {}),
          playback: { kind: "RADIO_CLOCK", status: "STOPPED" },
          next: null,
          ...calendarFields,
        });
      }
      if (calendarRuntime?.actual
          && programState?.program_source === "CLOCK"
          && availablePlayoutStream
          && programState.calendar_item_id
          && programState.calendar_item_starts_at
          && programState.calendar_item_ends_at
          && programState.calendar_item_source_offset_ms !== null
          && programState.calendar_item_title !== null
          && programState.calendar_item_artist !== null
          && programState.calendar_item_album !== null) {
        const itemRef = publicCalendarRadioItemRef(station.id, programState.calendar_item_id);
        return NextResponse.json({
          station: stationMetadata,
          online: true,
          serverTime: requestedAt.toISOString(),
          visual: { mode: visual.mode, visualizerId: visual.visualizer_id },
          stream: availablePlayoutStream,
          playback: {
            kind: "RADIO_CLOCK",
            status: "ON_AIR",
            timelineItemId: itemRef,
            title: programState.calendar_item_title,
            artist: programState.calendar_item_artist,
            album: programState.calendar_item_album,
            startsAt: programState.calendar_item_starts_at.toISOString(),
            endsAt: programState.calendar_item_ends_at.toISOString(),
            playbackOffsetMs: Number(programState.calendar_item_source_offset_ms)
              + nowMs - programState.calendar_item_starts_at.getTime(),
            artworkAvailable: Boolean(programState.calendar_item_artwork_key),
            artworkUrl: programState.calendar_item_artwork_key
              ? publicUrl(`/api/public/stations/${token}/radio/items/${itemRef}/artwork`)
              : undefined,
          },
          next: null,
          ...calendarFields,
        });
      }
      if (station.broadcast_state !== "RUNNING" || !station.active_clock_release_id) {
        return NextResponse.json({
          station: stationMetadata,
          online: false,
          serverTime: new Date(nowMs).toISOString(),
          playback: { kind: "RADIO_CLOCK", status: station.active_clock_release_id ? "STOPPED" : "SETUP" },
          visual: { mode: visual.mode, visualizerId: visual.visualizer_id },
          ...calendarFields,
        });
      }
      const timeline = await query<{
        id: string;
        starts_at: Date;
        ends_at: Date;
        source_offset_ms: string;
        title: string;
        artist: string;
        album: string;
        artwork_key: string | null;
        delivery_ready: boolean;
      }>(
        `SELECT t.id, t.starts_at, t.ends_at, t.source_offset_ms::text,
                i.title, i.artist, i.album, i.artwork_key,
                (delivery.timeline_item_id IS NOT NULL) AS delivery_ready
           FROM clock_timeline_items t JOIN clock_release_items i ON i.id = t.release_item_id
           LEFT JOIN radio_timeline_delivery delivery ON delivery.timeline_item_id = t.id
          WHERE t.release_id = $1 AND t.ends_at > $2
          ORDER BY t.starts_at LIMIT 2`,
        [station.active_clock_release_id, new Date(nowMs)],
      );
      const current = timeline.rows.find((item) => item.starts_at.getTime() <= nowMs && item.ends_at.getTime() > nowMs);
      const next = timeline.rows.find((item) => item.id !== current?.id);
      let sessionId: string | null = null;
      let streamFailed = false;
      if (station.radio_delivery_mode === "STATIC_HLS") sessionId = current?.delivery_ready ? station.active_clock_release_id : null;
      else {
        const playout = await query<{ status: string; active_session_id: string | null }>(
          `SELECT s.status, s.active_session_id
             FROM radio_playout_state s LEFT JOIN radio_playout_sessions p ON p.id = s.active_session_id
            WHERE s.station_id = $1 AND s.current_release_id = $2
              AND s.heartbeat_at > now() - interval '30 seconds'
              AND s.audio_manifest_at > now() - interval '15 seconds'
              AND s.waveform_manifest_at > now() - interval '15 seconds'
              AND (s.active_session_id IS NULL OR (p.status = 'ACTIVE' AND p.lease_fence = s.lease_fence))`,
          [station.id, station.active_clock_release_id],
        );
        sessionId = playout.rows[0]?.status === "RUNNING" ? playout.rows[0].active_session_id : null;
        streamFailed = playout.rows[0]?.status === "FAILED";
      }
      return NextResponse.json({
        station: stationMetadata,
        online: Boolean(current && sessionId),
        serverTime: new Date(nowMs).toISOString(),
        ...(!calendarRuntime ? { releaseId: station.active_clock_release_id } : {}),
        visual: { mode: visual.mode, visualizerId: visual.visualizer_id },
        stream: sessionId ? {
          status: "AVAILABLE",
          sessionId,
          audioHlsUrl: publicUrl(`/api/public/stations/${token}/radio/audio/master.m3u8`),
          ...(station.radio_delivery_mode === "PLAYOUT" ? {
            waveformHlsUrl: publicUrl(`/api/public/stations/${token}/radio/waveform/master.m3u8`),
            visualHlsUrl: publicUrl(`/api/public/stations/${token}/radio/waveform/master.m3u8`),
          } : {}),
        } : { status: streamFailed ? "FAILED" : "STARTING" },
        playback: current ? {
          kind: "RADIO_CLOCK",
          status: "ON_AIR",
          timelineItemId: current.id,
          title: current.title,
          artist: current.artist,
          album: current.album,
          startsAt: current.starts_at.toISOString(),
          endsAt: current.ends_at.toISOString(),
          playbackOffsetMs: Number(current.source_offset_ms) + nowMs - current.starts_at.getTime(),
          artworkAvailable: Boolean(current.artwork_key),
          artworkUrl: current.artwork_key ? publicUrl(`/api/public/stations/${token}/radio/items/${current.id}/artwork`) : undefined,
        } : { kind: "RADIO_CLOCK", status: "UNAVAILABLE" },
        next: next ? { title: next.title, artist: next.artist, startsAt: next.starts_at.toISOString() } : null,
        ...calendarFields,
      });
    }
    if (station.playback_type === "WEATHERSTAR_4000") {
      return NextResponse.json({
        station: stationMetadata,
        online: station.broadcast_state === "RUNNING",
        serverTime: new Date(nowMs).toISOString(),
        playlist: [],
        ...calendarFields,
      }, { headers: { "Cache-Control": station.access_password_hash || station.room_access_generation ? "private, no-store" : "public, max-age=5" } });
    }
    let program: PublicTvChannelProgram | null = null;
    const delivery = station.tv_delivery_mode === "CHANNEL_HLS"
      ? await resolvePublicTvChannelReadiness(station, requestedAt, calendarRuntime).then(async (readiness) => {
          const status = calendarRuntime?.plannedStatus === "OFFLINE" ? "STOPPED" as const : readiness.status;
          if (status === "AVAILABLE") program = await resolvePublicTvChannelProgram(station.id);
          return {
             mode: "CHANNEL_HLS" as const,
             status,
             version: readiness.version,
             renditionMode: readiness.renditionMode,
            ...(status === "AVAILABLE" ? {
              hlsUrl: publicUrl(`/api/public/stations/${token}/tv/master.m3u8`),
            } : {}),
          };
        })
      : { mode: "LEGACY_VOD" as const };
    const selectedTvSource = calendarRuntime?.stationKind === "TV"
      ? calendarRuntime.desiredSource
      : station.active_schedule_id && station.schedule_started_at
        ? { kind: "TV_SCHEDULE" as const, scheduleId: station.active_schedule_id, epochAt: station.schedule_started_at }
        : { kind: "NONE" as const };
    const channelOnline = delivery.mode === "CHANNEL_HLS" && delivery.status === "AVAILABLE";
    if (station.broadcast_state === "STOPPED"
        || calendarRuntime?.plannedStatus === "OFFLINE"
        || selectedTvSource.kind !== "TV_SCHEDULE") {
      return NextResponse.json({
        station: stationMetadata,
        online: station.broadcast_state === "RUNNING" && calendarRuntime?.plannedStatus !== "OFFLINE" && channelOnline,
        serverTime: new Date(nowMs).toISOString(),
        delivery,
        ...(program ? { program } : {}),
        playlist: [],
        ...calendarFields,
      });
    }
    const schedule = await query<{ transition_ms: number; playback_order: PlaybackOrder; shuffle_seed: string; items: ScheduleItem[] }>(
      `SELECT a.transition_ms, a.playback_order, a.shuffle_seed::text,
              json_agg(json_build_object(
                'video_id', i.video_id, 'title', i.title, 'duration_ms', i.duration_ms::text,
                'position', i.position, 'thumbnail_key', i.thumbnail_key, 'captions_key', i.captions_key
              ) ORDER BY i.position) AS items
         FROM schedules a JOIN schedule_items i ON i.schedule_id = a.id
        WHERE a.id = $1 GROUP BY a.id`,
      [selectedTvSource.scheduleId],
    );
    const row = schedule.rows[0];
    if (!row?.items.length) {
      return NextResponse.json({
        station: stationMetadata,
        online: channelOnline,
        serverTime: new Date(nowMs).toISOString(),
        delivery,
        ...(program ? { program } : {}),
        playlist: [],
        ...calendarFields,
      });
    }
    const canonicalPlaylist = row.items.map((item) => ({
      id: item.video_id,
      title: item.title,
      durationMs: Number(item.duration_ms),
      schedulePosition: item.position,
      hlsUrl: publicUrl(`/api/public/stations/${token}/media/${item.video_id}/master.m3u8`),
      thumbnailUrl: item.thumbnail_key ? publicUrl(`/api/public/stations/${token}/media/${item.video_id}/thumbnail.jpg`) : null,
      captionsUrl: item.captions_key ? publicUrl(`/api/public/stations/${token}/media/${item.video_id}/captions.vtt`) : null,
    }));
    const position = playbackAt(canonicalPlaylist, selectedTvSource.epochAt.getTime(), nowMs, row.transition_ms, row.playback_order, row.shuffle_seed);
    const playlist = playlistForCycle(canonicalPlaylist, row.playback_order, row.shuffle_seed, position.cycleNumber);
    return NextResponse.json({
      station: {
        ...stationMetadata,
        transitionMs: row.transition_ms,
        playbackOrder: row.playback_order,
      },
      online: delivery.mode === "CHANNEL_HLS" ? channelOnline : true,
      serverTime: new Date(nowMs).toISOString(),
      ...(!calendarRuntime ? {
        scheduleId: selectedTvSource.scheduleId,
        scheduleStartedAt: selectedTvSource.epochAt.toISOString(),
      } : {}),
      playbackOrder: row.playback_order,
      shuffleSeed: row.shuffle_seed,
      delivery,
      ...(program ? { program } : {}),
      playlist,
      position,
      ...calendarFields,
    });
  } catch (error) {
    return jsonError(error);
  }
}
