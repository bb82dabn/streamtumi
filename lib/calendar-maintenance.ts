import type { PoolClient } from "pg";
import { materializeCalendarReleaseThrough } from "@/lib/calendar-radio-materialization";
import {
  MAX_CALENDAR_OCCURRENCES,
  expandCalendarOccurrences,
  type CalendarEventDefinition,
  type CalendarEventKind,
  type CalendarRecurrenceException,
} from "@/lib/calendar-recurrence";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";

const CALENDAR_HORIZON_DAYS = 90;
const CALENDAR_LOOKBACK_MS = 24 * 60 * 60 * 1_000;

type MaterializationReleaseRow = {
  station_id: string;
  station_kind: "TV" | "RADIO";
  profile_id: string;
  status: "PENDING" | "RUNNING" | "READY" | "FAILED" | null;
  horizon_from: Date | null;
  materialized_through: Date | null;
  target_through: Date | null;
  db_now: Date;
};

type ReleaseEventRow = {
  id: string;
  source_event_id: string;
  event_kind: CalendarEventKind;
  local_start_date: string | Date;
  local_start_time: string;
  time_zone: string;
  duration_ms: string | null;
  recurrence_kind: CalendarEventDefinition["recurrenceKind"];
  recurrence_interval: number;
  recurrence_count: number | null;
  recurrence_until_date: string | Date | null;
  recurrence_weekdays: number[] | null;
  recurrence_month_days: number[] | null;
  dst_gap_policy: CalendarEventDefinition["dstGapPolicy"];
  dst_fold_policy: CalendarEventDefinition["dstFoldPolicy"];
};

type ReleaseExceptionRow = {
  id: string;
  release_event_id: string;
  recurrence_key: string;
  exception_kind: "CANCEL" | "MOVE";
  moved_local_start_date: string | Date | null;
  moved_local_start_time: string | null;
  moved_time_zone: string | null;
};

type ExpandedOccurrence = {
  stationId: string;
  profileId: string;
  releaseId: string;
  releaseEventId: string;
  eventKind: CalendarEventKind;
  releaseExceptionId: string | null;
  recurrenceKey: string;
  nominalLocalStartDate: string;
  nominalLocalStartTime: string;
  startsAt: Date;
  endsAt: Date | null;
  isMoved: boolean;
};

function dateString(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function definitionFor(
  event: ReleaseEventRow,
  exceptions: readonly ReleaseExceptionRow[],
): CalendarEventDefinition {
  return {
    id: event.source_event_id,
    eventKind: event.event_kind,
    localStartDate: dateString(event.local_start_date)!,
    localStartTime: event.local_start_time,
    timeZone: event.time_zone,
    durationMs: Number(event.duration_ms),
    recurrenceKind: event.recurrence_kind,
    recurrenceInterval: event.recurrence_interval,
    recurrenceCount: event.recurrence_count,
    recurrenceUntilDate: dateString(event.recurrence_until_date),
    recurrenceWeekdays: event.recurrence_weekdays,
    recurrenceMonthDays: event.recurrence_month_days,
    dstGapPolicy: event.dst_gap_policy,
    dstFoldPolicy: event.dst_fold_policy,
    exceptions: exceptions.map((exception): CalendarRecurrenceException => ({
      kind: exception.exception_kind,
      recurrenceKey: exception.recurrence_key,
      movedLocalStartDate: dateString(exception.moved_local_start_date),
      movedLocalStartTime: exception.moved_local_start_time,
      movedTimeZone: exception.moved_time_zone,
    })),
  };
}

async function insertOccurrences(
  client: PoolClient,
  rows: readonly ExpandedOccurrence[],
): Promise<number> {
  let inserted = 0;
  for (let start = 0; start < rows.length; start += 250) {
    const batch = rows.slice(start, start + 250);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const offset = values.length;
      values.push(
        row.stationId,
        row.profileId,
        row.releaseId,
        row.releaseEventId,
        row.eventKind,
        row.releaseExceptionId,
        row.releaseExceptionId ? "MOVE" : null,
        row.recurrenceKey,
        row.nominalLocalStartDate,
        row.nominalLocalStartTime,
        row.startsAt,
        row.endsAt,
        row.isMoved,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::date, $${offset + 10}::time, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
    });
    const result = await client.query(
      `INSERT INTO calendar_occurrences
         (station_id, profile_id, release_id, release_event_id, event_kind,
          release_exception_id, release_exception_kind, recurrence_key,
          nominal_local_start_date, nominal_local_start_time, starts_at, ends_at, is_moved)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (release_event_id, recurrence_key) DO NOTHING`,
      values,
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function markMaterializationFailed(
  releaseId: string,
  stationId: string,
  horizonFrom: Date,
  targetThrough: Date,
  message: string,
): Promise<void> {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`calendar-release:${releaseId}`]);
    await client.query(
      `INSERT INTO calendar_release_materialization_state
         (station_id, release_id, status, horizon_from, materialized_through,
          target_through, occurrence_count, last_error, updated_at)
       VALUES ($1, $2, 'FAILED', $3, NULL, $4, 0, $5, now())
       ON CONFLICT (release_id) DO UPDATE
         SET status = 'FAILED',
             target_through = GREATEST(calendar_release_materialization_state.target_through, EXCLUDED.target_through),
             last_error = EXCLUDED.last_error, completed_at = NULL,
             version = calendar_release_materialization_state.version + 1,
             updated_at = now()`,
      [stationId, releaseId, horizonFrom, targetThrough, message.slice(0, 2000)],
    );
  });
}

