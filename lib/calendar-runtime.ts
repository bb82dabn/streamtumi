import { query } from "@/lib/db";
import type { StationKind } from "@/lib/station-kind";

const PLAYOUT_FRESHNESS_MS = 15_000;

export type CalendarRuntimeSourceRole = "BASELINE" | "PRIMARY" | "FALLBACK";
export type CalendarRuntimeSourceKind =
  | "TV_SCHEDULE"
  | "RADIO_CLOCK_BLOCK"
  | "NONE";
export type CalendarRuntimeEventKind =
  | "PROGRAM"
  | "PREMIERE"
  | "OFFLINE";

export type CalendarRadioOccurrenceItem = {
  id: string;
  clockReleaseId: string;
  clockBlockId: string;
  clockItemId: string;
  startsAt: Date;
  endsAt: Date;
  sourceOffsetMs: number;
  playbackDurationMs: number;
};

export type CalendarRuntimeSource =
  | { kind: "NONE" }
  | { kind: "TV_SCHEDULE"; scheduleId: string; epochAt: Date }
  | {
      kind: "RADIO_CLOCK_BLOCK";
      clockReleaseId: string;
      clockBlockId: string | null;
      anchorAt: Date | null;
      item: CalendarRadioOccurrenceItem | null;
    };

export type CalendarRuntimeOccurrence = {
  id: string;
  calendarReleaseId: string;
  releaseEventId: string;
  title: string;
  eventKind: CalendarRuntimeEventKind;
  priority: number;
  startsAt: Date;
  endsAt: Date | null;
  source: CalendarRuntimeSource;
  fallbackSource: CalendarRuntimeSource;
};

export type CalendarRuntimePlayoutState = {
  observedSource: string | null;
  calendarReleaseId: string | null;
  occurrenceId: string | null;
  sourceRole: CalendarRuntimeSourceRole | null;
  freshAt: Date | null;
};

export type CalendarRuntimeSelectionInput = {
  stationId: string;
  stationKind: StationKind;
  requestedAt: Date;
  activeProfileId: string;
  profileStrategy: string;
  profileLifecycle: string;
  activeCalendarReleaseId: string;
  releaseId: string;
  releaseProfileId: string;
  materialization: {
    releaseId: string;
    status: string;
    horizonFrom: Date | null;
    materializedThrough: Date | null;
  };
  pendingCalendarReleaseId: string | null;
  pendingCalendarActivationAt: Date | null;
  baselineSource: CalendarRuntimeSource;
  occurrences: readonly CalendarRuntimeOccurrence[];
  nextOccurrenceAt: Date | null;
  playoutState: CalendarRuntimePlayoutState | null;
};

export type CalendarRuntimeActual = {
  status: "PLAYING" | "FALLBACK";
  sourceRole: CalendarRuntimeSourceRole;
  source: CalendarRuntimeSource;
  observedAt: Date;
  occurrenceId: string | null;
};

export type CalendarRuntimeResolution = {
  stationId: string;
  stationKind: StationKind;
  requestedAt: Date;
  profileId: string;
  calendarReleaseId: string;
  materializedThrough: Date;
  occurrence: CalendarRuntimeOccurrence | null;
  baselineSource: CalendarRuntimeSource;
  source: CalendarRuntimeSource;
  fallbackSource: CalendarRuntimeSource;
  desiredSource: CalendarRuntimeSource;
  desiredSourceRole: CalendarRuntimeSourceRole | null;
  plannedStatus: "IDLE" | "PLAYING" | "OFFLINE";
  actual: CalendarRuntimeActual | null;
  nextBoundaryAt: Date | null;
};

function time(value: Date): number {
  return value.getTime();
}

function fresh(value: Date | null, requestedAt: Date, maximumAgeMs: number): value is Date {
  if (!value) return false;
  const age = time(requestedAt) - time(value);
  return Number.isFinite(age) && age >= 0 && age <= maximumAgeMs;
}

function activeAt(occurrence: CalendarRuntimeOccurrence, requestedAt: Date): boolean {
  return time(occurrence.startsAt) <= time(requestedAt)
    && (occurrence.endsAt === null || time(occurrence.endsAt) > time(requestedAt));
}

