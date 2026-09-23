import type { PoolClient } from "pg";
import { publishStationEvent } from "@/lib/chat-events";
import { materializeCalendarReleaseThrough } from "@/lib/calendar-radio-materialization";
import {
  MAX_CALENDAR_OCCURRENCES,
  calendarRecurrenceKey,
  expandCalendarOccurrences,
  type CalendarEventDefinition,
} from "@/lib/calendar-recurrence";
import type {
  CalendarDraftReplaceInput,
  CalendarEventInput,
  CalendarExceptionInput,
  CalendarSourceInput,
} from "@/lib/calendar-validation";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { playbackAt, type PlaybackOrder, type TimelineItem } from "@/lib/schedule";
import type { StationKind } from "@/lib/station-kind";

const CALENDAR_PREVIEW_MAX_MS = 366 * 24 * 60 * 60 * 1_000;
const CALENDAR_RELEASE_DAYS = 90;
const CALENDAR_RELEASE_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
const MAX_REPORTED_ISSUES = 1_000;

type ProfileLifecycle = "DRAFT" | "ACTIVE" | "ARCHIVED";
type CalendarProfileRow = {
  id: string;
  name: string;
  lifecycle: ProfileLifecycle;
  strategy: "CALENDAR_EVENTS";
};
type CalendarStationRow = {
  id: string;
  station_kind: StationKind;
  active_programming_profile_id: string;
  active_calendar_release_id: string | null;
};
type DraftRow = { draft_version: number; updated_at: Date };
type DraftEventRow = {
  id: string;
  title: string;
  event_kind: CalendarEventInput["eventKind"];
  source_kind: CalendarSourceInput["kind"];
  source_tv_schedule_id: string | null;
  source_clock_release_id: string | null;
  source_clock_block_id: string | null;
  fallback_source_kind: CalendarSourceInput["kind"];
  fallback_tv_schedule_id: string | null;
  fallback_clock_release_id: string | null;
  fallback_clock_block_id: string | null;
  local_start_date: string | Date;
  local_start_time: string;
  time_zone: string;
  duration_ms: string | null;
  recurrence_kind: CalendarEventInput["recurrenceKind"];
  recurrence_interval: number;
  recurrence_count: number | null;
  recurrence_until_date: string | Date | null;
  recurrence_weekdays: number[] | null;
  recurrence_month_days: number[] | null;
  dst_gap_policy: CalendarEventInput["dstGapPolicy"];
  dst_fold_policy: CalendarEventInput["dstFoldPolicy"];
  priority: number;
  late_join_policy: CalendarEventInput["lateJoinPolicy"];
};
type DraftExceptionRow = {
  id: string;
  event_id: string;
  recurrence_key: string;
  exception_kind: CalendarExceptionInput["kind"];
  moved_local_start_date: string | Date | null;
  moved_local_start_time: string | null;
  moved_time_zone: string | null;
};

export type CalendarDraftDto = {
  profile: { id: string; name: string; lifecycle: "DRAFT" | "ACTIVE"; strategy: "CALENDAR_EVENTS" };
  draftVersion: number;
  updatedAt: string | null;
  events: CalendarEventInput[];
  exceptions: CalendarExceptionInput[];
};

export type CalendarPreviewIssue = {
  code: string;
  message: string;
  blocking: boolean;
  eventId?: string;
  recurrenceKey?: string;
  conflictingEventId?: string;
};

export type CalendarPreviewOccurrence = {
  eventId: string;
  recurrenceKey: string;
  title: string;
  eventKind: CalendarEventInput["eventKind"];
  startsAt: string;
  endsAt: string | null;
  nominalLocalStartDate: string;
  nominalLocalStartTime: string;
  isMoved: boolean;
  priority: number;
};

export type CalendarPreview = {
  horizon: { from: string; to: string };
  valid: boolean;
  occurrences: CalendarPreviewOccurrence[];
  issues: CalendarPreviewIssue[];
  errors: CalendarPreviewIssue[];
  warnings: CalendarPreviewIssue[];
};

type SourceRole = "source" | "fallback";
type SourceUse = { eventId: string; role: SourceRole; source: CalendarSourceInput };