export type CalendarMaterializationResult = {
  releaseId: string;
  materializedThrough: Date;
  occurrenceCount: number;
  insertedOccurrenceCount: number;
  idempotent: boolean;
};

export async function ensureCalendarReleaseMaterialized(
  releaseId: string,
  now?: Date,
): Promise<CalendarMaterializationResult> {
  const failureContext: { stationId?: string; horizonFrom?: Date; targetThrough?: Date } = {};
  try {
    return await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`calendar-release:${releaseId}`]);
      const releaseResult = await client.query<MaterializationReleaseRow>(
        `SELECT release.station_id, station.station_kind, release.profile_id,
                state.status, state.horizon_from, state.materialized_through,
                state.target_through,
                COALESCE($2::timestamptz, clock_timestamp()) AS db_now
           FROM calendar_releases release
           JOIN stations station ON station.id = release.station_id
           LEFT JOIN calendar_release_materialization_state state
             ON state.station_id = release.station_id AND state.release_id = release.id
          WHERE release.id = $1
          FOR SHARE OF release, station`,
        [releaseId, now ?? null],
      );
      const release = releaseResult.rows[0];
      if (!release) throw new HttpError(404, "Calendar release not found.", "CALENDAR_RELEASE_NOT_FOUND");
      const desiredThrough = new Date(release.db_now.getTime() + CALENDAR_HORIZON_DAYS * 24 * 60 * 60 * 1_000);
      const targetThrough = new Date(Math.max(
        desiredThrough.getTime(),
        release.target_through?.getTime() ?? 0,
        release.materialized_through?.getTime() ?? 0,
      ));
      const horizonFrom = release.horizon_from ?? new Date(release.db_now.getTime() - CALENDAR_LOOKBACK_MS);
      failureContext.stationId = release.station_id;
      failureContext.horizonFrom = horizonFrom;
      failureContext.targetThrough = targetThrough;
      if (release.status === "READY" && release.materialized_through
        && release.materialized_through >= desiredThrough) {
        const count = await client.query<{ occurrence_count: string }>(
          "SELECT count(*)::text AS occurrence_count FROM calendar_occurrences WHERE release_id = $1",
          [releaseId],
        );
        return {
          releaseId,
          materializedThrough: release.materialized_through,
          occurrenceCount: Number(count.rows[0]?.occurrence_count ?? 0),
          insertedOccurrenceCount: 0,
          idempotent: true,
        };
      }

      await client.query(
        `INSERT INTO calendar_release_materialization_state
           (station_id, release_id, status, horizon_from, materialized_through,
            target_through, occurrence_count, last_started_at, completed_at,
            last_error, updated_at)
         VALUES ($1, $2, 'RUNNING', $3, NULL, $4, 0, $5, NULL, NULL, now())
         ON CONFLICT (release_id) DO UPDATE
           SET status = 'RUNNING', horizon_from = COALESCE(calendar_release_materialization_state.horizon_from, EXCLUDED.horizon_from),
               target_through = EXCLUDED.target_through, last_started_at = EXCLUDED.last_started_at,
               completed_at = NULL, last_error = NULL,
               version = calendar_release_materialization_state.version + 1, updated_at = now()`,
        [release.station_id, releaseId, horizonFrom, targetThrough, release.db_now],
      );

      const [eventsResult, exceptionsResult] = await Promise.all([
        client.query<ReleaseEventRow>(
          `SELECT id, source_event_id, event_kind, local_start_date,
                  local_start_time::text, time_zone, duration_ms::text,
                  recurrence_kind, recurrence_interval, recurrence_count,
                  recurrence_until_date, recurrence_weekdays, recurrence_month_days,
                  dst_gap_policy, dst_fold_policy
             FROM calendar_release_events
            WHERE release_id = $1 ORDER BY id`,
          [releaseId],
        ),
        client.query<ReleaseExceptionRow>(
          `SELECT id, release_event_id, recurrence_key, exception_kind,
                  moved_local_start_date, moved_local_start_time::text, moved_time_zone
             FROM calendar_release_exceptions
            WHERE release_id = $1 ORDER BY release_event_id, recurrence_key`,
          [releaseId],
        ),
      ]);
      const extensionFrom = release.materialized_through ?? horizonFrom;
      const expanded: ExpandedOccurrence[] = [];
      if (extensionFrom < targetThrough) {
        for (const event of eventsResult.rows) {
          if (expanded.length >= MAX_CALENDAR_OCCURRENCES) {
            throw new HttpError(409, "The Calendar release is too dense to extend.", "CALENDAR_TOO_DENSE");
          }
          const eventExceptions = exceptionsResult.rows.filter((exception) => exception.release_event_id === event.id);
          const movedExceptions = new Map(eventExceptions
            .filter((exception) => exception.exception_kind === "MOVE")
            .map((exception) => [exception.recurrence_key, exception.id]));
          const occurrences = expandCalendarOccurrences(
            definitionFor(event, eventExceptions),
            { from: extensionFrom, to: targetThrough },
            { maxRows: MAX_CALENDAR_OCCURRENCES - expanded.length },
          );
          expanded.push(...occurrences.map((occurrence) => ({
            stationId: release.station_id,
            profileId: release.profile_id,
            releaseId,
            releaseEventId: event.id,
            eventKind: event.event_kind,
            releaseExceptionId: movedExceptions.get(occurrence.recurrenceKey) ?? null,
            recurrenceKey: occurrence.recurrenceKey,
            nominalLocalStartDate: occurrence.nominalLocalStartDate,
            nominalLocalStartTime: occurrence.nominalLocalStartTime,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            isMoved: occurrence.isMoved,
          })));
        }
      }

      const insertedOccurrenceCount = await insertOccurrences(client, expanded);
      if (release.station_kind === "RADIO" && extensionFrom < targetThrough) {
        await materializeCalendarReleaseThrough(client, releaseId, extensionFrom, targetThrough);
      }
      const count = await client.query<{ occurrence_count: string }>(
        "SELECT count(*)::text AS occurrence_count FROM calendar_occurrences WHERE release_id = $1",
        [releaseId],
      );
      const occurrenceCount = Number(count.rows[0]?.occurrence_count ?? 0);
      await client.query(
        `UPDATE calendar_release_materialization_state
            SET status = 'READY', materialized_through = $3, target_through = $3,
                occurrence_count = $4, completed_at = $5, last_error = NULL,
                version = version + 1, updated_at = now()
          WHERE station_id = $1 AND release_id = $2`,
        [release.station_id, releaseId, targetThrough, occurrenceCount, release.db_now],
      );
      return {
        releaseId,
        materializedThrough: targetThrough,
        occurrenceCount,
        insertedOccurrenceCount,
        idempotent: false,
      };
    });
  } catch (error) {
    if (failureContext.stationId && failureContext.horizonFrom && failureContext.targetThrough) {
      const message = error instanceof Error ? error.message : "Calendar materialization failed";
      await markMaterializationFailed(
        releaseId,
        failureContext.stationId,
        failureContext.horizonFrom,
        failureContext.targetThrough,
        message,
      ).catch(() => undefined);
    }
    throw error;
  }
}