function compareOccurrences(left: CalendarRuntimeOccurrence, right: CalendarRuntimeOccurrence): number {
  return right.priority - left.priority
    || time(right.startsAt) - time(left.startsAt)
    || left.id.localeCompare(right.id);
}

function sourceForRole(
  role: CalendarRuntimeSourceRole,
  occurrence: CalendarRuntimeOccurrence | null,
  baseline: CalendarRuntimeSource,
): CalendarRuntimeSource {
  if (role === "BASELINE") return baseline;
  if (!occurrence) return { kind: "NONE" };
  if (role === "PRIMARY") return occurrence.source;
  return occurrence.fallbackSource.kind === "NONE"
    ? baseline
    : occurrence.fallbackSource;
}

function matchingPlayoutState(
  input: CalendarRuntimeSelectionInput,
  occurrence: CalendarRuntimeOccurrence | null,
): CalendarRuntimeActual | null {
  const state = input.playoutState;
  if (!state || !fresh(state.freshAt, input.requestedAt, PLAYOUT_FRESHNESS_MS)) return null;
  if (state.calendarReleaseId !== input.activeCalendarReleaseId || !state.sourceRole) return null;
  if (state.occurrenceId !== (occurrence?.id ?? null)) return null;

  const actualSource = sourceForRole(state.sourceRole, occurrence, input.baselineSource);
  if (actualSource.kind === "NONE" || occurrence?.eventKind === "OFFLINE") return null;

  if (state.observedSource !== "AUTOMATION" && state.observedSource !== "CLOCK") return null;
  return {
    status: state.sourceRole === "FALLBACK" ? "FALLBACK" : "PLAYING",
    sourceRole: state.sourceRole,
    source: actualSource,
    observedAt: state.freshAt,
    occurrenceId: occurrence?.id ?? null,
  };
}

function earliestBoundary(requestedAt: Date, candidates: readonly (Date | null)[]): Date | null {
  let earliest: Date | null = null;
  for (const candidate of candidates) {
    if (!candidate || !Number.isFinite(time(candidate))) continue;
    const bounded = time(candidate) < time(requestedAt) ? requestedAt : candidate;
    if (!earliest || time(bounded) < time(earliest)) earliest = bounded;
  }
  return earliest;
}

/**
 * Pure runtime selection and normalization. It deliberately repeats the SQL
 * coherence checks so mocked callers and future query changes fail closed.
 */
export function selectAndNormalizeCalendarRuntime(
  input: CalendarRuntimeSelectionInput,
): CalendarRuntimeResolution | null {
  const requestedMs = time(input.requestedAt);
  const horizonFrom = input.materialization.horizonFrom;
  const materializedThrough = input.materialization.materializedThrough;
  if (!Number.isFinite(requestedMs)
    || input.profileStrategy !== "CALENDAR_EVENTS"
    || input.profileLifecycle !== "ACTIVE"
    || input.activeProfileId !== input.releaseProfileId
    || input.activeCalendarReleaseId !== input.releaseId
    || input.releaseId !== input.materialization.releaseId
    || input.materialization.status !== "READY"
    || !horizonFrom
    || !materializedThrough
    || time(horizonFrom) > requestedMs
    || time(materializedThrough) <= requestedMs) {
    return null;
  }

  const occurrence = input.occurrences
    .filter((candidate) => candidate.calendarReleaseId === input.releaseId
      && activeAt(candidate, input.requestedAt))
    .sort(compareOccurrences)[0] ?? null;
  const source = occurrence?.source ?? input.baselineSource;
  const fallbackSource = occurrence?.fallbackSource ?? { kind: "NONE" as const };
  const actual = matchingPlayoutState(input, occurrence);

  let desiredSource = source;
  let desiredSourceRole: CalendarRuntimeSourceRole | null = occurrence ? "PRIMARY" : "BASELINE";
  let plannedStatus: CalendarRuntimeResolution["plannedStatus"] = source.kind === "NONE" ? "IDLE" : "PLAYING";
  if (occurrence?.eventKind === "OFFLINE") {
    desiredSource = { kind: "NONE" };
    desiredSourceRole = null;
    plannedStatus = "OFFLINE";
  }

  const futureCandidateStart = input.occurrences
    .map((candidate) => candidate.startsAt)
    .filter((startsAt) => time(startsAt) > requestedMs)
    .sort((left, right) => time(left) - time(right))[0] ?? null;
  const pendingActivation = input.pendingCalendarReleaseId
    && input.pendingCalendarActivationAt
    ? input.pendingCalendarActivationAt
    : null;

  return {
    stationId: input.stationId,
    stationKind: input.stationKind,
    requestedAt: input.requestedAt,
    profileId: input.activeProfileId,
    calendarReleaseId: input.activeCalendarReleaseId,
    materializedThrough,
    occurrence,
    baselineSource: input.baselineSource,
    source,
    fallbackSource,
    desiredSource,
    desiredSourceRole,
    plannedStatus,
    actual,
    nextBoundaryAt: earliestBoundary(input.requestedAt, [
      occurrence?.endsAt ?? null,
      input.nextOccurrenceAt,
      futureCandidateStart,
      pendingActivation,
      materializedThrough,
    ]),
  };
}

