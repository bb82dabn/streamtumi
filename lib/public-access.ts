import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { hashToken, safeEqual } from "@/lib/crypto";
import { query, transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { mobilePlaybackGrantFromRequest } from "@/lib/mobile-playback-grant";
import { promotePendingLocked, publishScheduleRefresh } from "@/lib/schedule-publication";
import { roomKeyLookupHash } from "@/lib/station-rooms";
import type { PlaybackOrder } from "@/lib/schedule";
import type { ProgrammingMode, StationKind } from "@/lib/station-kind";
import type {
  CalendarRuntimeResolution,
  CalendarRuntimeSourceRole,
} from "@/lib/calendar-runtime";
import {
  loadTvJournalWindow,
  type TvLoadedJournalWindowSegment,
} from "@/lib/tv-segment-journal";

export type PublicStation = {
  id: string;
  playback_type: "conventional" | "WEATHERSTAR_4000";
  station_kind: StationKind;
  programming_mode: ProgrammingMode;
  time_zone: string;
  active_clock_release_id: string | null;
  previous_clock_release_id: string | null;
  radio_release_changed_at: Date | null;
  radio_delivery_mode: "PLAYOUT" | "STATIC_HLS";
  tv_delivery_mode: "LEGACY_VOD" | "CHANNEL_HLS";
  tv_channel_rendition_mode: "DUAL" | "HD_ONLY";
  name: string;
  description: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  transition_ms: number;
  playback_order: PlaybackOrder;
  auto_publish_next_loop: boolean;
  access_password_hash: string | null;
  room_access_generation: string | null;
  active_schedule_id: string | null;
  pending_schedule_id: string | null;
  pending_activation_at: Date | null;
  schedule_started_at: Date | null;
  logo_key: string | null;
  offline_slate_key: string | null;
  owner_id: string;
  broadcast_state: "RUNNING" | "STOPPED";
  deleted_at: Date | null;
  moderation_status: "ACTIVE" | "RESTRICTED";
  visibility: "PRIVATE" | "PUBLIC";
  genre_id: string;
  owner_declared_explicit: boolean;
  explicit_enforced_at: Date | null;
  genre_is_explicit: boolean;
  effective_explicit: boolean;
};

export type PublicCalendarRuntime = Readonly<{
  occurrenceRef: string | null;
  planned: Readonly<{
    title: string;
    kind: "PROGRAM" | "PREMIERE" | "OFFLINE";
    startsAt: string;
    endsAt: string | null;
  }> | null;
  desiredSourceRole: CalendarRuntimeSourceRole | null;
  actual: Readonly<{
    status: "PLAYING" | "FALLBACK";
    sourceRole: CalendarRuntimeSourceRole;
    freshAt: string;
  }> | null;
  fallbackStatus: "NONE" | "READY" | "ACTIVE";
  nextBoundaryAt: string | null;
}>;

function opaqueCalendarRef(kind: "occurrence" | "radio-item" | "tv-generation", stationId: string, id: string): string {
  return `cal_${createHmac("sha256", env().APP_SECRET)
    .update(`public-calendar:${kind}:${stationId}:${id}`)
    .digest("base64url")
    .slice(0, 24)}`;
}

export function publicCalendarRadioItemRef(stationId: string, itemId: string): string {
  return opaqueCalendarRef("radio-item", stationId, itemId);
}

export function matchesPublicCalendarRadioItemRef(stationId: string, itemId: string, ref: string): boolean {
  return safeEqual(publicCalendarRadioItemRef(stationId, itemId), ref);
}

export function presentPublicCalendarRuntime(runtime: CalendarRuntimeResolution): PublicCalendarRuntime {
  const occurrence = runtime.occurrence;
  const fallbackActive = runtime.actual?.status === "FALLBACK";
  const fallbackReady = runtime.fallbackSource.kind !== "NONE";
  return {
    occurrenceRef: occurrence ? opaqueCalendarRef("occurrence", runtime.stationId, occurrence.id) : null,
    planned: occurrence ? {
      title: occurrence.title,
      kind: occurrence.eventKind,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt?.toISOString() ?? null,
    } : null,
    desiredSourceRole: runtime.desiredSourceRole,
    actual: runtime.actual ? {
      status: runtime.actual.status,
      sourceRole: runtime.actual.sourceRole,
      freshAt: runtime.actual.observedAt.toISOString(),
    } : null,
    fallbackStatus: fallbackActive ? "ACTIVE" : fallbackReady ? "READY" : "NONE",
    nextBoundaryAt: runtime.nextBoundaryAt?.toISOString() ?? null,
  };
}

function cookieName(token: string): string {
  return `cl_access_${hashToken(token).slice(0, 12)}`;
}

function cookieValue(token: string, accessGeneration = "legacy"): string {
  const value = accessGeneration === "legacy"
    ? `station-access:${token}`
    : `station-access:v2:${token}:${accessGeneration}`;
  return createHmac("sha256", env().APP_SECRET).update(value).digest("base64url");
}

export async function grantPublicAccess(token: string, accessGeneration = "legacy"): Promise<void> {
  (await cookies()).set(cookieName(token), cookieValue(token, accessGeneration), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/public/stations/${token}`,
    maxAge: 86_400,
  });
}

export async function grantStationRoomLinkAccess(token: string): Promise<void> {
  const station = await stationByToken(token, false);
  if (station.access_password_hash || !station.room_access_generation) return;
  await grantPublicAccess(token, station.room_access_generation);
}

export async function hasPublicAccess(
  token: string,
  stationId?: string,
  request?: Request,
  accessGeneration = "legacy",
): Promise<boolean> {
  const value = (await cookies()).get(cookieName(token))?.value;
  if (value && safeEqual(value, cookieValue(token, accessGeneration))) return true;
  return Boolean(request && stationId && mobilePlaybackGrantFromRequest(request, token, stationId, Date.now(), accessGeneration));
}

export async function stationByToken(token: string, requirePassword = true, request?: Request): Promise<PublicStation> {
  const result = await query<PublicStation>(
    `SELECT s.id, s.owner_id, s.name, s.description, COALESCE(s.playback_type, 'conventional') AS playback_type, s.station_kind, s.programming_mode, s.time_zone, s.active_clock_release_id, s.previous_clock_release_id, s.radio_release_changed_at, s.radio_delivery_mode, s.tv_delivery_mode, s.tv_channel_rendition_mode,
             s.mode, s.transition_ms, s.playback_order,
             s.auto_publish_next_loop, s.access_password_hash, room.generation AS room_access_generation,
             s.active_schedule_id, s.pending_schedule_id, s.pending_activation_at,
             s.schedule_started_at, s.logo_key, s.offline_slate_key, s.broadcast_state,
             s.deleted_at, s.moderation_status, s.visibility, s.genre_id,
             s.owner_declared_explicit, s.explicit_enforced_at, g.is_explicit AS genre_is_explicit,
             (s.owner_declared_explicit OR s.explicit_enforced_at IS NOT NULL OR g.is_explicit) AS effective_explicit
       FROM stations s JOIN station_genres g ON g.id = s.genre_id
       LEFT JOIN station_room_access room ON room.station_id = s.id
      WHERE s.access_token_hash = $1 AND s.access_enabled = true
        AND COALESCE(s.playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')
        AND s.deleted_at IS NULL AND s.moderation_status = 'ACTIVE'
        AND (s.access_expires_at IS NULL OR s.access_expires_at > now())`,
    [hashToken(token)],
  );
  const station = result.rows[0];
  if (!station) throw new HttpError(404, "This station link is unavailable or has expired.", "STATION_UNAVAILABLE");
  const accessGeneration = station.room_access_generation ?? "legacy";
  if (requirePassword && (station.access_password_hash || station.room_access_generation)
    && !(await hasPublicAccess(token, station.id, request, accessGeneration))) {
    throw new HttpError(401, station.room_access_generation ? "This station requires a six-digit room key." : "This station requires a password.", station.room_access_generation ? "ACCESS_KEY_REQUIRED" : "PASSWORD_REQUIRED");
  }
  return station;
}

export async function authenticateStationPassword(token: string, password: string): Promise<PublicStation> {
  const station = await stationByToken(token, false);
  if (station.room_access_generation || !station.access_password_hash || !(await compare(password, station.access_password_hash))) {
    throw new HttpError(401, "The station password is incorrect.", "INVALID_PASSWORD");
  }
  return station;
}

export async function verifyStationPassword(token: string, password: string): Promise<void> {
  await authenticateStationPassword(token, password);
  await grantPublicAccess(token);
}

export async function authenticateStationRoomKey(token: string, accessKey: string): Promise<PublicStation> {
  const station = await stationByToken(token, false);
  if (!station.room_access_generation) {
    throw new HttpError(401, "The room key is incorrect.", "INVALID_ACCESS_KEY");
  }
  const access = await query(
    `SELECT 1 FROM station_room_access
      WHERE station_id = $1 AND generation = $2 AND code_lookup_hash = $3`,
    [station.id, station.room_access_generation, roomKeyLookupHash(accessKey)],
  );
  if (!access.rowCount) throw new HttpError(401, "The room key is incorrect.", "INVALID_ACCESS_KEY");
  return station;
}

export async function verifyStationRoomKey(token: string, accessKey: string): Promise<void> {
  const station = await authenticateStationRoomKey(token, accessKey);
  await grantPublicAccess(token, station.room_access_generation ?? "legacy");
}

export async function resolvePublicStation(token: string, request?: Request): Promise<PublicStation> {
  const initial = await stationByToken(token, true, request);
  const now = new Date();
  if (initial.broadcast_state !== "RUNNING" || !initial.pending_schedule_id || !initial.pending_activation_at || initial.pending_activation_at > now) return initial;
  const resolved = await transaction(async (client) => {
    const locked = await client.query<PublicStation>(
      `SELECT s.id, s.owner_id, s.name, s.description, COALESCE(s.playback_type, 'conventional') AS playback_type, s.station_kind, s.programming_mode, s.time_zone, s.active_clock_release_id, s.previous_clock_release_id, s.radio_release_changed_at, s.radio_delivery_mode, s.tv_delivery_mode, s.tv_channel_rendition_mode,
               s.mode, s.transition_ms, s.playback_order,
              s.auto_publish_next_loop, s.access_password_hash, room.generation AS room_access_generation, s.active_schedule_id,
              s.pending_schedule_id, s.pending_activation_at, s.schedule_started_at,
              s.logo_key, s.offline_slate_key, s.broadcast_state, s.deleted_at,
              s.moderation_status, s.visibility, s.genre_id, s.owner_declared_explicit,
              s.explicit_enforced_at, g.is_explicit AS genre_is_explicit,
              (s.owner_declared_explicit OR s.explicit_enforced_at IS NOT NULL OR g.is_explicit) AS effective_explicit
         FROM stations s JOIN station_genres g ON g.id = s.genre_id
         LEFT JOIN station_room_access room ON room.station_id = s.id
        WHERE s.id = $1 AND s.access_token_hash = $2 AND s.access_enabled = true
          AND COALESCE(s.playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')
          AND s.deleted_at IS NULL AND s.moderation_status = 'ACTIVE'
          AND (s.access_expires_at IS NULL OR s.access_expires_at > now())
        FOR UPDATE OF s`,
      [initial.id, hashToken(token)],
    );
    const current = locked.rows[0];
    if (!current) throw new HttpError(404, "This station link is unavailable or has expired.", "STATION_UNAVAILABLE");
    const promotion = await promotePendingLocked(client, current, now);
    if (!promotion.promoted) return { station: current, promoted: false };
    return {
      station: {
        ...current,
        active_schedule_id: promotion.station.active_schedule_id,
        pending_schedule_id: promotion.station.pending_schedule_id,
        pending_activation_at: promotion.station.pending_activation_at,
        schedule_started_at: promotion.station.schedule_started_at,
      },
      promoted: true,
    };
  });
  if (resolved.promoted) await publishScheduleRefresh(resolved.station.id);
  return resolved.station;
}

export type PublicTvChannelReadiness = {
  status: "AVAILABLE" | "STARTING" | "FAILED" | "STOPPED";
  version: string;
  renditionMode: "DUAL" | "HD_ONLY";
  segments: TvLoadedJournalWindowSegment[];
};

export type PublicTvChannelProgram =
  {
    kind: "TV_AUTOMATION";
    itemId: string;
    title: string;
  };

type TvChannelProgramRow = {
  video_id: string | null;
  automation_title: string | null;
};

function tvChannelVersion(
  station: PublicStation,
  segment?: TvLoadedJournalWindowSegment,
  calendarRuntime?: CalendarRuntimeResolution | null,
): string {
  const scheduleId = station.active_schedule_id;
  const epochMs = station.schedule_started_at?.getTime();
  const epoch = epochMs !== undefined && Number.isFinite(epochMs) ? epochMs : "pending";
  const fence = segment?.playoutFence;
  if (!segment) {
    const version = `${scheduleId ?? "unpublished"}:${epoch}:${station.tv_channel_rendition_mode}`;
    return calendarRuntime
      ? opaqueCalendarRef("tv-generation", station.id, version)
      : version;
  }
  const segmentEpochMs = segment.automationEpochAt?.getTime();
  const segmentEpoch = segmentEpochMs !== undefined && Number.isFinite(segmentEpochMs) ? segmentEpochMs : epoch;
  const generation = segment.sourceGeneration
    ?? `automation:${segment.scheduleId ?? scheduleId ?? "unknown"}:${segmentEpoch}`;
  const version = `${Number.isSafeInteger(fence) && Number(fence) > 0 ? fence : "pending"}:${generation}:${station.tv_channel_rendition_mode}`;
  return calendarRuntime
    ? opaqueCalendarRef("tv-generation", station.id, version)
    : version;
}

export async function resolvePublicTvChannelProgram(stationId: string): Promise<PublicTvChannelProgram | null> {
  const result = await query<TvChannelProgramRow>(
    `SELECT item.video_id, item.title AS automation_title
       FROM tv_segment_journal journal
       JOIN schedules automation_schedule
         ON automation_schedule.id = journal.automation_schedule_id
        AND automation_schedule.station_id = journal.station_id
       JOIN schedule_items item
         ON item.id = journal.automation_schedule_item_id
        AND item.schedule_id = automation_schedule.id
      WHERE journal.station_id = $1
        AND journal.source_kind = 'AUTOMATION'
        AND journal.starts_at <= clock_timestamp()
        AND journal.ends_at > clock_timestamp()
      ORDER BY journal.starts_at DESC LIMIT 1`,
    [stationId],
  );
  const row = result.rows[0];
  return row?.video_id && row.automation_title
    ? { kind: "TV_AUTOMATION", itemId: row.video_id, title: row.automation_title }
    : null;
}

function validTvChannelWindow(
  segments: TvLoadedJournalWindowSegment[],
  renditionMode: "DUAL" | "HD_ONLY",
): boolean {
  for (const [index, segment] of segments.entries()) {
    const lowUri = "360p" in segment.uris ? segment.uris["360p"] : null;
    if (!Number.isSafeInteger(segment.mediaSequence) || segment.mediaSequence < 0
        || !Number.isSafeInteger(segment.discontinuitySequence) || segment.discontinuitySequence < 0
        || !Number.isInteger(segment.durationMs) || segment.durationMs < 1 || segment.durationMs > 2000
        || !Number.isSafeInteger(segment.playoutFence) || Number(segment.playoutFence) < 1
        || !segment.uris["720p"] || /[\r\n]/.test(segment.uris["720p"])
        || (renditionMode === "DUAL" && (!lowUri || /[\r\n]/.test(lowUri)))) return false;
    const startsAt = segment.startsAt.getTime();
    const endsAt = segment.endsAt.getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt - startsAt !== segment.durationMs) return false;
    if (index === 0) continue;
    const previous = segments[index - 1];
    if (segment.mediaSequence !== previous.mediaSequence + 1) return false;
    if (segment.discontinuitySequence !== previous.discontinuitySequence + (previous.discontinuity ? 1 : 0)) return false;
    if (startsAt < previous.endsAt.getTime()) return false;
    if (startsAt > previous.endsAt.getTime() && !segment.discontinuity) return false;
  }
  return true;
}

export async function resolvePublicTvChannelReadiness(
  station: PublicStation,
  now = new Date(),
  calendarRuntime: CalendarRuntimeResolution | null = null,
): Promise<PublicTvChannelReadiness> {
  const scheduleId = station.active_schedule_id;
  const renditionMode = station.tv_channel_rendition_mode;
  if (station.broadcast_state !== "RUNNING" || calendarRuntime?.plannedStatus === "OFFLINE") {
    return { status: "STOPPED", version: tvChannelVersion(station, undefined, calendarRuntime), renditionMode, segments: [] };
  }
  if ((!scheduleId || !station.schedule_started_at) && !calendarRuntime) {
    return { status: "STARTING", version: tvChannelVersion(station), renditionMode, segments: [] };
  }

  const loaded = await loadTvJournalWindow(station.id);
  const nowMs = now.getTime();
  const currentIndex = loaded.findIndex((segment) => segment.startsAt.getTime() <= nowMs && segment.endsAt.getTime() > nowMs);
  const current = currentIndex < 0 ? undefined : loaded[currentIndex];
  if (!current) {
    const status = loaded[0]?.startsAt.getTime() > nowMs ? "STARTING" : loaded.length ? "FAILED" : "STARTING";
    return { status, version: tvChannelVersion(station, loaded[loaded.length - 1], calendarRuntime), renditionMode, segments: [] };
  }

  const sameProvenance = (segment: TvLoadedJournalWindowSegment) => (
    segment.playoutFence === current.playoutFence
    && segment.calendarReleaseId === current.calendarReleaseId
    && segment.occurrenceId === current.occurrenceId
    && segment.sourceRole === current.sourceRole
    && (current.calendarReleaseId
      ? segment.automationEpochAt?.getTime() === current.automationEpochAt?.getTime()
      : segment.scheduleId === current.scheduleId)
  );
  let activeStart = currentIndex;
  let activeEnd = currentIndex + 1;
  while (activeStart > 0 && sameProvenance(loaded[activeStart - 1])) activeStart -= 1;
  while (activeEnd < loaded.length && sameProvenance(loaded[activeEnd])) activeEnd += 1;
  const segments = loaded.slice(activeStart, activeEnd);
  if (!validTvChannelWindow(segments, renditionMode)) {
    return { status: "FAILED", version: tvChannelVersion(station, current, calendarRuntime), renditionMode, segments: [] };
  }
  if (!calendarRuntime && station.schedule_started_at && station.schedule_started_at.getTime() > nowMs) {
    return { status: "STARTING", version: tvChannelVersion(station), renditionMode, segments: [] };
  }
  const version = tvChannelVersion(station, current, calendarRuntime);
  return { status: "AVAILABLE", version, renditionMode, segments };
}
