import { query, transaction } from "@/lib/db";
import type { CalendarRuntimeSourceRole } from "@/lib/calendar-runtime";
import { playlistForCycle, type PlaybackOrder } from "@/lib/schedule";
import type { TvPlayoutLease } from "@/lib/tv-playout-lease";

export type TvChannelRendition = "720p" | "360p";
export type TvAutomationSegmentPart = "CONTENT" | "TRANSITION";

export type TvAutomationInventorySegment = {
  segmentIndex: number;
  startOffsetMs: number;
  durationMs: number;
};

export type TvAutomationDescriptor = {
  id: string;
  durationMs: number;
  segments: TvAutomationInventorySegment[];
};

export type TvAutomationScheduleItem = {
  id: string;
  position: number;
  durationMs: number;
  derivativeId: string;
  transitionFillerId: string | null;
  content: TvAutomationDescriptor;
  transition: TvAutomationDescriptor | null;
};

export type TvAutomationSchedulePlan = {
  stationId: string;
  scheduleId: string;
  startedAt: Date;
  databaseNow: Date;
  totalDurationMs: number;
  transitionMs: number;
  playbackOrder: PlaybackOrder;
  shuffleSeed: string;
  items: TvAutomationScheduleItem[];
};

export type TvCalendarAppendContext = {
  calendarReleaseId: string;
  occurrenceId: string | null;
  sourceRole: CalendarRuntimeSourceRole;
  epochAt: Date;
};

type TvCalendarProvenance = {
  calendarReleaseId?: string | null;
  occurrenceId?: string | null;
  sourceRole?: CalendarRuntimeSourceRole | null;
  automationEpochAt?: Date | null;
};

export type TvPlannedJournalSegment = TvCalendarProvenance & {
  scheduleId: string;
  scheduleItemId: string;
  derivativeId: string;
  transitionFillerId: string | null;
  part: TvAutomationSegmentPart;
  descriptorId: string;
  descriptorSegmentIndex: number;
  startsAt: Date;
  endsAt: Date;
  durationMs: number;
  discontinuity: boolean;
};

export type TvJournalSourceKind = "AUTOMATION";

export type TvJournalTail = {
  mediaSequence: number;
  discontinuitySequence: number;
  discontinuity: boolean;
  startsAt: Date;
  endsAt: Date;
  scheduleId: string | null;
  sourceKind: TvJournalSourceKind;
  calendarReleaseId: string | null;
  occurrenceId: string | null;
  sourceRole: CalendarRuntimeSourceRole | null;
  automationEpochAt: Date | null;
};

type TvJournalWindowSegmentBase = {
  mediaSequence: number;
  discontinuitySequence: number;
  discontinuity: boolean;
  startsAt: Date;
  endsAt: Date;
  durationMs: number;
  scheduleId?: string | null;
  playoutFence?: number;
  sourceGeneration?: string;
  calendarReleaseId?: string | null;
  occurrenceId?: string | null;
  sourceRole?: CalendarRuntimeSourceRole | null;
  automationEpochAt?: Date | null;
};

export type TvDualJournalWindowSegment = TvJournalWindowSegmentBase & {
  sourceKind?: TvJournalSourceKind;
  renditionMode?: "DUAL";
  availableRenditions?: readonly ["720p", "360p"];
  uris: Record<TvChannelRendition, string>;
};

export type TvJournalWindowSegment = TvDualJournalWindowSegment;
export type TvLoadedJournalWindowSegment = TvDualJournalWindowSegment;

type ScheduleItemRow = {
  station_id: string;
  schedule_id: string;
  schedule_started_at: Date;
  database_now: Date;
  total_duration_ms: string;
  transition_ms: number;
  playback_order: PlaybackOrder;
  shuffle_seed: string;
  schedule_item_id: string;
  position: number;
  item_duration_ms: string;
  derivative_id: string;
  transition_filler_id: string | null;
  content_descriptor_id: string;
  transition_descriptor_id: string | null;
};

type InventoryRow = {
  descriptor_id: string;
  descriptor_duration_ms: string;
  segment_count: number;
  rendition: TvChannelRendition;
  segment_index: number;
  start_offset_ms: string;
  duration_ms: number;
};

type TailRow = {
  media_sequence: string;
  discontinuity_sequence: string;
  discontinuity: boolean;
  starts_at: Date;
  ends_at: Date;
  automation_schedule_id: string | null;
  source_kind: TvJournalSourceKind;
  calendar_release_id: string | null;
  occurrence_id: string | null;
  calendar_source_role: CalendarRuntimeSourceRole | null;
  automation_epoch_at: Date | null;
};

type WindowRow = TailRow & {
  duration_ms: number;
  playout_fence: string;
  high_object_key: string;
  low_object_key: string;
};

const maximumAppendSegments = 120;

