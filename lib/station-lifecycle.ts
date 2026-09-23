import type { PoolClient } from "pg";
import { transaction } from "@/lib/db";
import { publishStationEvent } from "@/lib/chat-events";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { lockActiveUser } from "@/lib/auth";
import { nextLoopAt, playbackAt, resumedScheduleStart, type PlaybackOrder, type TimelineItem } from "@/lib/schedule";
import { promotePendingLocked } from "@/lib/schedule-publication";
import { assertCalendarBaselineReady } from "@/lib/calendar-publication";

type LifecycleStation = {
  id: string;
  owner_id: string;
  station_kind: "TV" | "RADIO";
  broadcast_state: "RUNNING" | "STOPPED";
  active_schedule_id: string | null;
  pending_schedule_id: string | null;
  pending_activation_at: Date | null;
  schedule_started_at: Date | null;
  paused_schedule_id: string | null;
  paused_cycle_offset_ms: string | null;
  paused_cycle_number: string | null;
  deleted_at: Date | null;
  access_enabled: boolean;
  legal_hold_at: Date | null;
  purge_after: Date | null;
  programming_mode: "LEGACY_LOOP" | "CLOCK";
  active_clock_release_id: string | null;
  radio_delivery_mode: "PLAYOUT" | "STATIC_HLS";
  active_programming_strategy: string | null;
  active_programming_profile_id: string | null;
  active_calendar_release_id: string | null;
};

