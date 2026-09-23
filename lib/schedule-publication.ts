import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { publishStationEvent } from "@/lib/chat-events";
import { transaction } from "@/lib/db";
import { invalidateGuideCatalogCache } from "@/lib/guide-catalog-cache";
import { HttpError } from "@/lib/http";
import { nextLoopAt, type PlaybackOrder } from "@/lib/schedule";

export type PendingScheduleStation = {
  id: string;
  broadcast_state: "RUNNING" | "STOPPED";
  active_schedule_id: string | null;
  pending_schedule_id: string | null;
  pending_activation_at: Date | null;
  schedule_started_at: Date | null;
};

export type PublicationStation = PendingScheduleStation & {
  playlist_version: number;
  transition_ms: number;
  playback_order: PlaybackOrder;
  auto_publish_next_loop: boolean;
  tv_delivery_mode: "LEGACY_VOD" | "CHANNEL_HLS";
  active_total_duration_ms: string | null;
};

export type PublicationChange = {
  activeChanged: boolean;
  pendingChanged: boolean;
  promoted: boolean;
  scheduleId?: string;
  activationAt?: Date | null;
  timing?: "immediate" | "next-loop";
};

type ScheduleSnapshot = { id: string; totalDurationMs: number };

type ScheduleVideo = {
  video_id: string;
  title: string;
  duration_ms: string;
  hls_key: string;
  thumbnail_key: string | null;
  captions_key: string | null;
  media_asset_id?: string | null;
  derivative_id?: string | null;
  delivery_duration_ms?: string | null;
  page: number;
  story_slug: string;
  segment_type: string;
  planned_duration_ms: string | null;
  timing_mode: string;
  hard_start_offset_ms: string | null;
  editorial_status: string;
  technical_status: string;
  talent: string;
  camera_source_note: string;
  script: string;
  notes: string;
};

function due(station: PendingScheduleStation, now: Date): boolean {
  return station.broadcast_state === "RUNNING"
    && Boolean(station.pending_schedule_id)
    && Boolean(station.pending_activation_at)
    && (station.pending_activation_at as Date) <= now;
}

export async function promotePendingLocked(
  client: PoolClient,
  station: PendingScheduleStation,
  now: Date,
): Promise<{ station: PendingScheduleStation; promoted: boolean }> {
  if (!due(station, now)) return { station, promoted: false };
  const updated = await client.query<PendingScheduleStation>(
    `UPDATE stations
        SET active_schedule_id = pending_schedule_id,
            schedule_started_at = pending_activation_at,
            pending_schedule_id = NULL,
            pending_activation_at = NULL,
            updated_at = now()
      WHERE id = $1 AND broadcast_state = 'RUNNING'
        AND active_schedule_id IS NOT DISTINCT FROM $2
        AND pending_schedule_id = $3 AND pending_activation_at = $4
        AND pending_activation_at <= $5
      RETURNING id, broadcast_state, active_schedule_id, pending_schedule_id,
                pending_activation_at, schedule_started_at`,
    [station.id, station.active_schedule_id, station.pending_schedule_id, station.pending_activation_at, now],
  );
  if (updated.rows[0]) return { station: updated.rows[0], promoted: true };

  const current = await client.query<PendingScheduleStation>(
    `SELECT id, broadcast_state, active_schedule_id, pending_schedule_id,
            pending_activation_at, schedule_started_at
       FROM stations WHERE id = $1`,
    [station.id],
  );
  return { station: current.rows[0] ?? station, promoted: false };
}

async function selectPublicationStation(
  client: PoolClient,
  stationId: string,
  ownerId?: string,
  lock = false,
): Promise<PublicationStation | null> {
  const result = await client.query<PublicationStation>(
    `SELECT s.id, s.broadcast_state, s.active_schedule_id, s.pending_schedule_id,
             s.pending_activation_at, s.schedule_started_at, s.playlist_version,
             s.transition_ms, s.playback_order, s.auto_publish_next_loop,
             s.tv_delivery_mode,
             (SELECT a.total_duration_ms::text FROM schedules a WHERE a.id = s.active_schedule_id) AS active_total_duration_ms
       FROM stations s
      WHERE s.id = $1 AND s.programming_mode = 'LEGACY_LOOP' AND ($2::uuid IS NULL OR s.owner_id = $2)
      ${lock ? "FOR UPDATE OF s" : ""}`,
    [stationId, ownerId ?? null],
  );
  return result.rows[0] ?? null;
}