function safeInteger(value: string | number, description: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${description} is outside the supported range.`);
  return parsed;
}

function validDate(value: Date, description: string): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new Error(`${description} is invalid.`);
  return milliseconds;
}

function validateJournalIntervals(
  tail: TvJournalTail | null,
  segments: readonly { startsAt: Date; endsAt: Date; durationMs: number; discontinuity: boolean }[],
  minimumDurationMs: number,
  maximumDurationMs: number,
): void {
  let previousEnd = tail?.endsAt.getTime() ?? null;
  for (const segment of segments) {
    const startsAt = validDate(segment.startsAt, "TV journal segment start");
    const endsAt = validDate(segment.endsAt, "TV journal segment end");
    if (!Number.isInteger(segment.durationMs) || segment.durationMs < minimumDurationMs
        || segment.durationMs > maximumDurationMs || endsAt - startsAt !== segment.durationMs) {
      throw new Error("TV journal segment timestamps are outside the source contract's exact half-open interval bounds.");
    }
    if (previousEnd !== null && startsAt < previousEnd) throw new Error("TV journal append would overlap an existing segment.");
    if (previousEnd !== null && startsAt > previousEnd && !segment.discontinuity) {
      throw new Error("A gap in the TV journal requires a discontinuity.");
    }
    previousEnd = endsAt;
  }
}

function withSourceBoundary<T extends { discontinuity: boolean }>(
  sourceKind: TvJournalSourceKind,
  tail: TvJournalTail | null,
  segments: readonly T[],
  calendarContext?: TvCalendarAppendContext,
): T[] {
  const calendarBoundary = sourceKind === "AUTOMATION" && Boolean(tail) && (
    tail?.calendarReleaseId !== (calendarContext?.calendarReleaseId ?? null)
    || tail?.occurrenceId !== (calendarContext?.occurrenceId ?? null)
    || tail?.sourceRole !== (calendarContext?.sourceRole ?? null)
    || tail?.automationEpochAt?.getTime() !== calendarContext?.epochAt.getTime()
  );
  if (!segments.length || !tail
      || (tail.sourceKind === sourceKind && !calendarBoundary)
      || segments[0].discontinuity) return [...segments];
  return [{ ...segments[0], discontinuity: true }, ...segments.slice(1)];
}

function validateCalendarAppendContext(context: TvCalendarAppendContext): void {
  validDate(context.epochAt, "TV calendar automation epoch");
  if (!context.calendarReleaseId) throw new Error("TV calendar append requires an active release.");
  if (context.sourceRole === "BASELINE" && context.occurrenceId !== null) {
    throw new Error("TV calendar baseline append cannot claim an occurrence.");
  }
  if (context.sourceRole !== "BASELINE" && !context.occurrenceId) {
    throw new Error("TV calendar event append requires an occurrence.");
  }
}

function validateDescriptor(descriptor: TvAutomationDescriptor, expectedDurationMs: number): void {
  if (descriptor.durationMs !== expectedDurationMs || descriptor.durationMs < 1) {
    throw new Error("TV automation descriptor duration does not match its pinned schedule source.");
  }
  if (!descriptor.segments.length) throw new Error("TV automation descriptor has no segments.");
  let offset = 0;
  for (const [index, segment] of descriptor.segments.entries()) {
    if (segment.segmentIndex !== index || segment.startOffsetMs !== offset) {
      throw new Error("TV automation descriptor segments are not contiguous from zero.");
    }
    if (!Number.isInteger(segment.durationMs) || segment.durationMs < 1 || segment.durationMs > 2000) {
      throw new Error("TV automation descriptor contains an invalid segment duration.");
    }
    offset += segment.durationMs;
  }
  if (offset !== descriptor.durationMs) throw new Error("TV automation descriptor inventory has the wrong duration.");
}

function validateSchedulePlan(schedule: TvAutomationSchedulePlan): void {
  validDate(schedule.startedAt, "TV schedule start");
  if (!schedule.items.length) throw new Error("TV automation schedule has no items.");
  if (!Number.isInteger(schedule.transitionMs) || schedule.transitionMs < 0 || schedule.transitionMs > 10_000) {
    throw new Error("TV automation schedule has an invalid transition duration.");
  }
  let totalDurationMs = 0;
  const positions = new Set<number>();
  for (const item of schedule.items) {
    if (positions.has(item.position)) throw new Error("TV automation schedule item positions are duplicated.");
    positions.add(item.position);
    validateDescriptor(item.content, item.durationMs);
    if (schedule.transitionMs === 0) {
      if (item.transition || item.transitionFillerId) throw new Error("TV automation schedule unexpectedly pins a transition filler.");
    } else {
      if (!item.transition || !item.transitionFillerId) throw new Error("TV automation schedule is missing a transition filler.");
      validateDescriptor(item.transition, schedule.transitionMs);
    }
    totalDurationMs += item.durationMs + schedule.transitionMs;
  }
  if (totalDurationMs !== schedule.totalDurationMs) throw new Error("TV automation schedule total duration is inconsistent.");
}

function componentsForCycle(schedule: TvAutomationSchedulePlan, cycleNumber: number) {
  const ordered = playlistForCycle(
    [...schedule.items].sort((left, right) => left.position - right.position),
    schedule.playbackOrder,
    schedule.shuffleSeed,
    cycleNumber,
  );
  return ordered.flatMap((item) => [
    { item, part: "CONTENT" as const, descriptor: item.content },
    ...(item.transition ? [{ item, part: "TRANSITION" as const, descriptor: item.transition }] : []),
  ]);
}

export function planTvJournalSegments(
  schedule: TvAutomationSchedulePlan,
  input: { from: Date; through: Date; maxSegments: number },
): TvPlannedJournalSegment[] {
  validateSchedulePlan(schedule);
  const requestedFrom = validDate(input.from, "TV journal planning start");
  const through = validDate(input.through, "TV journal planning end");
  if (!Number.isInteger(input.maxSegments) || input.maxSegments < 1 || input.maxSegments > maximumAppendSegments) {
    throw new Error(`TV journal planning is limited to ${maximumAppendSegments} segments.`);
  }
  if (through <= requestedFrom) return [];

  const scheduleStart = schedule.startedAt.getTime();
  const from = Math.max(requestedFrom, scheduleStart);
  let cycleNumber = Math.floor(Math.max(0, from - scheduleStart) / schedule.totalDurationMs);
  let cycleStartsAt = scheduleStart + cycleNumber * schedule.totalDurationMs;
  const planned: TvPlannedJournalSegment[] = [];

  while (planned.length < input.maxSegments && cycleStartsAt < through) {
    let componentStartsAt = cycleStartsAt;
    for (const component of componentsForCycle(schedule, cycleNumber)) {
      for (const segment of component.descriptor.segments) {
        const startsAt = componentStartsAt + segment.startOffsetMs;
        const endsAt = startsAt + segment.durationMs;
        if (endsAt <= from) continue;
        if (startsAt >= through) return planned;
        planned.push({
          scheduleId: schedule.scheduleId,
          scheduleItemId: component.item.id,
          derivativeId: component.item.derivativeId,
          transitionFillerId: component.item.transitionFillerId,
          part: component.part,
          descriptorId: component.descriptor.id,
          descriptorSegmentIndex: segment.segmentIndex,
          startsAt: new Date(startsAt),
          endsAt: new Date(endsAt),
          durationMs: segment.durationMs,
          discontinuity: segment.segmentIndex === 0,
        });
        if (planned.length === input.maxSegments) return planned;
      }
      componentStartsAt += component.descriptor.durationMs;
    }
    cycleNumber += 1;
    cycleStartsAt += schedule.totalDurationMs;
  }
  return planned;
}

export function planTvJournalCatchUp(
  schedule: TvAutomationSchedulePlan,
  input: {
    now: Date;
    tailEndsAt: Date | null;
    maxCatchUpMs: number;
    aheadMs: number;
    maxSegments: number;
    through?: Date;
  },
): TvPlannedJournalSegment[] {
  const now = validDate(input.now, "TV journal reconciliation time");
  if (!Number.isInteger(input.maxCatchUpMs) || input.maxCatchUpMs < 0) throw new Error("TV journal catch-up bound is invalid.");
  if (!Number.isInteger(input.aheadMs) || input.aheadMs < 1) throw new Error("TV journal look-ahead is invalid.");
  const tail = input.tailEndsAt ? validDate(input.tailEndsAt, "TV journal tail") : null;
  const from = Math.max(now - input.maxCatchUpMs, tail ?? Number.NEGATIVE_INFINITY);
  const boundary = input.through ? validDate(input.through, "TV journal planning boundary") : Number.POSITIVE_INFINITY;
  const through = Math.min(now + input.aheadMs, boundary);
  if (from >= through) return [];
  let planned = planTvJournalSegments(schedule, {
    from: new Date(from),
    through: new Date(through),
    maxSegments: input.maxSegments,
  });
  if (tail !== null) planned = planned.filter((segment) => segment.startsAt.getTime() >= tail);
  if (!planned.length) return planned;
  const firstNeedsBoundary = tail === null || planned[0].startsAt.getTime() > tail;
  if (firstNeedsBoundary && !planned[0].discontinuity) {
    planned = [{ ...planned[0], discontinuity: true }, ...planned.slice(1)];
  }
  return planned;
}

export async function loadTvAutomationSchedulePlan(
  stationId: string,
  scheduleId: string,
  startedAt?: Date,
): Promise<TvAutomationSchedulePlan | null> {
  if (startedAt) validDate(startedAt, "TV calendar schedule start");
  const metadata = await query<ScheduleItemRow>(
    `SELECT station.id AS station_id, schedule.id AS schedule_id,
            COALESCE($3::timestamptz, station.schedule_started_at) AS schedule_started_at,
            clock_timestamp() AS database_now,
            schedule.total_duration_ms::text, schedule.transition_ms,
            schedule.playback_order, schedule.shuffle_seed::text,
            item.id AS schedule_item_id, item.position, item.duration_ms::text AS item_duration_ms,
            delivery.derivative_id, delivery.transition_filler_id,
            derivative.descriptor_id AS content_descriptor_id,
            filler.descriptor_id AS transition_descriptor_id
       FROM stations station
       JOIN schedules schedule ON schedule.id = $2 AND schedule.station_id = station.id
       JOIN schedule_items item ON item.schedule_id = schedule.id
       JOIN tv_schedule_item_delivery delivery ON delivery.schedule_item_id = item.id
       JOIN tv_channel_derivatives derivative ON derivative.id = delivery.derivative_id
       LEFT JOIN tv_channel_transition_fillers filler ON filler.id = delivery.transition_filler_id
      WHERE station.id = $1
         AND station.station_kind = 'TV' AND station.programming_mode = 'LEGACY_LOOP'
        AND station.tv_delivery_mode = 'CHANNEL_HLS' AND station.broadcast_state = 'RUNNING'
         AND station.schedule_started_at IS NOT NULL
         AND station.schedule_started_at <= clock_timestamp() + interval '30 seconds'
         AND ($3::timestamptz IS NOT NULL OR schedule.id = station.active_schedule_id)
        AND station.deleted_at IS NULL AND station.moderation_status = 'ACTIVE'
        AND schedule.total_duration_ms = (
          SELECT sum(candidate.duration_ms + schedule.transition_ms)
            FROM schedule_items candidate WHERE candidate.schedule_id = schedule.id
        )
        AND NOT EXISTS (
          SELECT 1
            FROM schedule_items candidate
            LEFT JOIN tv_schedule_item_delivery candidate_delivery
              ON candidate_delivery.schedule_item_id = candidate.id
            LEFT JOIN tv_channel_derivatives candidate_derivative
              ON candidate_derivative.id = candidate_delivery.derivative_id
            LEFT JOIN tv_channel_delivery_descriptors candidate_descriptor
              ON candidate_descriptor.id = candidate_derivative.descriptor_id
            LEFT JOIN tv_channel_transition_fillers candidate_filler
              ON candidate_filler.id = candidate_delivery.transition_filler_id
           WHERE candidate.schedule_id = schedule.id
             AND (candidate_delivery.schedule_item_id IS NULL
               OR candidate_descriptor.profile IS DISTINCT FROM 'tv-channel-v1'
               OR candidate_descriptor.duration_ms IS DISTINCT FROM candidate.duration_ms
               OR (schedule.transition_ms = 0 AND candidate_delivery.transition_filler_id IS NOT NULL)
               OR (schedule.transition_ms > 0 AND (
                 candidate_filler.id IS NULL
                 OR candidate_filler.station_id IS DISTINCT FROM station.id
                 OR candidate_filler.transition_ms IS DISTINCT FROM schedule.transition_ms
               )))
        )
      ORDER BY item.position`,
    [stationId, scheduleId, startedAt ?? null],
  );
  if (!metadata.rows.length) return null;

  const descriptorIds = [...new Set(metadata.rows.flatMap((row) => [row.content_descriptor_id, row.transition_descriptor_id]).filter((id): id is string => Boolean(id)))];
  const inventory = await query<InventoryRow>(
    `SELECT descriptor.id AS descriptor_id, descriptor.duration_ms::text AS descriptor_duration_ms,
            descriptor.segment_count, segment.rendition, segment.segment_index,
            segment.start_offset_ms::text, segment.duration_ms
       FROM tv_channel_delivery_descriptors descriptor
       JOIN tv_channel_delivery_segments segment ON segment.descriptor_id = descriptor.id
      WHERE descriptor.id = ANY($1::uuid[]) AND descriptor.profile = 'tv-channel-v1'
      ORDER BY descriptor.id, segment.segment_index, segment.rendition`,
    [descriptorIds],
  );

  const descriptorRows = new Map<string, InventoryRow[]>();
  for (const row of inventory.rows) {
    const rows = descriptorRows.get(row.descriptor_id) ?? [];
    rows.push(row);
    descriptorRows.set(row.descriptor_id, rows);
  }
  const descriptors = new Map<string, TvAutomationDescriptor>();
  for (const descriptorId of descriptorIds) {
    const rows = descriptorRows.get(descriptorId) ?? [];
    if (!rows.length) throw new Error("Pinned TV automation descriptor inventory is missing.");
    const first = rows[0];
    const byIndex = new Map<number, InventoryRow[]>();
    for (const row of rows) {
      const segmentRows = byIndex.get(row.segment_index) ?? [];
      segmentRows.push(row);
      byIndex.set(row.segment_index, segmentRows);
    }
    if (byIndex.size !== first.segment_count) throw new Error("Pinned TV automation descriptor inventory is incomplete.");
    const segments = [...byIndex.entries()].sort(([left], [right]) => left - right).map(([segmentIndex, segmentRows]) => {
      const high = segmentRows.find((row) => row.rendition === "720p");
      const low = segmentRows.find((row) => row.rendition === "360p");
      if (!high || !low || high.duration_ms !== low.duration_ms || high.start_offset_ms !== low.start_offset_ms) {
        throw new Error("Pinned TV automation rendition inventories are not aligned.");
      }
      return {
        segmentIndex,
        startOffsetMs: safeInteger(high.start_offset_ms, "TV automation segment offset"),
        durationMs: high.duration_ms,
      };
    });
    descriptors.set(descriptorId, {
      id: descriptorId,
      durationMs: safeInteger(first.descriptor_duration_ms, "TV automation descriptor duration"),
      segments,
    });
  }

  const first = metadata.rows[0];
  const items = metadata.rows.map((row) => {
    const content = descriptors.get(row.content_descriptor_id);
    const transition = row.transition_descriptor_id ? descriptors.get(row.transition_descriptor_id) : null;
    if (!content || (row.transition_descriptor_id && !transition)) throw new Error("Pinned TV automation descriptor could not be loaded.");
    return {
      id: row.schedule_item_id,
      position: row.position,
      durationMs: safeInteger(row.item_duration_ms, "TV schedule item duration"),
      derivativeId: row.derivative_id,
      transitionFillerId: row.transition_filler_id,
      content,
      transition: transition ?? null,
    };
  });
  const plan: TvAutomationSchedulePlan = {
    stationId: first.station_id,
    scheduleId: first.schedule_id,
    startedAt: first.schedule_started_at,
    databaseNow: first.database_now,
    totalDurationMs: safeInteger(first.total_duration_ms, "TV schedule duration"),
    transitionMs: first.transition_ms,
    playbackOrder: first.playback_order,
    shuffleSeed: first.shuffle_seed,
    items,
  };
  validateSchedulePlan(plan);
  return plan;
}

function tailFromRow(row: TailRow): TvJournalTail {
  return {
    mediaSequence: safeInteger(row.media_sequence, "TV media sequence"),
    discontinuitySequence: safeInteger(row.discontinuity_sequence, "TV discontinuity sequence"),
    discontinuity: row.discontinuity,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    scheduleId: row.automation_schedule_id,
    sourceKind: row.source_kind ?? "AUTOMATION",
    calendarReleaseId: row.calendar_release_id ?? null,
    occurrenceId: row.occurrence_id ?? null,
    sourceRole: row.calendar_source_role ?? null,
    automationEpochAt: row.automation_epoch_at ?? null,
  };
}

export async function latestTvJournalSegment(stationId: string): Promise<TvJournalTail | null> {
  const result = await query<TailRow>(
    `SELECT media_sequence::text, discontinuity_sequence::text, discontinuity,
             starts_at, ends_at, automation_schedule_id, source_kind,
             calendar_release_id, occurrence_id, calendar_source_role,
             automation_epoch_at
       FROM tv_segment_journal journal
      WHERE journal.station_id = $1
      ORDER BY journal.media_sequence DESC LIMIT 1`,
    [stationId],
  );
  return result.rows[0] ? tailFromRow(result.rows[0]) : null;
}

export async function loadTvJournalWindow(stationId: string, limit = 12): Promise<TvLoadedJournalWindowSegment[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("TV journal window limit must be between 1 and 100.");
  const result = await query<WindowRow>(
    `WITH recent AS (
       SELECT journal.* FROM tv_segment_journal journal
        WHERE journal.station_id = $1
        ORDER BY journal.media_sequence DESC LIMIT $2
     )
      SELECT recent.media_sequence::text, recent.discontinuity_sequence::text,
             recent.discontinuity, recent.starts_at, recent.ends_at,
             recent.source_kind, recent.calendar_release_id, recent.occurrence_id,
             recent.calendar_source_role, recent.automation_epoch_at,
             recent.automation_schedule_id,
             recent.duration_ms, recent.playout_fence::text,
             automation_high.object_key AS high_object_key,
             automation_low.object_key AS low_object_key
       FROM recent
       JOIN tv_channel_delivery_segments automation_high
         ON automation_high.descriptor_id = recent.descriptor_id
        AND automation_high.segment_index = recent.descriptor_segment_index
        AND automation_high.rendition = '720p'
       JOIN tv_channel_delivery_segments automation_low
         ON automation_low.descriptor_id = recent.descriptor_id
        AND automation_low.segment_index = recent.descriptor_segment_index
        AND automation_low.rendition = '360p'
      WHERE recent.source_kind = 'AUTOMATION'
      ORDER BY recent.media_sequence`,
    [stationId, limit],
  );
  return result.rows.map((row): TvLoadedJournalWindowSegment => {
    const common = {
      ...tailFromRow(row),
      durationMs: row.duration_ms,
      playoutFence: safeInteger(row.playout_fence, "TV playout fence"),
      sourceGeneration: `automation:${row.automation_schedule_id}:${row.calendar_release_id ?? "legacy"}:${row.occurrence_id ?? "none"}:${row.calendar_source_role ?? "none"}:${row.automation_epoch_at?.toISOString() ?? "none"}`,
    };
    return {
      ...common,
      sourceKind: "AUTOMATION",
      renditionMode: "DUAL",
      availableRenditions: ["720p", "360p"],
      uris: { "720p": row.high_object_key, "360p": row.low_object_key },
    };
  });
}

export async function appendTvJournalSegments(
  lease: TvPlayoutLease,
  segments: readonly TvPlannedJournalSegment[],
  calendarContext?: TvCalendarAppendContext,
): Promise<TvJournalTail[]> {
  if (!segments.length) return [];
  if (segments.length > maximumAppendSegments) throw new Error(`A TV journal append is limited to ${maximumAppendSegments} segments.`);
  const scheduleId = segments[0].scheduleId;
  if (segments.some((segment) => segment.scheduleId !== scheduleId)) throw new Error("A TV journal append cannot span schedules.");
  if (calendarContext) validateCalendarAppendContext(calendarContext);

  return transaction(async (client) => {
    const station = calendarContext
      ? await client.query(
        `SELECT station.active_schedule_id
           FROM stations station
           JOIN schedules baseline
             ON baseline.id = station.active_schedule_id AND baseline.station_id = station.id
           JOIN schedules schedule
             ON schedule.id = $2 AND schedule.station_id = station.id
           JOIN station_programming_profiles profile
             ON profile.id = station.active_programming_profile_id
            AND profile.station_id = station.id
            AND profile.strategy = 'CALENDAR_EVENTS' AND profile.lifecycle = 'ACTIVE'
           JOIN calendar_releases release
             ON release.id = station.active_calendar_release_id
            AND release.station_id = station.id AND release.profile_id = profile.id
            AND release.id = $3
           JOIN calendar_release_materialization_state materialization
             ON materialization.station_id = station.id AND materialization.release_id = release.id
            AND materialization.status = 'READY'
            AND materialization.horizon_from <= clock_timestamp()
            AND materialization.materialized_through > clock_timestamp()
           LEFT JOIN LATERAL (
             SELECT occurrence.id, occurrence.starts_at, event.event_kind,
                    event.source_kind, event.source_tv_schedule_id,
                    event.fallback_source_kind, event.fallback_tv_schedule_id
               FROM calendar_occurrences occurrence
               JOIN calendar_release_events event
                 ON event.station_id = occurrence.station_id
                AND event.release_id = occurrence.release_id
                AND event.id = occurrence.release_event_id
              WHERE occurrence.station_id = station.id
                AND occurrence.release_id = release.id
                AND occurrence.starts_at <= $7::timestamptz
                AND (occurrence.ends_at IS NULL OR occurrence.ends_at > $7::timestamptz)
              ORDER BY event.priority DESC, occurrence.starts_at DESC, occurrence.id
              LIMIT 1
           ) runtime_occurrence ON true
          WHERE station.id = $1
            AND station.station_kind = 'TV' AND station.programming_mode = 'LEGACY_LOOP'
            AND station.tv_delivery_mode = 'CHANNEL_HLS' AND station.broadcast_state = 'RUNNING'
            AND station.schedule_started_at IS NOT NULL
            AND station.schedule_started_at <= clock_timestamp() + interval '30 seconds'
            AND station.deleted_at IS NULL AND station.moderation_status = 'ACTIVE'
            AND EXISTS (SELECT 1 FROM schedule_items item WHERE item.schedule_id = baseline.id)
            AND NOT EXISTS (
              SELECT 1 FROM schedule_items item
              LEFT JOIN tv_schedule_item_delivery delivery ON delivery.schedule_item_id = item.id
              WHERE item.schedule_id = baseline.id AND delivery.schedule_item_id IS NULL
            )
            AND EXISTS (SELECT 1 FROM schedule_items item WHERE item.schedule_id = schedule.id)
            AND NOT EXISTS (
              SELECT 1 FROM schedule_items item
              LEFT JOIN tv_schedule_item_delivery delivery ON delivery.schedule_item_id = item.id
              WHERE item.schedule_id = schedule.id AND delivery.schedule_item_id IS NULL
            )
             AND (
               ($5::calendar_source_role = 'BASELINE' AND $4::uuid IS NULL
                 AND station.active_schedule_id = schedule.id
                 AND station.schedule_started_at = $6::timestamptz
                 AND runtime_occurrence.id IS NULL)
               OR ($5::calendar_source_role = 'PRIMARY'
                 AND runtime_occurrence.id = $4::uuid
                 AND runtime_occurrence.starts_at = $6::timestamptz
                 AND runtime_occurrence.event_kind IN ('PROGRAM', 'PREMIERE')
                 AND runtime_occurrence.source_kind = 'TV_SCHEDULE'
                 AND runtime_occurrence.source_tv_schedule_id = schedule.id)
             )
          FOR UPDATE OF station`,
        [lease.stationId, scheduleId, calendarContext.calendarReleaseId,
          calendarContext.occurrenceId, calendarContext.sourceRole, calendarContext.epochAt,
          segments[0].startsAt],
      )
      : await client.query(
        `SELECT station.active_schedule_id
         FROM stations station
         JOIN schedules schedule
           ON schedule.id = station.active_schedule_id AND schedule.station_id = station.id
        WHERE station.id = $1 AND station.active_schedule_id = $2
          AND station.station_kind = 'TV' AND station.programming_mode = 'LEGACY_LOOP'
          AND station.tv_delivery_mode = 'CHANNEL_HLS' AND station.broadcast_state = 'RUNNING'
           AND station.schedule_started_at IS NOT NULL
           AND station.schedule_started_at <= clock_timestamp() + interval '30 seconds'
          AND station.deleted_at IS NULL AND station.moderation_status = 'ACTIVE'
          AND EXISTS (SELECT 1 FROM schedule_items item WHERE item.schedule_id = schedule.id)
          AND NOT EXISTS (
            SELECT 1 FROM schedule_items item
            LEFT JOIN tv_schedule_item_delivery delivery ON delivery.schedule_item_id = item.id
            WHERE item.schedule_id = schedule.id AND delivery.schedule_item_id IS NULL
          )
         FOR UPDATE OF station`,
        [lease.stationId, scheduleId],
      );
    if (!station.rowCount) {
      throw new Error(calendarContext
        ? "TV journal append rejected a stale calendar release, occurrence, source, or schedule."
        : "TV journal append rejected a stale lease, fence, or active schedule.");
    }

    const fencedLease = await client.query(
      `SELECT lease.fence::text
         FROM tv_playout_leases lease
        WHERE lease.station_id = $1 AND lease.holder_id = $2 AND lease.fence = $3
          AND lease.lease_until > clock_timestamp()
        FOR UPDATE OF lease`,
      [lease.stationId, lease.holderId, lease.fence],
    );
    if (!fencedLease.rowCount) throw new Error("TV journal append rejected a stale lease, fence, or active schedule.");

    const tailResult = await client.query<TailRow>(
      `SELECT media_sequence::text, discontinuity_sequence::text, discontinuity,
               starts_at, ends_at, automation_schedule_id, source_kind,
               calendar_release_id, occurrence_id, calendar_source_role,
               automation_epoch_at
         FROM tv_segment_journal journal WHERE journal.station_id = $1
        ORDER BY journal.media_sequence DESC LIMIT 1
        FOR UPDATE OF journal`,
      [lease.stationId],
    );
    const tail = tailResult.rows[0] ? tailFromRow(tailResult.rows[0]) : null;
    const appendSegments = withSourceBoundary("AUTOMATION", tail, segments, calendarContext);
    validateJournalIntervals(tail, appendSegments, 1, 2_000);

    const requested = appendSegments.map((segment, ordinal) => ({
      ordinal,
      schedule_item_id: segment.scheduleItemId,
      derivative_id: segment.derivativeId,
      transition_filler_id: segment.transitionFillerId,
      part: segment.part,
      descriptor_id: segment.descriptorId,
      descriptor_segment_index: segment.descriptorSegmentIndex,
      duration_ms: segment.durationMs,
    }));
    const validated = await client.query<{ ordinal: number }>(
      `WITH requested AS (
         SELECT * FROM jsonb_to_recordset($2::jsonb) AS input(
           ordinal integer, schedule_item_id uuid, derivative_id uuid,
           transition_filler_id uuid, part tv_automation_segment_part,
           descriptor_id uuid, descriptor_segment_index integer, duration_ms integer
         )
       )
       SELECT requested.ordinal
         FROM requested
         JOIN schedule_items item
           ON item.id = requested.schedule_item_id AND item.schedule_id = $1
         JOIN tv_schedule_item_delivery delivery
           ON delivery.schedule_item_id = item.id
          AND delivery.derivative_id = requested.derivative_id
          AND delivery.transition_filler_id IS NOT DISTINCT FROM requested.transition_filler_id
         JOIN tv_channel_derivatives derivative
           ON derivative.id = delivery.derivative_id
         LEFT JOIN tv_channel_transition_fillers filler
           ON filler.id = delivery.transition_filler_id
         JOIN tv_channel_delivery_descriptors descriptor
           ON descriptor.id = requested.descriptor_id AND descriptor.profile = 'tv-channel-v1'
         JOIN tv_channel_delivery_segments high
           ON high.descriptor_id = descriptor.id
          AND high.rendition = '720p'
          AND high.segment_index = requested.descriptor_segment_index
          AND high.duration_ms = requested.duration_ms
         JOIN tv_channel_delivery_segments low
           ON low.descriptor_id = descriptor.id
          AND low.rendition = '360p'
          AND low.segment_index = requested.descriptor_segment_index
          AND low.duration_ms = requested.duration_ms
          AND low.start_offset_ms = high.start_offset_ms
        WHERE (requested.part = 'CONTENT' AND descriptor.id = derivative.descriptor_id)
           OR (requested.part = 'TRANSITION' AND filler.id IS NOT NULL AND descriptor.id = filler.descriptor_id)
        ORDER BY requested.ordinal`,
      [scheduleId, JSON.stringify(requested)],
    );
    if (validated.rows.length !== appendSegments.length
        || validated.rows.some((row, index) => row.ordinal !== index)) {
      throw new Error("TV journal append does not match the exact pinned derivative, filler, or segment inventory.");
    }

    let mediaSequence = (tail?.mediaSequence ?? -1) + 1;
    let discontinuitySequence = tail
      ? tail.discontinuitySequence + (tail.discontinuity ? 1 : 0)
      : 0;
    const persisted = appendSegments.map((segment, ordinal) => {
      const row = {
        ordinal,
        media_sequence: mediaSequence,
        discontinuity_sequence: discontinuitySequence,
        discontinuity: segment.discontinuity,
        starts_at: segment.startsAt.toISOString(),
        ends_at: segment.endsAt.toISOString(),
        duration_ms: segment.durationMs,
        schedule_item_id: segment.scheduleItemId,
        derivative_id: segment.derivativeId,
        transition_filler_id: segment.transitionFillerId,
        part: segment.part,
        descriptor_id: segment.descriptorId,
        descriptor_segment_index: segment.descriptorSegmentIndex,
      };
      mediaSequence += 1;
      if (segment.discontinuity) discontinuitySequence += 1;
      return row;
    });
    const inserted = await client.query(
      `WITH requested AS (
         SELECT * FROM jsonb_to_recordset($5::jsonb) AS input(
           ordinal integer, media_sequence bigint, discontinuity_sequence bigint,
           discontinuity boolean, starts_at timestamptz, ends_at timestamptz,
           duration_ms integer, schedule_item_id uuid, derivative_id uuid,
           transition_filler_id uuid, part tv_automation_segment_part,
           descriptor_id uuid, descriptor_segment_index integer
         )
       )
        INSERT INTO tv_segment_journal (
          station_id, media_sequence, discontinuity_sequence, discontinuity,
          starts_at, ends_at, duration_ms, playout_fence, source_kind,
          automation_schedule_id, automation_schedule_item_id, automation_derivative_id,
          automation_transition_filler_id, automation_part, descriptor_id, descriptor_segment_index,
          calendar_release_id, occurrence_id, calendar_source_role, automation_epoch_at
        )
       SELECT $1, requested.media_sequence, requested.discontinuity_sequence,
              requested.discontinuity, requested.starts_at, requested.ends_at,
              requested.duration_ms, $3, 'AUTOMATION', $4,
               requested.schedule_item_id, requested.derivative_id,
               requested.transition_filler_id, requested.part,
               requested.descriptor_id, requested.descriptor_segment_index,
               $6::uuid, $7::uuid, $8::calendar_source_role, $9::timestamptz
         FROM requested
         JOIN tv_playout_leases lease
           ON lease.station_id = $1 AND lease.holder_id = $2 AND lease.fence = $3
          AND lease.lease_until > clock_timestamp()
          JOIN stations station
             ON station.id = lease.station_id
             AND station.tv_delivery_mode = 'CHANNEL_HLS' AND station.broadcast_state = 'RUNNING'
         WHERE (($6::uuid IS NULL AND station.active_schedule_id = $4)
             OR ($6::uuid IS NOT NULL AND station.active_calendar_release_id = $6))
          ORDER BY requested.ordinal`,
      [lease.stationId, lease.holderId, lease.fence, scheduleId, JSON.stringify(persisted),
        calendarContext?.calendarReleaseId ?? null, calendarContext?.occurrenceId ?? null,
        calendarContext?.sourceRole ?? null, calendarContext?.epochAt ?? null],
    );
    if (inserted.rowCount !== appendSegments.length) throw new Error("TV journal append lost its lease or active schedule before commit.");

    await client.query(
      `INSERT INTO tv_playout_state
         (station_id, observed_source, lease_fence, calendar_release_id, occurrence_id,
           source_role, source_changed_at, updated_at)
          VALUES ($1, 'AUTOMATION', $2, $3::uuid, $4::uuid,
                   $5::calendar_source_role, now(), now())
         ON CONFLICT (station_id) DO UPDATE
            SET observed_source = 'AUTOMATION', lease_fence = EXCLUDED.lease_fence,
                calendar_release_id = EXCLUDED.calendar_release_id,
               occurrence_id = EXCLUDED.occurrence_id,
               source_role = EXCLUDED.source_role,
              source_changed_at = CASE
                WHEN tv_playout_state.observed_source <> 'AUTOMATION'
                  OR tv_playout_state.calendar_release_id IS DISTINCT FROM EXCLUDED.calendar_release_id
                  OR tv_playout_state.occurrence_id IS DISTINCT FROM EXCLUDED.occurrence_id
                  OR tv_playout_state.source_role IS DISTINCT FROM EXCLUDED.source_role
                THEN now() ELSE tv_playout_state.source_changed_at END,
              updated_at = now()`,
      [lease.stationId, lease.fence, calendarContext?.calendarReleaseId ?? null,
        calendarContext?.occurrenceId ?? null, calendarContext?.sourceRole ?? null],
    );

    return persisted.map((row) => ({
      mediaSequence: row.media_sequence,
      discontinuitySequence: row.discontinuity_sequence,
      discontinuity: row.discontinuity,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      scheduleId,
      sourceKind: "AUTOMATION",
      calendarReleaseId: calendarContext?.calendarReleaseId ?? null,
      occurrenceId: calendarContext?.occurrenceId ?? null,
      sourceRole: calendarContext?.sourceRole ?? null,
      automationEpochAt: calendarContext?.epochAt ?? null,
    }));
  });
}