async function lockedStation(
  client: PoolClient,
  stationId: string,
  ownerId: string,
  now?: Date,
): Promise<{ station: LifecycleStation; now: Date }> {
  const result = await client.query<LifecycleStation>(
    `SELECT id, owner_id, station_kind, broadcast_state, active_schedule_id, pending_schedule_id,
             pending_activation_at, schedule_started_at, paused_schedule_id, paused_cycle_offset_ms,
             paused_cycle_number,
             deleted_at, access_enabled, legal_hold_at, purge_after, programming_mode, active_clock_release_id, radio_delivery_mode,
             active_programming_profile_id, active_calendar_release_id,
             (SELECT profile.strategy::text FROM station_programming_profiles profile
               WHERE profile.station_id = stations.id
                 AND profile.id = stations.active_programming_profile_id) AS active_programming_strategy
       FROM stations WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
    [stationId, ownerId],
  );
  const station = result.rows[0];
  if (!station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  return { station, now: now ?? new Date() };
}

async function scheduleTimeline(client: PoolClient, scheduleId: string): Promise<{
  items: TimelineItem[];
  transitionMs: number;
  playbackOrder: PlaybackOrder;
  shuffleSeed: string;
  totalDurationMs: number;
}> {
  const result = await client.query<{ id: string; duration_ms: string; transition_ms: number; playback_order: PlaybackOrder; shuffle_seed: string; total_duration_ms: string }>(
    `SELECT i.video_id AS id, i.duration_ms::text, s.transition_ms, s.playback_order,
            s.shuffle_seed::text, s.total_duration_ms::text
       FROM schedules s JOIN schedule_items i ON i.schedule_id = s.id
      WHERE s.id = $1 ORDER BY i.position`,
    [scheduleId],
  );
  return {
    items: result.rows.map((item) => ({ id: item.id, durationMs: Number(item.duration_ms) })),
    transitionMs: result.rows[0]?.transition_ms ?? 0,
    playbackOrder: result.rows[0]?.playback_order ?? "SEQUENTIAL",
    shuffleSeed: result.rows[0]?.shuffle_seed ?? "0",
    totalDurationMs: Number(result.rows[0]?.total_duration_ms ?? 0),
  };
}

async function assertCalendarStartReady(client: PoolClient, station: LifecycleStation): Promise<void> {
  if (!station.active_programming_profile_id || !station.active_calendar_release_id) {
    throw new HttpError(409, "Activate a Calendar release before starting this station.", "NO_ACTIVE_CALENDAR_RELEASE");
  }
  const coherent = await client.query(
    `SELECT 1
       FROM calendar_releases release
       JOIN station_programming_profiles profile
         ON profile.station_id = release.station_id
        AND profile.id = release.profile_id
        AND profile.strategy = 'CALENDAR_EVENTS'
        AND profile.lifecycle = 'ACTIVE'
       JOIN calendar_release_materialization_state state
         ON state.station_id = release.station_id AND state.release_id = release.id
        AND state.status = 'READY'
        AND state.horizon_from <= clock_timestamp()
        AND state.materialized_through > clock_timestamp()
      WHERE release.station_id = $1 AND release.id = $2
        AND release.profile_id = $3`,
    [station.id, station.active_calendar_release_id, station.active_programming_profile_id],
  );
  if (!coherent.rowCount) {
    throw new HttpError(409, "The active Calendar release is not ready for the current database time.", "ACTIVE_CALENDAR_RELEASE_NOT_READY");
  }
  await assertCalendarBaselineReady(client, station);
  if (station.station_kind === "RADIO" && station.radio_delivery_mode !== "PLAYOUT") {
    throw new HttpError(409, "Radio Calendar programming requires PLAYOUT delivery.", "CALENDAR_RADIO_REQUIRES_PLAYOUT");
  }
}

async function stopCalendarRuntimeLocked(
  client: PoolClient,
  station: LifecycleStation,
  stoppedAt: Date,
): Promise<void> {
  if (!station.active_calendar_release_id) return;
  const current = await client.query<{
    status: "IDLE" | "PLAYING" | "LIVE" | "OFFLINE" | "FALLBACK" | "FAILED";
    current_occurrence_id: string | null;
    transition_sequence: string;
  }>(
    `SELECT status, current_occurrence_id, transition_sequence::text
       FROM calendar_runtime_state WHERE station_id = $1 FOR UPDATE`,
    [station.id],
  );
  const state = current.rows[0];
  const sequence = Number(state?.transition_sequence ?? 0) + 1;
  if (state) {
    await client.query(
      `UPDATE calendar_runtime_state
          SET status = 'IDLE', active_release_id = $2,
              current_occurrence_id = NULL, occurrence_started_at = NULL,
              source_role = NULL, source_kind = NULL, next_boundary_at = NULL,
              heartbeat_at = NULL, last_error = NULL, version = version + 1,
              transition_sequence = $3, public_revision = public_revision + 1,
              updated_at = now()
        WHERE station_id = $1 AND transition_sequence = $4`,
      [station.id, station.active_calendar_release_id, sequence, state.transition_sequence],
    );
  } else {
    await client.query(
      `INSERT INTO calendar_runtime_state
         (station_id, status, active_release_id, transition_sequence, public_revision, updated_at)
       VALUES ($1, 'IDLE', $2, $3, 1, now())`,
      [station.id, station.active_calendar_release_id, sequence],
    );
  }
  await client.query(
    `INSERT INTO calendar_runtime_transitions
       (station_id, sequence, release_id, occurrence_id, transition_kind,
        from_status, to_status, reason, transitioned_at)
     VALUES ($1, $2, $3, $4, 'OCCURRENCE_ENDED', $5, 'IDLE', 'STATION_STOPPED', $6)`,
    [station.id, sequence, station.active_calendar_release_id,
      state?.current_occurrence_id ?? null, state?.status ?? "IDLE", stoppedAt],
  );
}

export async function stopStation(stationId: string, ownerId: string): Promise<void> {
  await transaction(async (client) => {
    const { station, now } = await lockedStation(client, stationId, ownerId);
    if (station.deleted_at) throw new HttpError(409, "Deleted stations cannot be stopped.", "STATION_DELETED");
    if (station.broadcast_state === "STOPPED") throw new HttpError(409, "The station is already stopped.", "ALREADY_STOPPED");

    const calendarActive = station.active_programming_strategy === "CALENDAR_EVENTS";
    if (calendarActive) await stopCalendarRuntimeLocked(client, station, now);

    const promotion = station.programming_mode === "CLOCK" || calendarActive
      ? { station, promoted: false }
      : await promotePendingLocked(client, station, now);
    if (promotion.promoted) {
      station.active_schedule_id = promotion.station.active_schedule_id;
      station.pending_schedule_id = promotion.station.pending_schedule_id;
      station.pending_activation_at = promotion.station.pending_activation_at;
      station.schedule_started_at = promotion.station.schedule_started_at;
    }

    let pausedOffset: number | null = null;
    let pausedCycle: number | null = null;
    if (station.programming_mode !== "CLOCK" && !calendarActive && station.active_schedule_id && station.schedule_started_at) {
      const timeline = await scheduleTimeline(client, station.active_schedule_id);
      if (timeline.items.length) {
        const position = playbackAt(timeline.items, station.schedule_started_at.getTime(), now.getTime(), timeline.transitionMs, timeline.playbackOrder, timeline.shuffleSeed);
        pausedOffset = position.cycleOffsetMs;
        pausedCycle = position.cycleNumber;
      }
    }

    await client.query(
      `UPDATE stations
          SET broadcast_state = 'STOPPED', stopped_at = now(),
              paused_schedule_id = $2, paused_cycle_offset_ms = $3,
              paused_cycle_number = $4, updated_at = now()
        WHERE id = $1`,
      [station.id, pausedOffset === null ? null : station.active_schedule_id, pausedOffset, pausedCycle],
    );
  });
  await publishStationEvent(stationId, { type: "station.updated", data: { broadcastState: "STOPPED" } });
}

export async function startStation(stationId: string, ownerId: string, strategy: "restart" | "resume"): Promise<void> {
  await transaction(async (client) => {
    const { station, now } = await lockedStation(client, stationId, ownerId);
    if (station.deleted_at) throw new HttpError(409, "Restore this station before starting it.", "STATION_DELETED");
    if (station.broadcast_state === "RUNNING") throw new HttpError(409, "The station is already running.", "ALREADY_RUNNING");
    if (station.active_programming_strategy === "CALENDAR_EVENTS") {
      await assertCalendarStartReady(client, station);
      await client.query(
        `UPDATE stations
            SET broadcast_state = 'RUNNING', stopped_at = NULL,
                schedule_started_at = CASE
                  WHEN station_kind = 'TV' THEN COALESCE(schedule_started_at, clock_timestamp())
                  ELSE schedule_started_at
                END,
                paused_schedule_id = NULL, paused_cycle_offset_ms = NULL,
                paused_cycle_number = NULL, updated_at = now()
          WHERE id = $1`,
        [station.id],
      );
      return;
    }
    if (station.programming_mode === "CLOCK") {
      if (!station.active_clock_release_id) throw new HttpError(409, "Publish the weekly clock before starting the station.", "NO_ACTIVE_CLOCK");
      if (station.radio_delivery_mode === "STATIC_HLS") {
        const missing = await client.query(
          `SELECT 1 FROM clock_release_items item
            JOIN clock_release_blocks block ON block.id = item.release_block_id
            LEFT JOIN radio_release_item_delivery delivery ON delivery.release_item_id = item.id
           WHERE block.release_id = $1 AND item.media_kind = 'RADIO_TRACK' AND delivery.release_item_id IS NULL
           LIMIT 1`,
          [station.active_clock_release_id],
        );
        if (missing.rowCount) throw new HttpError(409, "Prepare every Radio track for static delivery before starting the station.", "RADIO_DELIVERY_NOT_READY");
        const current = await client.query(
          `SELECT 1 FROM clock_timeline_items timeline
            JOIN radio_timeline_delivery delivery ON delivery.timeline_item_id = timeline.id
           WHERE timeline.release_id = $1 AND timeline.starts_at <= clock_timestamp() AND timeline.ends_at > clock_timestamp()
           LIMIT 1`,
          [station.active_clock_release_id],
        );
        if (!current.rowCount) throw new HttpError(409, "The current Radio delivery window is not prepared yet.", "RADIO_DELIVERY_NOT_READY");
      }
      await client.query(
        `UPDATE stations SET broadcast_state = 'RUNNING', stopped_at = NULL,
                paused_schedule_id = NULL, paused_cycle_offset_ms = NULL,
                paused_cycle_number = NULL, updated_at = now() WHERE id = $1`,
        [station.id],
      );
      return;
    }
    if (!station.active_schedule_id && !station.pending_schedule_id) throw new HttpError(409, "Apply a playlist before starting the station.", "NO_ACTIVE_SCHEDULE");

    let activeScheduleId = station.active_schedule_id;
    let startedAt = now;
    let pendingScheduleId = station.pending_schedule_id;
    let pendingActivationAt: Date | null = null;
    if (strategy === "resume") {
      if (station.paused_schedule_id !== station.active_schedule_id || station.paused_cycle_offset_ms === null || station.paused_cycle_number === null || !station.active_schedule_id) {
        throw new HttpError(409, "The saved position no longer matches the active playlist.", "RESUME_UNAVAILABLE");
      }
      const timeline = await scheduleTimeline(client, station.active_schedule_id);
      startedAt = resumedScheduleStart(now.getTime(), Number(station.paused_cycle_offset_ms), Number(station.paused_cycle_number), timeline.totalDurationMs);
      if (pendingScheduleId) pendingActivationAt = new Date(nextLoopAt(startedAt.getTime(), now.getTime(), timeline.totalDurationMs));
    } else if (pendingScheduleId) {
      activeScheduleId = pendingScheduleId;
      pendingScheduleId = null;
    }

    await client.query(
      `UPDATE stations
          SET broadcast_state = 'RUNNING', active_schedule_id = $2, schedule_started_at = $3,
              pending_schedule_id = $4, pending_activation_at = $5,
              stopped_at = NULL, paused_schedule_id = NULL,
              paused_cycle_offset_ms = NULL, paused_cycle_number = NULL, updated_at = now()
        WHERE id = $1`,
      [station.id, activeScheduleId, startedAt, pendingScheduleId, pendingActivationAt],
    );
  });
  await publishStationEvent(stationId, { type: "station.updated", data: { broadcastState: "RUNNING" } });
}

export async function scheduleStationDeletion(stationId: string, ownerId: string): Promise<Date> {
  const purgeAt = await transaction(async (client) => {
    const { station } = await lockedStation(client, stationId, ownerId);
    if (station.legal_hold_at) throw new HttpError(409, "This station is under legal hold and cannot be deleted.", "LEGAL_HOLD");
    if (station.deleted_at) return station.purge_after ?? new Date(Date.now() + env().STATION_DELETE_GRACE_DAYS * 86_400_000);
    const updated = await client.query<{ purge_after: Date }>(
      `UPDATE stations
          SET deleted_at = now(), purge_after = now() + ($2 * interval '1 day'),
              deleted_access_enabled = access_enabled, access_enabled = false,
              broadcast_state = 'STOPPED', stopped_at = now(), updated_at = now()
        WHERE id = $1 RETURNING purge_after`,
      [station.id, env().STATION_DELETE_GRACE_DAYS],
    );
    return updated.rows[0].purge_after;
  });
  await publishStationEvent(stationId, { type: "station.updated", data: { deleted: true } });
  return purgeAt;
}

export async function restoreStation(stationId: string, ownerId: string): Promise<void> {
  await transaction(async (client) => {
    await lockActiveUser(client, ownerId);
    const { station, now } = await lockedStation(client, stationId, ownerId);
    if (!station.deleted_at) throw new HttpError(409, "The station is not scheduled for deletion.", "NOT_DELETED");
    if (station.purge_after && station.purge_after <= now) {
      throw new HttpError(409, "The station deletion deadline has passed.", "PURGE_DUE");
    }
    await client.query(
      `UPDATE stations
          SET deleted_at = NULL, purge_after = NULL, purge_error = NULL,
              access_enabled = COALESCE(deleted_access_enabled, false),
              deleted_access_enabled = NULL, updated_at = now()
        WHERE id = $1`,
      [station.id],
    );
  });
}