export async function lockPublicationStation(
  client: PoolClient,
  stationId: string,
  now?: Date,
  ownerId?: string,
): Promise<{ station: PublicationStation | null; promoted: boolean; now: Date }> {
  const locked = await selectPublicationStation(client, stationId, ownerId, true);
  const effectiveNow = now ?? (await client.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0].now;
  if (!locked) return { station: null, promoted: false, now: effectiveNow };
  const promotion = await promotePendingLocked(client, locked, effectiveNow);
  if (!promotion.promoted) return { station: locked, promoted: false, now: effectiveNow };
  const current = await selectPublicationStation(client, stationId, ownerId);
  return { station: current, promoted: true, now: effectiveNow };
}

async function createScheduleSnapshot(client: PoolClient, publicationStation: PublicationStation): Promise<ScheduleSnapshot | null> {
  const stationId = publicationStation.id;
  const station = await client.query<{
    playlist_version: number;
    transition_ms: number;
    playback_order: PlaybackOrder;
  }>(
    "SELECT playlist_version, transition_ms, playback_order FROM stations WHERE id = $1",
    [stationId],
  );
  const videos = publicationStation.tv_delivery_mode === "CHANNEL_HLS"
    ? await client.query<ScheduleVideo>(
      `SELECT p.video_id, v.title, v.duration_ms::text, v.hls_key, v.thumbnail_key, v.captions_key,
              p.page, p.story_slug, p.segment_type, p.planned_duration_ms::text, p.timing_mode,
              p.hard_start_offset_ms::text, p.editorial_status, p.technical_status,
              p.talent, p.camera_source_note, p.script, p.notes,
              v.media_asset_id, artifact.derivative_id, artifact.duration_ms AS delivery_duration_ms
         FROM playlist_items p
         JOIN videos v ON v.id = p.video_id
         LEFT JOIN LATERAL (
           SELECT derivative.id AS derivative_id, descriptor.duration_ms::text
             FROM tv_channel_derivatives derivative
             JOIN tv_channel_delivery_descriptors descriptor ON descriptor.id = derivative.descriptor_id
             JOIN media_asset_variants variant
               ON variant.id = derivative.media_asset_variant_id
              AND variant.media_asset_id = derivative.media_asset_id
            WHERE derivative.media_asset_id = v.media_asset_id
              AND derivative.profile = 'tv-channel-v1'
              AND descriptor.profile = derivative.profile
              AND descriptor.duration_ms = v.duration_ms
              AND variant.role = 'TV_AUTOMATION' AND variant.status = 'READY'
            ORDER BY derivative.created_at DESC, derivative.id DESC
            LIMIT 1
         ) artifact ON true
        WHERE p.station_id = $1 AND v.status = 'READY' AND v.duration_ms > 0 AND v.hls_key IS NOT NULL
        ORDER BY p.position`,
      [stationId],
    )
    : await client.query<ScheduleVideo>(
      `SELECT p.video_id, v.title, v.duration_ms::text, v.hls_key, v.thumbnail_key, v.captions_key,
              p.page, p.story_slug, p.segment_type, p.planned_duration_ms::text, p.timing_mode,
              p.hard_start_offset_ms::text, p.editorial_status, p.technical_status,
              p.talent, p.camera_source_note, p.script, p.notes
         FROM playlist_items p JOIN videos v ON v.id = p.video_id
        WHERE p.station_id = $1 AND v.status = 'READY' AND v.duration_ms > 0 AND v.hls_key IS NOT NULL
        ORDER BY p.position`,
      [stationId],
    );
  if (!videos.rows.length) return null;
  const current = station.rows[0];
  let transitionFillerId: string | null = null;
  if (publicationStation.tv_delivery_mode === "CHANNEL_HLS") {
    if (videos.rows.some((video) => !video.media_asset_id || !video.derivative_id
      || !video.delivery_duration_ms || video.delivery_duration_ms !== video.duration_ms)) {
      throw new HttpError(
        409,
        "Every ready playlist video must have prepared TV channel delivery with an exact matching duration before publication.",
        "TV_DELIVERY_NOT_READY",
      );
    }
    if (current.transition_ms > 0) {
      const filler = await client.query<{ id: string }>(
        `SELECT filler.id
           FROM tv_channel_transition_fillers filler
           JOIN tv_channel_delivery_descriptors descriptor ON descriptor.id = filler.descriptor_id
          WHERE filler.station_id = $1 AND filler.profile = 'tv-channel-v1'
            AND filler.transition_ms = $2 AND descriptor.profile = filler.profile
            AND descriptor.duration_ms = $2::bigint
          ORDER BY filler.generation DESC, filler.id DESC
          LIMIT 1`,
        [stationId, current.transition_ms],
      );
      if (!filler.rows[0]) {
        throw new HttpError(
          409,
          "Prepare an exact TV channel transition filler for this station before publication.",
          "TV_DELIVERY_NOT_READY",
        );
      }
      transitionFillerId = filler.rows[0].id;
    }
  }
  const totalDurationMs = videos.rows.reduce((sum, video) => {
    const durationMs = publicationStation.tv_delivery_mode === "CHANNEL_HLS"
      ? video.delivery_duration_ms as string
      : video.duration_ms;
    return sum + Number(durationMs) + current.transition_ms;
  }, 0);
  const shuffleSeed = randomBytes(8).readBigInt64BE().toString();
  const schedule = await client.query<{ id: string }>(
    `INSERT INTO schedules
       (station_id, source_playlist_version, transition_ms, total_duration_ms, playback_order, shuffle_seed)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [stationId, current.playlist_version, current.transition_ms, totalDurationMs, current.playback_order, shuffleSeed],
  );
  for (const [position, video] of videos.rows.entries()) {
    if (publicationStation.tv_delivery_mode === "CHANNEL_HLS") {
      const item = await client.query<{ id: string }>(
         `INSERT INTO schedule_items
          (schedule_id, video_id, position, title, duration_ms, hls_key, thumbnail_key, captions_key,
           page, story_slug, segment_type, planned_duration_ms, timing_mode, hard_start_offset_ms,
           editorial_status, technical_status, talent, camera_source_note, script, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING id`,
        [schedule.rows[0].id, video.video_id, position, video.title, video.delivery_duration_ms, video.hls_key, video.thumbnail_key, video.captions_key,
          video.page, video.story_slug, video.segment_type, video.planned_duration_ms, video.timing_mode, video.hard_start_offset_ms,
          video.editorial_status, video.technical_status, video.talent, video.camera_source_note, video.script, video.notes],
      );
      await client.query(
        `INSERT INTO tv_schedule_item_delivery
         (schedule_item_id, derivative_id, transition_filler_id)
         VALUES ($1, $2, $3)`,
        [item.rows[0].id, video.derivative_id, transitionFillerId],
      );
    } else {
      await client.query(
        `INSERT INTO schedule_items
          (schedule_id, video_id, position, title, duration_ms, hls_key, thumbnail_key, captions_key,
           page, story_slug, segment_type, planned_duration_ms, timing_mode, hard_start_offset_ms,
           editorial_status, technical_status, talent, camera_source_note, script, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [schedule.rows[0].id, video.video_id, position, video.title, video.duration_ms, video.hls_key, video.thumbnail_key, video.captions_key,
          video.page, video.story_slug, video.segment_type, video.planned_duration_ms, video.timing_mode, video.hard_start_offset_ms,
          video.editorial_status, video.technical_status, video.talent, video.camera_source_note, video.script, video.notes],
      );
    }
  }
  return { id: schedule.rows[0].id, totalDurationMs };
}