type CalendarRuntimeDbRow = {
  station_id: string;
  station_kind: StationKind;
  active_programming_profile_id: string;
  profile_strategy: string;
  profile_lifecycle: string;
  active_calendar_release_id: string;
  release_id: string;
  release_profile_id: string;
  materialization_release_id: string;
  materialization_status: string;
  horizon_from: Date;
  materialized_through: Date;
  pending_calendar_release_id: string | null;
  pending_calendar_activation_at: Date | null;
  active_schedule_id: string | null;
  schedule_started_at: Date | null;
  active_clock_release_id: string | null;
  radio_release_changed_at: Date | null;
  occurrence_id: string | null;
  occurrence_release_id: string | null;
  release_event_id: string | null;
  event_title: string | null;
  event_kind: CalendarRuntimeEventKind | null;
  priority: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  source_kind: CalendarRuntimeSourceKind | null;
  source_tv_schedule_id: string | null;
  source_clock_release_id: string | null;
  source_clock_block_id: string | null;
  fallback_source_kind: CalendarRuntimeSourceKind | null;
  fallback_tv_schedule_id: string | null;
  fallback_clock_release_id: string | null;
  fallback_clock_block_id: string | null;
  primary_item_id: string | null;
  primary_item_clock_release_id: string | null;
  primary_item_clock_block_id: string | null;
  primary_item_clock_item_id: string | null;
  primary_item_starts_at: Date | null;
  primary_item_ends_at: Date | null;
  primary_item_source_offset_ms: string | null;
  primary_item_playback_duration_ms: string | null;
  fallback_item_id: string | null;
  fallback_item_clock_release_id: string | null;
  fallback_item_clock_block_id: string | null;
  fallback_item_clock_item_id: string | null;
  fallback_item_starts_at: Date | null;
  fallback_item_ends_at: Date | null;
  fallback_item_source_offset_ms: string | null;
  fallback_item_playback_duration_ms: string | null;
  next_occurrence_at: Date | null;
  actual_observed_source: string | null;
  actual_calendar_release_id: string | null;
  actual_occurrence_id: string | null;
  actual_source_role: CalendarRuntimeSourceRole | null;
  actual_fresh_at: Date | null;
};