function dateString(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function sourceFromRow(row: DraftEventRow, fallback: boolean): CalendarSourceInput {
  const prefix = fallback ? "fallback" : "source";
  const kind = fallback ? row.fallback_source_kind : row.source_kind;
  if (kind === "TV_SCHEDULE") {
    return { kind, scheduleId: row[`${prefix}_tv_schedule_id` as "fallback_tv_schedule_id" | "source_tv_schedule_id"]! };
  }
  if (kind === "RADIO_CLOCK_BLOCK") {
    return {
      kind,
      releaseId: row[`${prefix}_clock_release_id` as "fallback_clock_release_id" | "source_clock_release_id"]!,
      blockId: row[`${prefix}_clock_block_id` as "fallback_clock_block_id" | "source_clock_block_id"]!,
    };
  }
  return { kind: "NONE" };
}

function presentEvent(row: DraftEventRow): CalendarEventInput {
  return {
    id: row.id,
    title: row.title,
    eventKind: row.event_kind,
    source: sourceFromRow(row, false),
    fallbackSource: sourceFromRow(row, true),
    localStartDate: dateString(row.local_start_date)!,
    localStartTime: row.local_start_time,
    timeZone: row.time_zone,
    durationMs: Number(row.duration_ms),
    recurrenceKind: row.recurrence_kind,
    recurrenceInterval: row.recurrence_interval,
    recurrenceCount: row.recurrence_count,
    recurrenceUntilDate: dateString(row.recurrence_until_date),
    recurrenceWeekdays: row.recurrence_weekdays,
    recurrenceMonthDays: row.recurrence_month_days,
    dstGapPolicy: row.dst_gap_policy,
    dstFoldPolicy: row.dst_fold_policy,
    priority: row.priority,
    lateJoinPolicy: row.late_join_policy,
  };
}

function presentException(row: DraftExceptionRow): CalendarExceptionInput {
  return {
    id: row.id,
    eventId: row.event_id,
    recurrenceKey: row.recurrence_key,
    kind: row.exception_kind,
    movedLocalStartDate: dateString(row.moved_local_start_date),
    movedLocalStartTime: row.moved_local_start_time,
    movedTimeZone: row.moved_time_zone,
  };
}

async function lockOwnedProfile(
  client: PoolClient,
  stationId: string,
  ownerId: string,
  profileId: string,
  mode: "SHARE" | "UPDATE",
): Promise<{ station: CalendarStationRow; profile: CalendarProfileRow }> {
  const stationResult = await client.query<CalendarStationRow>(
    `SELECT id, station_kind, active_programming_profile_id, active_calendar_release_id
       FROM stations
      WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
      FOR ${mode}`,
    [stationId, ownerId],
  );
  const station = stationResult.rows[0];
  if (!station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  const profileResult = await client.query<CalendarProfileRow>(
    `SELECT id, name, lifecycle, strategy
       FROM station_programming_profiles
      WHERE id = $1 AND station_id = $2 AND strategy = 'CALENDAR_EVENTS'
        AND lifecycle IN ('DRAFT', 'ACTIVE')
      FOR ${mode}`,
    [profileId, stationId],
  );
  const profile = profileResult.rows[0];
  if (!profile) throw new HttpError(404, "Calendar programming profile not found.", "CALENDAR_PROFILE_NOT_FOUND");
  return { station, profile };
}

async function readDraft(client: PoolClient, stationId: string, profileId: string, lock: boolean): Promise<{ draft: DraftRow | null; events: CalendarEventInput[]; exceptions: CalendarExceptionInput[] }> {
  const draftResult = await client.query<DraftRow>(
    `SELECT draft_version, updated_at FROM calendar_profile_drafts
      WHERE station_id = $1 AND profile_id = $2${lock ? " FOR SHARE" : ""}`,
    [stationId, profileId],
  );
  if (!draftResult.rows[0]) return { draft: null, events: [], exceptions: [] };
  const eventsResult = await client.query<DraftEventRow>(
    `SELECT id, title, event_kind, source_kind, source_tv_schedule_id,
            source_clock_release_id, source_clock_block_id,
            fallback_source_kind, fallback_tv_schedule_id,
            fallback_clock_release_id, fallback_clock_block_id,
            local_start_date, local_start_time::text,
            time_zone, duration_ms::text, recurrence_kind, recurrence_interval,
            recurrence_count, recurrence_until_date, recurrence_weekdays,
            recurrence_month_days, dst_gap_policy, dst_fold_policy, priority,
            late_join_policy
       FROM calendar_draft_events
      WHERE station_id = $1 AND profile_id = $2
      ORDER BY local_start_date, local_start_time, priority DESC, id${lock ? " FOR SHARE" : ""}`,
    [stationId, profileId],
  );
  const exceptionsResult = await client.query<DraftExceptionRow>(
    `SELECT id, event_id, recurrence_key, exception_kind, moved_local_start_date,
            moved_local_start_time::text, moved_time_zone
       FROM calendar_draft_exceptions
      WHERE station_id = $1 AND profile_id = $2
      ORDER BY event_id, recurrence_key${lock ? " FOR SHARE" : ""}`,
    [stationId, profileId],
  );
  return {
    draft: draftResult.rows[0],
    events: eventsResult.rows.map(presentEvent),
    exceptions: exceptionsResult.rows.map(presentException),
  };
}

export async function getCalendarDraft(stationId: string, ownerId: string, profileId: string): Promise<CalendarDraftDto> {
  return transaction(async (client) => {
    const { profile } = await lockOwnedProfile(client, stationId, ownerId, profileId, "SHARE");
    const draft = await readDraft(client, stationId, profileId, true);
    return {
      profile: { id: profile.id, name: profile.name, lifecycle: profile.lifecycle as "DRAFT" | "ACTIVE", strategy: profile.strategy },
      draftVersion: draft.draft?.draft_version ?? 0,
      updatedAt: draft.draft?.updated_at.toISOString() ?? null,
      events: draft.events,
      exceptions: draft.exceptions,
    };
  });
}

function sourceColumns(source: CalendarSourceInput): [string | null, string | null, string | null] {
  if (source.kind === "TV_SCHEDULE") return [source.scheduleId, null, null];
  if (source.kind === "RADIO_CLOCK_BLOCK") return [null, source.releaseId, source.blockId];
  return [null, null, null];
}

function sourceUses(events: readonly CalendarEventInput[]): SourceUse[] {
  const uses: SourceUse[] = [];
  for (const event of events) {
    if (event.source.kind !== "NONE") uses.push({ eventId: event.id, role: "source", source: event.source });
    if (event.fallbackSource.kind !== "NONE") uses.push({ eventId: event.id, role: "fallback", source: event.fallbackSource });
  }
  return uses;
}

function sourceIssue(use: SourceUse, code: string, message: string): CalendarPreviewIssue {
  return { code, message: `${use.role === "fallback" ? "Fallback" : "Source"}: ${message}`, blocking: true, eventId: use.eventId };
}

async function inspectSources(client: PoolClient, stationId: string, stationKind: StationKind, events: readonly CalendarEventInput[]): Promise<CalendarPreviewIssue[]> {
  const uses = sourceUses(events);
  const issues: CalendarPreviewIssue[] = [];
  const compatibleUses: SourceUse[] = [];
  for (const use of uses) {
    if (use.source.kind === "TV_SCHEDULE" && stationKind !== "TV") {
      issues.push(sourceIssue(use, "CALENDAR_SOURCE_FORMAT_MISMATCH", "TV schedules can only be used by TV stations."));
    } else if (use.source.kind === "RADIO_CLOCK_BLOCK" && stationKind !== "RADIO") {
      issues.push(sourceIssue(use, "CALENDAR_SOURCE_FORMAT_MISMATCH", "Radio clock blocks can only be used by Radio stations."));
    } else {
      compatibleUses.push(use);
    }
  }

  const scheduleIds = [...new Set(compatibleUses.flatMap((use) => use.source.kind === "TV_SCHEDULE" ? [use.source.scheduleId] : []))];
  const scheduleRows = scheduleIds.length ? await client.query<{ id: string; source_duration_ms: string; has_items: boolean; ready: boolean }>(
    `SELECT schedule.id, schedule.total_duration_ms::text AS source_duration_ms,
            EXISTS (SELECT 1 FROM schedule_items item WHERE item.schedule_id = schedule.id) AS has_items,
            NOT EXISTS (
              SELECT 1 FROM schedule_items item
               WHERE item.schedule_id = schedule.id
                 AND (item.duration_ms <= 0 OR item.hls_key IS NULL OR item.hls_key = '')
            ) AS ready
       FROM schedules schedule
      WHERE schedule.station_id = $1 AND schedule.id = ANY($2::uuid[])
      FOR SHARE OF schedule`,
    [stationId, scheduleIds],
  ) : { rows: [] };
  const schedules = new Map(scheduleRows.rows.map((row) => [row.id, row]));

  const clockBlockIds = [...new Set(compatibleUses.flatMap((use) => use.source.kind === "RADIO_CLOCK_BLOCK" ? [use.source.blockId] : []))];
  const clockRows = clockBlockIds.length ? await client.query<{ release_id: string; block_id: string; source_duration_ms: string | null; has_items: boolean; ready: boolean }>(
    `SELECT release.id AS release_id, block.id AS block_id,
            (SELECT sum(item.duration_ms)::text FROM clock_release_items item WHERE item.release_block_id = block.id) AS source_duration_ms,
            EXISTS (SELECT 1 FROM clock_release_items item WHERE item.release_block_id = block.id) AS has_items,
            NOT EXISTS (
              SELECT 1 FROM clock_release_items item
               WHERE item.release_block_id = block.id
                 AND (item.duration_ms <= 0 OR item.media_key IS NULL OR item.media_key = '')
            ) AS ready
       FROM clock_releases release
       JOIN clock_release_blocks block ON block.release_id = release.id
      WHERE release.station_id = $1 AND block.id = ANY($2::uuid[])
      FOR SHARE OF release, block`,
    [stationId, clockBlockIds],
  ) : { rows: [] };
  const clockBlocks = new Map(clockRows.rows.map((row) => [`${row.release_id}/${row.block_id}`, row]));

  for (const use of compatibleUses) {
    if (use.source.kind === "TV_SCHEDULE") {
      const row = schedules.get(use.source.scheduleId);
      if (!row) issues.push(sourceIssue(use, "CALENDAR_SOURCE_NOT_FOUND", "The published TV schedule was not found in this station."));
      else if (!row.has_items || !row.ready || !Number.isSafeInteger(Number(row.source_duration_ms)) || Number(row.source_duration_ms) <= 0) {
        issues.push(sourceIssue(use, "CALENDAR_SOURCE_NOT_READY", "The published TV schedule is incomplete."));
      }
    } else if (use.source.kind === "RADIO_CLOCK_BLOCK") {
      const row = clockBlocks.get(`${use.source.releaseId}/${use.source.blockId}`);
      if (!row) issues.push(sourceIssue(use, "CALENDAR_SOURCE_NOT_FOUND", "The published Radio clock block was not found in this station."));
      else if (!row.has_items || !row.ready || !Number.isSafeInteger(Number(row.source_duration_ms)) || Number(row.source_duration_ms) <= 0) {
        issues.push(sourceIssue(use, "CALENDAR_SOURCE_NOT_READY", "The published Radio clock block is incomplete."));
      }
    }
  }
  return issues;
}

function throwForIssues(issues: readonly CalendarPreviewIssue[]): void {
  const issue = issues.find((candidate) => candidate.blocking);
  if (!issue) return;
  throw new HttpError(409, issue.message, issue.code);
}

function validateExceptionKeys(events: readonly CalendarEventInput[], exceptions: readonly CalendarExceptionInput[]): void {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  for (const exception of exceptions) {
    const event = eventsById.get(exception.eventId);
    if (!event) throw new HttpError(400, "A calendar exception references an unknown event.", "CALENDAR_EXCEPTION_EVENT_NOT_FOUND");
    const prefix = `${event.id}/`;
    const suffix = `[${event.timeZone}]`;
    if (!exception.recurrenceKey.startsWith(prefix) || !exception.recurrenceKey.endsWith(suffix)) {
      throw new HttpError(400, "A calendar exception recurrence key does not belong to its event.", "CALENDAR_EXCEPTION_KEY_INVALID");
    }
    const local = exception.recurrenceKey.slice(prefix.length, -suffix.length);
    const separator = local.indexOf("T");
    if (separator < 1) throw new HttpError(400, "A calendar exception recurrence key is malformed.", "CALENDAR_EXCEPTION_KEY_INVALID");
    try {
      if (calendarRecurrenceKey(event.id, local.slice(0, separator), event.localStartTime, event.timeZone) !== exception.recurrenceKey) throw new Error();
    } catch {
      throw new HttpError(400, "A calendar exception recurrence key is malformed.", "CALENDAR_EXCEPTION_KEY_INVALID");
    }
  }
}

async function insertDraftEvent(client: PoolClient, stationId: string, profileId: string, event: CalendarEventInput): Promise<void> {
  const source = sourceColumns(event.source);
  const fallback = sourceColumns(event.fallbackSource);
  await client.query(
    `INSERT INTO calendar_draft_events
       (id, station_id, profile_id, title, event_kind, source_kind,
         source_tv_schedule_id, source_clock_release_id, source_clock_block_id,
         fallback_source_kind,
         fallback_tv_schedule_id, fallback_clock_release_id, fallback_clock_block_id,
         local_start_date,
         local_start_time, time_zone, duration_ms, recurrence_kind, recurrence_interval,
         recurrence_count, recurrence_until_date, recurrence_weekdays, recurrence_month_days,
         dst_gap_policy, dst_fold_policy, priority, late_join_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14::date, $15::time, $16, $17, $18, $19, $20,
             $21::date, $22::smallint[], $23::smallint[], $24, $25, $26, $27)`,
    [event.id, stationId, profileId, event.title, event.eventKind, event.source.kind,
      ...source, event.fallbackSource.kind, ...fallback, event.localStartDate,
      event.localStartTime, event.timeZone, event.durationMs, event.recurrenceKind,
      event.recurrenceInterval, event.recurrenceCount, event.recurrenceUntilDate,
      event.recurrenceWeekdays, event.recurrenceMonthDays, event.dstGapPolicy,
      event.dstFoldPolicy, event.priority, event.lateJoinPolicy],
  );
}

export async function replaceCalendarDraft(stationId: string, ownerId: string, input: CalendarDraftReplaceInput): Promise<{ draftVersion: number }> {
  return transaction(async (client) => {
    const { station } = await lockOwnedProfile(client, stationId, ownerId, input.profileId, "UPDATE");
    const currentResult = await client.query<DraftRow>(
      "SELECT draft_version, updated_at FROM calendar_profile_drafts WHERE station_id = $1 AND profile_id = $2 FOR UPDATE",
      [stationId, input.profileId],
    );
    const currentVersion = currentResult.rows[0]?.draft_version ?? 0;
    if (currentVersion !== input.expectedDraftVersion) {
      throw new HttpError(409, "The calendar draft changed. Refresh and try again.", "CALENDAR_DRAFT_CONFLICT");
    }
    validateExceptionKeys(input.events, input.exceptions);
    throwForIssues(await inspectSources(client, stationId, station.station_kind, input.events));
    const nextVersion = currentVersion + 1;
    if (currentVersion === 0) {
      await client.query(
        `INSERT INTO calendar_profile_drafts
           (station_id, profile_id, draft_version, updated_by_user_id)
         VALUES ($1, $2, $3, $4)`,
        [stationId, input.profileId, nextVersion, ownerId],
      );
    } else {
      await client.query(
        `UPDATE calendar_profile_drafts
            SET draft_version = $1, updated_by_user_id = $2, updated_at = now()
          WHERE station_id = $3 AND profile_id = $4`,
        [nextVersion, ownerId, stationId, input.profileId],
      );
      await client.query("DELETE FROM calendar_draft_events WHERE station_id = $1 AND profile_id = $2", [stationId, input.profileId]);
    }
    for (const event of input.events) await insertDraftEvent(client, stationId, input.profileId, event);
    for (const exception of input.exceptions) {
      await client.query(
        `INSERT INTO calendar_draft_exceptions
           (id, station_id, profile_id, event_id, recurrence_key, exception_kind,
            moved_local_start_date, moved_local_start_time, moved_time_zone)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::time, $9)`,
        [exception.id, stationId, input.profileId, exception.eventId, exception.recurrenceKey,
          exception.kind, exception.movedLocalStartDate, exception.movedLocalStartTime,
          exception.movedTimeZone],
      );
    }
    return { draftVersion: nextVersion };
  });
}

function definitionFor(event: CalendarEventInput, exceptions: readonly CalendarExceptionInput[]): CalendarEventDefinition {
  return {
    id: event.id,
    eventKind: event.eventKind,
    localStartDate: event.localStartDate,
    localStartTime: event.localStartTime,
    timeZone: event.timeZone,
    durationMs: event.durationMs,
    recurrenceKind: event.recurrenceKind,
    recurrenceInterval: event.recurrenceInterval,
    recurrenceCount: event.recurrenceCount,
    recurrenceUntilDate: event.recurrenceUntilDate,
    recurrenceWeekdays: event.recurrenceWeekdays,
    recurrenceMonthDays: event.recurrenceMonthDays,
    dstGapPolicy: event.dstGapPolicy,
    dstFoldPolicy: event.dstFoldPolicy,
    exceptions: exceptions.filter((exception) => exception.eventId === event.id).map((exception) => ({
      kind: exception.kind,
      recurrenceKey: exception.recurrenceKey,
      movedLocalStartDate: exception.movedLocalStartDate,
      movedLocalStartTime: exception.movedLocalStartTime,
      movedTimeZone: exception.movedTimeZone,
    })),
  };
}

function pushIssue(issues: CalendarPreviewIssue[], issue: CalendarPreviewIssue): void {
  if (issues.length < MAX_REPORTED_ISSUES) issues.push(issue);
}

function dstIssues(definition: CalendarEventDefinition, actual: readonly ReturnType<typeof expandCalendarOccurrences>[number][], horizon: { from: Date; to: Date }): CalendarPreviewIssue[] {
  const issues: CalendarPreviewIssue[] = [];
  try {
    const skipped = expandCalendarOccurrences({ ...definition, dstGapPolicy: "SKIP" }, horizon);
    const shifted = expandCalendarOccurrences({ ...definition, dstGapPolicy: "SHIFT_FORWARD" }, horizon);
    const skippedKeys = new Set(skipped.map((row) => row.recurrenceKey));
    for (const row of shifted) {
      if (skippedKeys.has(row.recurrenceKey)) continue;
      issues.push({
        code: definition.dstGapPolicy === "SKIP" ? "CALENDAR_DST_GAP_SKIPPED" : "CALENDAR_DST_GAP_SHIFTED",
        message: definition.dstGapPolicy === "SKIP" ? "A local start falls in a DST gap and will be skipped." : "A local start falls in a DST gap and will be shifted forward.",
        blocking: false,
        eventId: definition.id,
        recurrenceKey: row.recurrenceKey,
      });
    }
    const earlier = expandCalendarOccurrences({ ...definition, dstFoldPolicy: "EARLIER" }, horizon);
    const laterByKey = new Map(expandCalendarOccurrences({ ...definition, dstFoldPolicy: "LATER" }, horizon).map((row) => [row.recurrenceKey, row]));
    const actualKeys = new Set(actual.map((row) => row.recurrenceKey));
    for (const row of earlier) {
      const later = laterByKey.get(row.recurrenceKey);
      if (!later || later.startsAt.getTime() === row.startsAt.getTime() || !actualKeys.has(row.recurrenceKey)) continue;
      issues.push({
        code: "CALENDAR_DST_FOLD",
        message: `An ambiguous DST-fold start will use the ${definition.dstFoldPolicy.toLowerCase()} instant.`,
        blocking: false,
        eventId: definition.id,
        recurrenceKey: row.recurrenceKey,
      });
    }
  } catch {
    // The primary expansion reports malformed recurrence; alternate DST probes are advisory.
  }
  return issues;
}

export function compileCalendarPreview(
  events: readonly CalendarEventInput[],
  exceptions: readonly CalendarExceptionInput[],
  horizon: { from: Date; to: Date },
  initialIssues: readonly CalendarPreviewIssue[] = [],
): CalendarPreview {
  const issues = [...initialIssues];
  const occurrences: CalendarPreviewOccurrence[] = [];
  for (const event of events) {
    if (occurrences.length >= MAX_CALENDAR_OCCURRENCES) {
      pushIssue(issues, { code: "CALENDAR_TOO_DENSE", message: `The calendar exceeds ${MAX_CALENDAR_OCCURRENCES} occurrences in this horizon.`, blocking: true, eventId: event.id });
      break;
    }
    const definition = definitionFor(event, exceptions);
    try {
      const rows = expandCalendarOccurrences(definition, horizon, { maxRows: MAX_CALENDAR_OCCURRENCES - occurrences.length });
      for (const issue of dstIssues(definition, rows, horizon)) pushIssue(issues, issue);
      for (const row of rows) {
        occurrences.push({
          eventId: event.id,
          recurrenceKey: row.recurrenceKey,
          title: event.title,
          eventKind: event.eventKind,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt?.toISOString() ?? null,
          nominalLocalStartDate: row.nominalLocalStartDate,
          nominalLocalStartTime: row.nominalLocalStartTime,
          isMoved: row.isMoved,
          priority: event.priority,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The calendar recurrence is invalid.";
      pushIssue(issues, {
        code: message.includes("row limit") ? "CALENDAR_TOO_DENSE" : "CALENDAR_RECURRENCE_INVALID",
        message,
        blocking: true,
        eventId: event.id,
      });
    }
  }
  occurrences.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.recurrenceKey.localeCompare(right.recurrenceKey));
  let active: CalendarPreviewOccurrence[] = [];
  for (const occurrence of occurrences) {
    if (issues.length >= MAX_REPORTED_ISSUES) break;
    const startsAt = Date.parse(occurrence.startsAt);
    active = active.filter((candidate) => candidate.endsAt === null || Date.parse(candidate.endsAt) > startsAt);
    for (const candidate of active) {
      const samePriority = candidate.priority === occurrence.priority;
      pushIssue(issues, {
        code: samePriority ? "CALENDAR_OVERLAP" : "CALENDAR_PRIORITY_OVERLAP",
        message: samePriority
          ? "Overlapping occurrences with the same priority are ambiguous."
          : "Overlapping occurrences will be resolved by event priority.",
        blocking: samePriority,
        eventId: occurrence.eventId,
        recurrenceKey: occurrence.recurrenceKey,
        conflictingEventId: candidate.eventId,
      });
      if (issues.length >= MAX_REPORTED_ISSUES) break;
    }
    active.push(occurrence);
  }
  const errors = issues.filter((issue) => issue.blocking);
  const warnings = issues.filter((issue) => !issue.blocking);
  return {
    horizon: { from: horizon.from.toISOString(), to: horizon.to.toISOString() },
    valid: errors.length === 0,
    occurrences,
    issues,
    errors,
    warnings,
  };
}

function previewHorizon(from: string | undefined, to: string | undefined, now: Date): { from: Date; to: Date } {
  const start = from ? new Date(from) : now;
  const end = to ? new Date(to) : new Date(start.getTime() + CALENDAR_RELEASE_DAYS * 24 * 60 * 60 * 1_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new HttpError(400, "The calendar preview horizon must be a nonempty interval.", "CALENDAR_HORIZON_INVALID");
  }
  if (end.getTime() - start.getTime() > CALENDAR_PREVIEW_MAX_MS) {
    throw new HttpError(400, "Calendar previews are limited to 366 days.", "CALENDAR_HORIZON_TOO_LARGE");
  }
  return { from: start, to: end };
}

export async function previewCalendarDraft(
  stationId: string,
  ownerId: string,
  profileId: string,
  range: { from?: string; to?: string } = {},
  now = new Date(),
): Promise<CalendarPreview & { draftVersion: number }> {
  const horizon = previewHorizon(range.from, range.to, now);
  return transaction(async (client) => {
    const { station } = await lockOwnedProfile(client, stationId, ownerId, profileId, "SHARE");
    const draft = await readDraft(client, stationId, profileId, true);
    if (!draft.draft) throw new HttpError(409, "Create the calendar draft before previewing it.", "CALENDAR_DRAFT_NOT_FOUND");
    const sourceIssues = await inspectSources(client, stationId, station.station_kind, draft.events);
    return { draftVersion: draft.draft.draft_version, ...compileCalendarPreview(draft.events, draft.exceptions, horizon, sourceIssues) };
  });
}

type ReleaseDto = {
  releaseId: string;
  profileId: string;
  releaseNumber: number;
  sourceDraftVersion: number;
  publishedAt: string;
  occurrenceCount: number;
  horizonFrom: string;
  materializedThrough: string;
  idempotent: boolean;
};

type ExistingReleaseRow = {
  id: string;
  profile_id: string;
  release_number: number;
  source_draft_version: number;
  published_at: Date;
  occurrence_count: string | number | null;
  horizon_from: Date | null;
  materialized_through: Date | null;
};

function presentRelease(row: ExistingReleaseRow, idempotent: boolean): ReleaseDto {
  return {
    releaseId: row.id,
    profileId: row.profile_id,
    releaseNumber: Number(row.release_number),
    sourceDraftVersion: Number(row.source_draft_version),
    publishedAt: row.published_at.toISOString(),
    occurrenceCount: Number(row.occurrence_count ?? 0),
    horizonFrom: row.horizon_from?.toISOString() ?? "",
    materializedThrough: row.materialized_through?.toISOString() ?? "",
    idempotent,
  };
}

const existingReleaseSelect = `SELECT release.id, release.profile_id, release.release_number,
       release.source_draft_version, release.published_at,
       state.occurrence_count, state.horizon_from, state.materialized_through
  FROM calendar_releases release
  LEFT JOIN calendar_release_materialization_state state ON state.release_id = release.id`;

async function insertReleaseEvent(
  client: PoolClient,
  stationId: string,
  profileId: string,
  releaseId: string,
  event: CalendarEventInput,
): Promise<string> {
  const source = sourceColumns(event.source);
  const fallback = sourceColumns(event.fallbackSource);
  const result = await client.query<{ id: string }>(
    `INSERT INTO calendar_release_events
        (station_id, profile_id, release_id, source_event_id, title, event_kind,
         source_kind, source_tv_schedule_id, source_clock_release_id, source_clock_block_id,
         fallback_source_kind,
         fallback_tv_schedule_id, fallback_clock_release_id, fallback_clock_block_id,
         local_start_date,
         local_start_time, time_zone, duration_ms, recurrence_kind, recurrence_interval,
         recurrence_count, recurrence_until_date, recurrence_weekdays, recurrence_month_days,
          dst_gap_policy, dst_fold_policy, priority, late_join_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15::date, $16::time, $17, $18, $19, $20, $21,
              $22::date, $23::smallint[], $24::smallint[], $25, $26, $27, $28)
     RETURNING id`,
    [stationId, profileId, releaseId, event.id, event.title, event.eventKind,
      event.source.kind, ...source, event.fallbackSource.kind, ...fallback,
      event.localStartDate, event.localStartTime, event.timeZone, event.durationMs,
      event.recurrenceKind, event.recurrenceInterval, event.recurrenceCount,
      event.recurrenceUntilDate, event.recurrenceWeekdays, event.recurrenceMonthDays,
      event.dstGapPolicy, event.dstFoldPolicy, event.priority, event.lateJoinPolicy],
  );
  return result.rows[0].id;
}

type MaterializedOccurrence = CalendarPreviewOccurrence & { releaseEventId: string; eventKind: CalendarEventInput["eventKind"]; releaseExceptionId: string | null };

async function insertOccurrences(client: PoolClient, stationId: string, profileId: string, releaseId: string, rows: readonly MaterializedOccurrence[]): Promise<void> {
  const batchSize = 250;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const offset = values.length;
      values.push(stationId, profileId, releaseId, row.releaseEventId, row.eventKind,
        row.releaseExceptionId, row.releaseExceptionId ? "MOVE" : null,
        row.recurrenceKey, row.nominalLocalStartDate, row.nominalLocalStartTime,
        row.startsAt, row.endsAt, row.isMoved);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::date, $${offset + 10}::time, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
    });
    await client.query(
      `INSERT INTO calendar_occurrences
         (station_id, profile_id, release_id, release_event_id, event_kind,
          release_exception_id, release_exception_kind, recurrence_key,
          nominal_local_start_date, nominal_local_start_time, starts_at, ends_at, is_moved)
       VALUES ${tuples.join(", ")}`,
      values,
    );
  }
}

function releaseHorizon(now: Date): { from: Date; to: Date } {
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + CALENDAR_RELEASE_DAYS);
  return { from: new Date(now.getTime() - CALENDAR_RELEASE_LOOKBACK_MS), to };
}