function activationFor(station: PublicationStation, now: Date): Date | null {
  if (station.broadcast_state !== "RUNNING" || !station.schedule_started_at || !station.active_total_duration_ms) return null;
  return new Date(nextLoopAt(station.schedule_started_at.getTime(), now.getTime(), Number(station.active_total_duration_ms)));
}

async function activateSnapshot(
  client: PoolClient,
  station: PublicationStation,
  snapshot: ScheduleSnapshot,
  now: Date,
): Promise<void> {
  const startedAt = station.broadcast_state === "RUNNING" ? now : null;
  const updated = await client.query(
    `UPDATE stations
        SET active_schedule_id = $1, schedule_started_at = $2,
            pending_schedule_id = NULL, pending_activation_at = NULL,
            paused_schedule_id = NULL, paused_cycle_offset_ms = NULL,
            paused_cycle_number = NULL, updated_at = now()
      WHERE id = $3 AND active_schedule_id IS NOT DISTINCT FROM $4`,
    [snapshot.id, startedAt, station.id, station.active_schedule_id],
  );
  if (!updated.rowCount) throw new Error("Station schedule changed while publishing.");
}

async function queueSnapshot(
  client: PoolClient,
  station: PublicationStation,
  snapshot: ScheduleSnapshot,
  activationAt: Date | null,
): Promise<void> {
  const updated = await client.query(
    `UPDATE stations
        SET pending_schedule_id = $1, pending_activation_at = $2, updated_at = now()
      WHERE id = $3 AND active_schedule_id IS NOT DISTINCT FROM $4`,
    [snapshot.id, activationAt, station.id, station.active_schedule_id],
  );
  if (!updated.rowCount) throw new Error("Station schedule changed while queueing publication.");
}