function safeNonnegativeInteger(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function radioItemFromRow(
  row: CalendarRuntimeDbRow,
  role: "primary" | "fallback",
): CalendarRadioOccurrenceItem | null {
  const id = role === "primary" ? row.primary_item_id : row.fallback_item_id;
  const clockReleaseId = role === "primary"
    ? row.primary_item_clock_release_id
    : row.fallback_item_clock_release_id;
  const clockBlockId = role === "primary"
    ? row.primary_item_clock_block_id
    : row.fallback_item_clock_block_id;
  const clockItemId = role === "primary"
    ? row.primary_item_clock_item_id
    : row.fallback_item_clock_item_id;
  const startsAt = role === "primary" ? row.primary_item_starts_at : row.fallback_item_starts_at;
  const endsAt = role === "primary" ? row.primary_item_ends_at : row.fallback_item_ends_at;
  const sourceOffsetMs = safeNonnegativeInteger(role === "primary"
    ? row.primary_item_source_offset_ms
    : row.fallback_item_source_offset_ms);
  const playbackDurationMs = safeNonnegativeInteger(role === "primary"
    ? row.primary_item_playback_duration_ms
    : row.fallback_item_playback_duration_ms);
  if (!id || !clockReleaseId || !clockBlockId || !clockItemId || !startsAt || !endsAt
    || sourceOffsetMs === null || playbackDurationMs === null || playbackDurationMs === 0) return null;
  return { id, clockReleaseId, clockBlockId, clockItemId, startsAt, endsAt, sourceOffsetMs, playbackDurationMs };
}

function eventSourceFromRow(
  row: CalendarRuntimeDbRow,
  role: "primary" | "fallback",
): CalendarRuntimeSource {
  const fallback = role === "fallback";
  const kind = fallback ? row.fallback_source_kind : row.source_kind;
  if (kind === "TV_SCHEDULE") {
    const scheduleId = fallback ? row.fallback_tv_schedule_id : row.source_tv_schedule_id;
    return scheduleId && row.starts_at
      ? { kind, scheduleId, epochAt: row.starts_at }
      : { kind: "NONE" };
  }
  if (kind === "RADIO_CLOCK_BLOCK") {
    const clockReleaseId = fallback ? row.fallback_clock_release_id : row.source_clock_release_id;
    const clockBlockId = fallback ? row.fallback_clock_block_id : row.source_clock_block_id;
    const item = radioItemFromRow(row, role);
    return clockReleaseId && clockBlockId && item
      ? { kind, clockReleaseId, clockBlockId, anchorAt: row.starts_at, item }
      : { kind: "NONE" };
  }
  return { kind: "NONE" };
}

function baselineSourceFromRow(row: CalendarRuntimeDbRow): CalendarRuntimeSource {
  if (row.station_kind === "TV" && row.active_schedule_id && row.schedule_started_at) {
    return { kind: "TV_SCHEDULE", scheduleId: row.active_schedule_id, epochAt: row.schedule_started_at };
  }
  if (row.station_kind === "RADIO" && row.active_clock_release_id) {
    return {
      kind: "RADIO_CLOCK_BLOCK",
      clockReleaseId: row.active_clock_release_id,
      clockBlockId: null,
      anchorAt: row.radio_release_changed_at,
      item: null,
    };
  }
  return { kind: "NONE" };
}

function occurrenceFromRow(row: CalendarRuntimeDbRow): CalendarRuntimeOccurrence | null {
  if (!row.occurrence_id || !row.occurrence_release_id || !row.release_event_id
    || !row.event_title || !row.event_kind || row.priority === null || !row.starts_at) return null;
  return {
    id: row.occurrence_id,
    calendarReleaseId: row.occurrence_release_id,
    releaseEventId: row.release_event_id,
    title: row.event_title,
    eventKind: row.event_kind,
    priority: row.priority,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    source: eventSourceFromRow(row, "primary"),
    fallbackSource: eventSourceFromRow(row, "fallback"),
  };
}

function playoutStateFromRow(row: CalendarRuntimeDbRow): CalendarRuntimePlayoutState | null {
  if (!row.actual_fresh_at && !row.actual_calendar_release_id && !row.actual_occurrence_id) return null;
  return {
    observedSource: row.actual_observed_source,
    calendarReleaseId: row.actual_calendar_release_id,
    occurrenceId: row.actual_occurrence_id,
    sourceRole: row.actual_source_role,
    freshAt: row.actual_fresh_at,
  };
}

function inputFromRows(
  rows: readonly CalendarRuntimeDbRow[],
  requestedAt: Date,
): CalendarRuntimeSelectionInput {
  const first = rows[0];
  return {
    stationId: first.station_id,
    stationKind: first.station_kind,
    requestedAt,
    activeProfileId: first.active_programming_profile_id,
    profileStrategy: first.profile_strategy,
    profileLifecycle: first.profile_lifecycle,
    activeCalendarReleaseId: first.active_calendar_release_id,
    releaseId: first.release_id,
    releaseProfileId: first.release_profile_id,
    materialization: {
      releaseId: first.materialization_release_id,
      status: first.materialization_status,
      horizonFrom: first.horizon_from,
      materializedThrough: first.materialized_through,
    },
    pendingCalendarReleaseId: first.pending_calendar_release_id,
    pendingCalendarActivationAt: first.pending_calendar_activation_at,
    baselineSource: baselineSourceFromRow(first),
    occurrences: rows.flatMap((row) => {
      const occurrence = occurrenceFromRow(row);
      return occurrence ? [occurrence] : [];
    }),
    nextOccurrenceAt: first.next_occurrence_at,
    playoutState: playoutStateFromRow(first),
  };
}

const calendarRuntimeSql = `
  WITH eligible AS (
    SELECT station.id AS station_id, station.station_kind,
           station.active_programming_profile_id,
           profile.strategy::text AS profile_strategy,
           profile.lifecycle::text AS profile_lifecycle,
           station.active_calendar_release_id,
           release.id AS release_id, release.profile_id AS release_profile_id,
           materialization.release_id AS materialization_release_id,
           materialization.status::text AS materialization_status,
           materialization.horizon_from, materialization.materialized_through,
           station.pending_calendar_release_id,
           station.pending_calendar_activation_at,
           station.active_schedule_id, station.schedule_started_at,
           station.active_clock_release_id, station.radio_release_changed_at
      FROM stations station
      JOIN station_programming_profiles profile
        ON profile.station_id = station.id
       AND profile.id = station.active_programming_profile_id
       AND profile.strategy = 'CALENDAR_EVENTS'
       AND profile.lifecycle = 'ACTIVE'
      JOIN calendar_releases release
        ON release.station_id = station.id
       AND release.id = station.active_calendar_release_id
       AND release.profile_id = profile.id
      JOIN calendar_release_materialization_state materialization
        ON materialization.station_id = station.id
       AND materialization.release_id = release.id
       AND materialization.status = 'READY'
       AND materialization.horizon_from <= $2::timestamptz
       AND materialization.materialized_through > $2::timestamptz
     WHERE station.id = ANY($1::uuid[])
  )
  SELECT eligible.*,
         occurrence.id AS occurrence_id,
         occurrence.release_id AS occurrence_release_id,
         occurrence.release_event_id,
         event.title AS event_title, event.event_kind, event.priority,
         occurrence.starts_at, occurrence.ends_at,
         event.source_kind, event.source_tv_schedule_id,
         event.source_clock_release_id, event.source_clock_block_id,
         event.fallback_source_kind, event.fallback_tv_schedule_id,
         event.fallback_clock_release_id, event.fallback_clock_block_id,
         primary_item.id AS primary_item_id,
         CASE WHEN primary_item.id IS NOT NULL
              THEN event.source_clock_release_id END AS primary_item_clock_release_id,
         primary_item.release_block_id AS primary_item_clock_block_id,
         primary_item.release_item_id AS primary_item_clock_item_id,
         primary_item.starts_at AS primary_item_starts_at,
         primary_item.ends_at AS primary_item_ends_at,
         primary_item.source_offset_ms::text AS primary_item_source_offset_ms,
         primary_item.playback_duration_ms::text AS primary_item_playback_duration_ms,
         fallback_item.id AS fallback_item_id,
         CASE WHEN fallback_item.id IS NOT NULL
              THEN event.fallback_clock_release_id END AS fallback_item_clock_release_id,
         fallback_item.release_block_id AS fallback_item_clock_block_id,
         fallback_item.release_item_id AS fallback_item_clock_item_id,
         fallback_item.starts_at AS fallback_item_starts_at,
         fallback_item.ends_at AS fallback_item_ends_at,
         fallback_item.source_offset_ms::text AS fallback_item_source_offset_ms,
         fallback_item.playback_duration_ms::text AS fallback_item_playback_duration_ms,
         next_occurrence.starts_at AS next_occurrence_at,
         CASE WHEN eligible.station_kind = 'TV' THEN tv_state.observed_source
              ELSE radio_state.program_source END AS actual_observed_source,
         CASE WHEN eligible.station_kind = 'TV' THEN tv_state.calendar_release_id
              ELSE radio_state.calendar_release_id END AS actual_calendar_release_id,
         CASE WHEN eligible.station_kind = 'TV' THEN tv_state.occurrence_id
              ELSE radio_state.occurrence_id END AS actual_occurrence_id,
         CASE WHEN eligible.station_kind = 'TV' THEN tv_state.source_role
              ELSE radio_state.source_role END AS actual_source_role,
         CASE WHEN eligible.station_kind = 'TV' THEN tv_state.updated_at
              ELSE radio_state.heartbeat_at END AS actual_fresh_at
    FROM eligible
    LEFT JOIN calendar_occurrences occurrence
      ON occurrence.station_id = eligible.station_id
     AND occurrence.release_id = eligible.release_id
     AND occurrence.starts_at <= $2::timestamptz
     AND (occurrence.ends_at IS NULL OR occurrence.ends_at > $2::timestamptz)
    LEFT JOIN calendar_release_events event
      ON event.station_id = occurrence.station_id
     AND event.release_id = occurrence.release_id
     AND event.id = occurrence.release_event_id
    LEFT JOIN LATERAL (
      SELECT item.*
        FROM calendar_radio_occurrence_items item
       WHERE item.station_id = occurrence.station_id
         AND item.release_id = occurrence.release_id
         AND item.occurrence_id = occurrence.id
         AND item.source_role = 'PRIMARY'
         AND item.starts_at <= $2::timestamptz
         AND item.ends_at > $2::timestamptz
       ORDER BY item.starts_at DESC, item.id
       LIMIT 1
    ) primary_item ON true
    LEFT JOIN LATERAL (
      SELECT item.*
        FROM calendar_radio_occurrence_items item
       WHERE item.station_id = occurrence.station_id
         AND item.release_id = occurrence.release_id
         AND item.occurrence_id = occurrence.id
         AND item.source_role = 'EVENT_FALLBACK'
         AND item.starts_at <= $2::timestamptz
         AND item.ends_at > $2::timestamptz
       ORDER BY item.starts_at DESC, item.id
       LIMIT 1
    ) fallback_item ON true
    LEFT JOIN LATERAL (
      SELECT future.starts_at
        FROM calendar_occurrences future
       WHERE future.station_id = eligible.station_id
         AND future.release_id = eligible.release_id
         AND future.starts_at > $2::timestamptz
       ORDER BY future.starts_at, future.id
       LIMIT 1
    ) next_occurrence ON true
    LEFT JOIN tv_playout_state tv_state
      ON eligible.station_kind = 'TV' AND tv_state.station_id = eligible.station_id
    LEFT JOIN radio_playout_state radio_state
      ON eligible.station_kind = 'RADIO' AND radio_state.station_id = eligible.station_id
   ORDER BY eligible.station_id, event.priority DESC,
            occurrence.starts_at DESC, occurrence.id`;

export async function resolveCalendarRuntimes(
  stationIds: readonly string[],
  requestedAt = new Date(),
): Promise<CalendarRuntimeResolution[]> {
  const uniqueStationIds = [...new Set(stationIds)];
  if (!uniqueStationIds.length) return [];
  if (!Number.isFinite(time(requestedAt))) throw new Error("Calendar runtime time is invalid.");
  const result = await query<CalendarRuntimeDbRow>(calendarRuntimeSql, [uniqueStationIds, requestedAt]);
  const byStation = new Map<string, CalendarRuntimeDbRow[]>();
  for (const row of result.rows) {
    const rows = byStation.get(row.station_id);
    if (rows) rows.push(row);
    else byStation.set(row.station_id, [row]);
  }
  const resolved = new Map<string, CalendarRuntimeResolution>();
  for (const [stationId, rows] of byStation) {
    const runtime = selectAndNormalizeCalendarRuntime(inputFromRows(rows, requestedAt));
    if (runtime) resolved.set(stationId, runtime);
  }
  return uniqueStationIds.flatMap((stationId) => {
    const runtime = resolved.get(stationId);
    return runtime ? [runtime] : [];
  });
}

export async function resolveCalendarRuntime(
  stationId: string,
  requestedAt = new Date(),
): Promise<CalendarRuntimeResolution | null> {
  return (await resolveCalendarRuntimes([stationId], requestedAt))[0] ?? null;
}