export async function publishCalendarRelease(
  stationId: string,
  ownerId: string,
  profileId: string,
  expectedDraftVersion: number,
  idempotencyKey: string,
  now = new Date(),
): Promise<ReleaseDto> {
  return transaction(async (client) => {
    const { station } = await lockOwnedProfile(client, stationId, ownerId, profileId, "UPDATE");
    const byKey = await client.query<ExistingReleaseRow>(
      `${existingReleaseSelect} WHERE release.profile_id = $1 AND release.idempotency_key = $2`,
      [profileId, idempotencyKey],
    );
    if (byKey.rows[0]) {
      if (Number(byKey.rows[0].source_draft_version) !== expectedDraftVersion) {
        throw new HttpError(409, "This idempotency key was used for another calendar draft.", "CALENDAR_IDEMPOTENCY_CONFLICT");
      }
      return presentRelease(byKey.rows[0], true);
    }
    const byVersion = await client.query<ExistingReleaseRow>(
      `${existingReleaseSelect} WHERE release.profile_id = $1 AND release.source_draft_version = $2`,
      [profileId, expectedDraftVersion],
    );
    if (byVersion.rows[0]) return presentRelease(byVersion.rows[0], true);
    const draft = await readDraft(client, stationId, profileId, true);
    if (!draft.draft) throw new HttpError(409, "Create the calendar draft before publishing it.", "CALENDAR_DRAFT_NOT_FOUND");
    if (draft.draft.draft_version !== expectedDraftVersion) {
      throw new HttpError(409, "The calendar draft changed. Refresh and try again.", "CALENDAR_DRAFT_CONFLICT");
    }
    if (!draft.events.length) throw new HttpError(409, "Add at least one calendar event before publishing.", "CALENDAR_EMPTY");
    validateExceptionKeys(draft.events, draft.exceptions);
    const sourceIssues = await inspectSources(client, stationId, station.station_kind, draft.events);
    const horizon = releaseHorizon(now);
    const preview = compileCalendarPreview(draft.events, draft.exceptions, horizon, sourceIssues);
    throwForIssues(preview.issues);

    const numberResult = await client.query<{ release_number: number }>(
      "SELECT COALESCE(MAX(release_number), 0)::int + 1 AS release_number FROM calendar_releases WHERE profile_id = $1",
      [profileId],
    );
    const releaseNumber = numberResult.rows[0].release_number;
    const releaseResult = await client.query<{ id: string; published_at: Date }>(
      `INSERT INTO calendar_releases
         (station_id, profile_id, release_number, source_draft_version,
          idempotency_key, published_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, published_at`,
      [stationId, profileId, releaseNumber, expectedDraftVersion, idempotencyKey, ownerId],
    );
    const releaseId = releaseResult.rows[0].id;
    const releaseEventIds = new Map<string, string>();
    const eventKinds = new Map<string, CalendarEventInput["eventKind"]>();
    for (const event of draft.events) {
      releaseEventIds.set(event.id, await insertReleaseEvent(client, stationId, profileId, releaseId, event));
      eventKinds.set(event.id, event.eventKind);
    }
    const movedExceptions = new Map<string, string>();
    for (const exception of draft.exceptions) {
      const releaseEventId = releaseEventIds.get(exception.eventId)!;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO calendar_release_exceptions
           (station_id, profile_id, release_id, release_event_id, source_exception_id,
            recurrence_key, exception_kind, moved_local_start_date,
            moved_local_start_time, moved_time_zone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::time, $10)
         RETURNING id`,
        [stationId, profileId, releaseId, releaseEventId, exception.id,
          exception.recurrenceKey, exception.kind, exception.movedLocalStartDate,
          exception.movedLocalStartTime, exception.movedTimeZone],
      );
      if (exception.kind === "MOVE") movedExceptions.set(`${exception.eventId}\u0000${exception.recurrenceKey}`, inserted.rows[0].id);
    }
    const materialized: MaterializedOccurrence[] = preview.occurrences.map((occurrence) => ({
      ...occurrence,
      releaseEventId: releaseEventIds.get(occurrence.eventId)!,
      eventKind: eventKinds.get(occurrence.eventId)!,
      releaseExceptionId: movedExceptions.get(`${occurrence.eventId}\u0000${occurrence.recurrenceKey}`) ?? null,
    }));
    await insertOccurrences(client, stationId, profileId, releaseId, materialized);
    if (station.station_kind === "RADIO") {
      await materializeCalendarReleaseThrough(client, releaseId, horizon.from, horizon.to);
    }
    await client.query(
      `INSERT INTO calendar_release_materialization_state
         (station_id, release_id, status, horizon_from, materialized_through,
          target_through, occurrence_count, last_started_at, completed_at, updated_at)
       VALUES ($1, $2, 'READY', $3, $4, $4, $5, $6, $6, $6)`,
      [stationId, releaseId, horizon.from, horizon.to, materialized.length, now],
    );
    return {
      releaseId,
      profileId,
      releaseNumber,
      sourceDraftVersion: expectedDraftVersion,
      publishedAt: releaseResult.rows[0].published_at.toISOString(),
      occurrenceCount: materialized.length,
      horizonFrom: horizon.from.toISOString(),
      materializedThrough: horizon.to.toISOString(),
      idempotent: false,
    };
  });
}

type CalendarActivationStation = CalendarStationRow & {
  pending_calendar_release_id: string | null;
  pending_calendar_activation_at: Date | null;
  broadcast_state: "RUNNING" | "STOPPED";
  active_schedule_id: string | null;
  schedule_started_at: Date | null;
  active_clock_release_id: string | null;
  radio_delivery_mode: "PLAYOUT" | "STATIC_HLS";
};

type CalendarActivationRelease = {
  profile_id: string;
  lifecycle: ProfileLifecycle;
  status: string | null;
  horizon_from: Date | null;
  materialized_through: Date | null;
  db_now: Date;
};

type CalendarRuntimeStateRow = {
  status: "IDLE" | "PLAYING" | "OFFLINE" | "FALLBACK" | "FAILED";
  active_release_id: string | null;
  current_occurrence_id: string | null;
  transition_sequence: string;
};

export type CalendarBaselineStation = {
  id: string;
  station_kind: StationKind;
  active_schedule_id: string | null;
  active_clock_release_id: string | null;
};

export async function assertCalendarBaselineReady(
  client: PoolClient,
  station: CalendarBaselineStation,
): Promise<void> {
  if (station.station_kind === "TV") {
    if (!station.active_schedule_id) {
      throw new HttpError(409, "Apply a usable baseline TV schedule before activating Calendar programming.", "CALENDAR_BASELINE_NOT_READY");
    }
    const baseline = await client.query<{ usable: boolean }>(
      `SELECT EXISTS (
                SELECT 1 FROM schedule_items item WHERE item.schedule_id = schedule.id
              ) AND schedule.total_duration_ms > 0
              AND NOT EXISTS (
                SELECT 1 FROM schedule_items item
                 WHERE item.schedule_id = schedule.id
                   AND (item.duration_ms <= 0 OR item.hls_key IS NULL OR item.hls_key = '')
              ) AS usable
         FROM schedules schedule
        WHERE schedule.id = $1 AND schedule.station_id = $2
        FOR SHARE OF schedule`,
      [station.active_schedule_id, station.id],
    );
    if (baseline.rows[0]?.usable !== true) {
      throw new HttpError(409, "Apply a usable baseline TV schedule before activating Calendar programming.", "CALENDAR_BASELINE_NOT_READY");
    }
    return;
  }

  if (!station.active_clock_release_id) {
    throw new HttpError(409, "Publish an active Radio clock fallback before activating Calendar programming.", "CALENDAR_BASELINE_NOT_READY");
  }
  const baseline = await client.query<{ usable: boolean }>(
    `SELECT EXISTS (
              SELECT 1 FROM clock_release_blocks block
               WHERE block.release_id = release.id
            ) AND NOT EXISTS (
              SELECT 1 FROM clock_release_blocks block
               WHERE block.release_id = release.id
                 AND NOT EXISTS (
                   SELECT 1 FROM clock_release_items item
                    WHERE item.release_block_id = block.id
                 )
            ) AND NOT EXISTS (
              SELECT 1 FROM clock_release_blocks block
              JOIN clock_release_items item ON item.release_block_id = block.id
             WHERE block.release_id = release.id
               AND (item.duration_ms <= 0 OR item.media_key IS NULL OR item.media_key = '')
            ) AS usable
       FROM clock_releases release
      WHERE release.id = $1 AND release.station_id = $2
      FOR SHARE OF release`,
    [station.active_clock_release_id, station.id],
  );
  if (baseline.rows[0]?.usable !== true) {
    throw new HttpError(409, "Publish an active Radio clock fallback before activating Calendar programming.", "CALENDAR_BASELINE_NOT_READY");
  }
}

async function readActivationRelease(
  client: PoolClient,
  stationId: string,
  releaseId: string,
  at?: Date,
): Promise<CalendarActivationRelease> {
  const result = await client.query<CalendarActivationRelease>(
    `SELECT release.profile_id, profile.lifecycle, state.status,
            state.horizon_from, state.materialized_through,
            COALESCE($3::timestamptz, clock_timestamp()) AS db_now
       FROM calendar_releases release
       JOIN station_programming_profiles profile
         ON profile.id = release.profile_id AND profile.station_id = release.station_id
       LEFT JOIN calendar_release_materialization_state state
         ON state.release_id = release.id AND state.station_id = release.station_id
      WHERE release.id = $1 AND release.station_id = $2
        AND profile.strategy = 'CALENDAR_EVENTS'
      FOR UPDATE OF profile`,
    [releaseId, stationId, at ?? null],
  );
  const release = result.rows[0];
  if (!release) throw new HttpError(404, "Calendar release not found.", "CALENDAR_RELEASE_NOT_FOUND");
  if (release.status !== "READY") {
    throw new HttpError(409, "The calendar release has not finished materializing.", "CALENDAR_RELEASE_NOT_READY");
  }
  if (!release.horizon_from || !release.materialized_through
    || release.horizon_from > release.db_now || release.materialized_through <= release.db_now) {
    throw new HttpError(409, "The calendar release does not cover the current database time.", "CALENDAR_RELEASE_HORIZON_EXPIRED");
  }
  return release;
}

async function switchStoppedRadioToPlayout(
  client: PoolClient,
  station: CalendarActivationStation,
): Promise<void> {
  if (station.station_kind !== "RADIO" || station.radio_delivery_mode === "PLAYOUT") return;
  if (station.broadcast_state === "RUNNING") {
    throw new HttpError(409, "Stop this Radio station before activating Calendar programming; STATIC_HLS cannot run Calendar events.", "CALENDAR_STATIC_HLS_RUNNING");
  }
  const updated = await client.query(
    `UPDATE stations SET radio_delivery_mode = 'PLAYOUT', updated_at = now()
      WHERE id = $1 AND broadcast_state = 'STOPPED' AND radio_delivery_mode = 'STATIC_HLS'`,
    [station.id],
  );
  if (!updated.rowCount) {
    throw new HttpError(409, "The Radio delivery mode changed while activating the calendar.", "CALENDAR_ACTIVATION_CONFLICT");
  }
  station.radio_delivery_mode = "PLAYOUT";
}

async function transitionToCalendarRelease(
  client: PoolClient,
  stationId: string,
  releaseId: string,
  transitionedAt: Date,
  reason: "IMMEDIATE" | "NEXT_BOUNDARY",
): Promise<void> {
  const stateResult = await client.query<CalendarRuntimeStateRow>(
    `SELECT status, active_release_id, current_occurrence_id, transition_sequence::text
       FROM calendar_runtime_state WHERE station_id = $1 FOR UPDATE`,
    [stationId],
  );
  const state = stateResult.rows[0];
  const fromStatus = state?.status ?? "IDLE";
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
      [stationId, releaseId, sequence, state.transition_sequence],
    );
  } else {
    await client.query(
      `INSERT INTO calendar_runtime_state
         (station_id, status, active_release_id, transition_sequence, public_revision, updated_at)
       VALUES ($1, 'IDLE', $2, $3, 1, now())`,
      [stationId, releaseId, sequence],
    );
  }
  await client.query(
    `INSERT INTO calendar_runtime_transitions
       (station_id, sequence, release_id, occurrence_id, transition_kind,
        from_status, to_status, reason, transitioned_at)
     VALUES ($1, $2, $3, NULL, 'RELEASE_ACTIVATED', $4, 'IDLE', $5, $6)`,
    [stationId, sequence, releaseId, fromStatus, reason, transitionedAt],
  );
}

async function activateReleaseLocked(
  client: PoolClient,
  station: CalendarActivationStation,
  release: CalendarActivationRelease,
  releaseId: string,
  reason: "IMMEDIATE" | "NEXT_BOUNDARY",
): Promise<void> {
  if (station.active_programming_profile_id !== release.profile_id) {
    await client.query(
      `UPDATE station_programming_profiles
          SET lifecycle = 'ARCHIVED', version = version + 1, updated_at = now()
        WHERE id = $1 AND station_id = $2 AND lifecycle = 'ACTIVE'`,
      [station.active_programming_profile_id, station.id],
    );
  }
  await client.query(
    `UPDATE station_programming_profiles
        SET lifecycle = 'ACTIVE', version = version + 1, updated_at = now()
      WHERE id = $1 AND station_id = $2 AND lifecycle <> 'ACTIVE'`,
    [release.profile_id, station.id],
  );
  const pendingCheck = reason === "NEXT_BOUNDARY"
    ? "AND pending_calendar_release_id = $6 AND pending_calendar_activation_at = $7"
    : "";
  const values: unknown[] = [release.profile_id, releaseId, station.id,
    station.active_programming_profile_id, station.active_calendar_release_id];
  if (reason === "NEXT_BOUNDARY") {
    values.push(station.pending_calendar_release_id, station.pending_calendar_activation_at);
  }
  const updated = await client.query(
    `UPDATE stations
        SET active_programming_profile_id = $1, active_calendar_release_id = $2,
            pending_calendar_release_id = NULL,
            pending_calendar_activation_at = NULL, updated_at = now()
      WHERE id = $3
        AND active_programming_profile_id = $4
        AND active_calendar_release_id IS NOT DISTINCT FROM $5
        ${pendingCheck}`,
    values,
  );
  if (!updated.rowCount) throw new HttpError(409, "The active calendar changed while activating this release.", "CALENDAR_ACTIVATION_CONFLICT");
  await transitionToCalendarRelease(client, station.id, releaseId, release.db_now, reason);
}

async function currentCalendarBoundary(
  client: PoolClient,
  station: CalendarActivationStation,
  now: Date,
): Promise<Date> {
  if (station.active_calendar_release_id) {
    const occurrence = await client.query<{ ends_at: Date | null }>(
      `SELECT occurrence.ends_at
         FROM calendar_occurrences occurrence
         JOIN calendar_release_events event
           ON event.station_id = occurrence.station_id
          AND event.release_id = occurrence.release_id
          AND event.id = occurrence.release_event_id
        WHERE occurrence.station_id = $1 AND occurrence.release_id = $2
          AND occurrence.starts_at <= $3
          AND (occurrence.ends_at IS NULL OR occurrence.ends_at > $3)
        ORDER BY event.priority DESC, occurrence.starts_at DESC, occurrence.id
        LIMIT 1`,
      [station.id, station.active_calendar_release_id, now],
    );
    if (occurrence.rows[0]) {
      if (!occurrence.rows[0].ends_at) {
        throw new HttpError(409, "The current Calendar occurrence has no safe end boundary.", "CALENDAR_NEXT_BOUNDARY_UNAVAILABLE");
      }
      return occurrence.rows[0].ends_at;
    }
  }

  if (station.station_kind === "RADIO") {
    const item = await client.query<{ ends_at: Date }>(
      `SELECT ends_at FROM clock_timeline_items
        WHERE release_id = $1 AND starts_at <= $2 AND ends_at > $2
        ORDER BY starts_at DESC, id LIMIT 1`,
      [station.active_clock_release_id, now],
    );
    if (item.rows[0]) return item.rows[0].ends_at;
  } else if (station.active_schedule_id && station.schedule_started_at && station.schedule_started_at <= now) {
    const timelineResult = await client.query<{
      id: string;
      duration_ms: string;
      transition_ms: number;
      playback_order: PlaybackOrder;
      shuffle_seed: string;
    }>(
      `SELECT item.video_id AS id, item.duration_ms::text, schedule.transition_ms,
              schedule.playback_order, schedule.shuffle_seed::text
         FROM schedules schedule
         JOIN schedule_items item ON item.schedule_id = schedule.id
        WHERE schedule.id = $1 AND schedule.station_id = $2
        ORDER BY item.position`,
      [station.active_schedule_id, station.id],
    );
    if (timelineResult.rows.length) {
      const first = timelineResult.rows[0];
      const items: TimelineItem[] = timelineResult.rows.map((row) => ({ id: row.id, durationMs: Number(row.duration_ms) }));
      const position = playbackAt(items, station.schedule_started_at.getTime(), now.getTime(), first.transition_ms, first.playback_order, first.shuffle_seed);
      const item = items.find((candidate) => candidate.id === position.itemId)!;
      const remaining = position.inTransition
        ? position.transitionRemainingMs
        : item.durationMs - position.playbackOffsetMs + first.transition_ms;
      return new Date(now.getTime() + remaining);
    }
  }
  throw new HttpError(409, "The current baseline program has no safe activation boundary.", "CALENDAR_NEXT_BOUNDARY_UNAVAILABLE");
}

async function readActivationStation(
  client: PoolClient,
  stationId: string,
  ownerId?: string,
): Promise<CalendarActivationStation | null> {
  const result = await client.query<CalendarActivationStation>(
    `SELECT id, station_kind, broadcast_state, active_programming_profile_id,
            active_calendar_release_id, pending_calendar_release_id,
            pending_calendar_activation_at, active_schedule_id, schedule_started_at,
            active_clock_release_id, radio_delivery_mode
       FROM stations
      WHERE id = $1 AND ($2::uuid IS NULL OR owner_id = $2) AND deleted_at IS NULL
      FOR UPDATE`,
    [stationId, ownerId ?? null],
  );
  return result.rows[0] ?? null;
}

export async function activateCalendarRelease(
  stationId: string,
  ownerId: string,
  releaseId: string,
  activation: "IMMEDIATE" | "NEXT_BOUNDARY",
): Promise<{ releaseId: string; profileId: string; activated: boolean }> {
  const result = await transaction(async (client) => {
    const station = await readActivationStation(client, stationId, ownerId);
    if (!station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    const release = await readActivationRelease(client, stationId, releaseId);
    await switchStoppedRadioToPlayout(client, station);
    await assertCalendarBaselineReady(client, station);

    const alreadyActive = station.active_calendar_release_id === releaseId
      && station.active_programming_profile_id === release.profile_id;
    if (activation === "IMMEDIATE") {
      if (alreadyActive) {
        const changed = Boolean(station.pending_calendar_release_id || station.pending_calendar_activation_at);
        if (changed) {
          await client.query(
            `UPDATE stations SET pending_calendar_release_id = NULL,
                    pending_calendar_activation_at = NULL, updated_at = now()
              WHERE id = $1 AND active_calendar_release_id = $2`,
            [stationId, releaseId],
          );
        }
        return { releaseId, profileId: release.profile_id, activated: false, changed };
      }
      await activateReleaseLocked(client, station, release, releaseId, "IMMEDIATE");
      return { releaseId, profileId: release.profile_id, activated: true, changed: true };
    }

    if (alreadyActive) return { releaseId, profileId: release.profile_id, activated: false, changed: false };
    const existingActivationAt = station.pending_calendar_release_id
      ? station.pending_calendar_activation_at
      : null;
    const activationAt = existingActivationAt && existingActivationAt > release.db_now
      ? existingActivationAt
      : await currentCalendarBoundary(client, station, release.db_now);
    if (station.pending_calendar_release_id === releaseId
      && station.pending_calendar_activation_at?.getTime() === activationAt.getTime()) {
      return { releaseId, profileId: release.profile_id, activated: false, changed: false };
    }
    const queued = await client.query(
      `UPDATE stations
          SET pending_calendar_release_id = $1,
              pending_calendar_activation_at = $2, updated_at = now()
        WHERE id = $3
          AND active_calendar_release_id IS NOT DISTINCT FROM $4
          AND pending_calendar_release_id IS NOT DISTINCT FROM $5`,
      [releaseId, activationAt, stationId, station.active_calendar_release_id, station.pending_calendar_release_id],
    );
    if (!queued.rowCount) throw new HttpError(409, "The active calendar changed while queueing this release.", "CALENDAR_ACTIVATION_CONFLICT");
    return { releaseId, profileId: release.profile_id, activated: false, changed: true };
  });
  if (result.changed) await publishStationEvent(stationId, { type: "station.updated", data: { schedule: true } });
  return { releaseId: result.releaseId, profileId: result.profileId, activated: result.activated };
}

export async function promoteDueCalendarRelease(stationId: string, now?: Date): Promise<boolean> {
  const promoted = await transaction(async (client) => {
    const station = await readActivationStation(client, stationId);
    if (!station?.pending_calendar_release_id || !station.pending_calendar_activation_at) return false;
    const release = await readActivationRelease(client, stationId, station.pending_calendar_release_id, now);
    if (station.pending_calendar_activation_at > release.db_now) return false;
    await switchStoppedRadioToPlayout(client, station);
    await assertCalendarBaselineReady(client, station);
    await activateReleaseLocked(client, station, release, station.pending_calendar_release_id, "NEXT_BOUNDARY");
    return true;
  });
  if (promoted) await publishStationEvent(stationId, { type: "station.updated", data: { schedule: true } });
  return promoted;
}