export async function publishEditableSchedule(
  client: PoolClient,
  stationId: string,
  timing: "immediate" | "next-loop",
  now?: Date,
): Promise<PublicationChange> {
  const locked = await lockPublicationStation(client, stationId, now);
  if (!locked.station) throw new Error("Station not found.");
  const effectiveNow = locked.now;
  const snapshot = await createScheduleSnapshot(client, locked.station);
  if (!snapshot) throw new Error("A schedule requires at least one ready playlist item.");
  const station = locked.station;
  const canQueue = timing === "next-loop" && Boolean(station.active_schedule_id)
    && (station.broadcast_state === "STOPPED" || Boolean(station.schedule_started_at && station.active_total_duration_ms));
  if (!canQueue) {
    await activateSnapshot(client, station, snapshot, effectiveNow);
    return {
      activeChanged: true,
      pendingChanged: Boolean(station.pending_schedule_id),
      promoted: locked.promoted,
      scheduleId: snapshot.id,
      activationAt: station.broadcast_state === "RUNNING" ? effectiveNow : null,
      timing: "immediate",
    };
  }
  const activationAt = station.pending_schedule_id && station.pending_activation_at
    ? station.pending_activation_at
    : activationFor(station, effectiveNow);
  await queueSnapshot(client, station, snapshot, activationAt);
  return {
    activeChanged: locked.promoted,
    pendingChanged: true,
    promoted: locked.promoted,
    scheduleId: snapshot.id,
    activationAt,
    timing: "next-loop",
  };
}

export async function publishAfterScheduleMutation(
  client: PoolClient,
  stationId: string,
  now = new Date(),
): Promise<PublicationChange> {
  const station = await selectPublicationStation(client, stationId);
  if (!station) throw new Error("Station not found.");
  if (!station.auto_publish_next_loop) {
    return { activeChanged: false, pendingChanged: false, promoted: false };
  }

  let snapshot: ScheduleSnapshot | null;
  try {
    snapshot = await createScheduleSnapshot(client, station);
  } catch (error) {
    if (error instanceof HttpError && error.code === "TV_DELIVERY_NOT_READY") {
      return { activeChanged: false, pendingChanged: false, promoted: false };
    }
    throw error;
  }
  if (!snapshot) {
    if (!station.pending_schedule_id) return { activeChanged: false, pendingChanged: false, promoted: false };
    await client.query(
      `UPDATE stations SET pending_schedule_id = NULL, pending_activation_at = NULL, updated_at = now()
        WHERE id = $1 AND pending_schedule_id = $2`,
      [stationId, station.pending_schedule_id],
    );
    return { activeChanged: false, pendingChanged: true, promoted: false };
  }
  if (!station.active_schedule_id || (station.broadcast_state === "RUNNING" && (!station.schedule_started_at || !station.active_total_duration_ms))) {
    await activateSnapshot(client, station, snapshot, now);
    return { activeChanged: true, pendingChanged: Boolean(station.pending_schedule_id), promoted: false, scheduleId: snapshot.id, activationAt: station.broadcast_state === "RUNNING" ? now : null, timing: "immediate" };
  }
  const activationAt = station.pending_schedule_id && station.pending_activation_at
    ? station.pending_activation_at
    : activationFor(station, now);
  await queueSnapshot(client, station, snapshot, activationAt);
  return { activeChanged: false, pendingChanged: true, promoted: false, scheduleId: snapshot.id, activationAt, timing: "next-loop" };
}

export async function publishScheduleRefresh(stationId: string): Promise<void> {
  invalidateGuideCatalogCache();
  await publishStationEvent(stationId, { type: "station.updated", data: { schedule: true } });
}

export async function promoteDueStation(stationId: string, now?: Date): Promise<boolean> {
  const promoted = await transaction(async (client) => (await lockPublicationStation(client, stationId, now)).promoted);
  if (promoted) await publishScheduleRefresh(stationId);
  return promoted;
}

export async function promoteAllDueStations(now?: Date): Promise<string[]> {
  const promoted = await transaction(async (client) => {
    const dueStations = await client.query<PendingScheduleStation>(
      `SELECT id, broadcast_state, active_schedule_id, pending_schedule_id,
              pending_activation_at, schedule_started_at
         FROM stations
         WHERE programming_mode = 'LEGACY_LOOP' AND broadcast_state = 'RUNNING' AND pending_schedule_id IS NOT NULL
          AND pending_activation_at IS NOT NULL
          AND pending_activation_at <= COALESCE($1::timestamptz, clock_timestamp())
        ORDER BY id FOR UPDATE`,
      [now ?? null],
    );
    const effectiveNow = now
      ?? (await client.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0].now;
    const ids: string[] = [];
    for (const station of dueStations.rows) {
      if ((await promotePendingLocked(client, station, effectiveNow)).promoted) ids.push(station.id);
    }
    return ids;
  });
  await Promise.all(promoted.map(publishScheduleRefresh));
  return promoted;
}
