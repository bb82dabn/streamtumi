import { query } from "@/lib/db";
import {
  resolveCalendarRuntime,
  type CalendarRadioOccurrenceItem,
  type CalendarRuntimeResolution,
  type CalendarRuntimeSourceRole,
} from "@/lib/calendar-runtime";
import type { RadioLease, RadioSession } from "@/lib/radio-playout-lease";

export type RadioProgramSource = "CLOCK" | "SILENCE";

export type RadioProgramSnapshot = {
  activeClockReleaseId: string | null;
  clockReady: boolean;
  databaseNow: Date;
};

export type RadioProgramDecision = {
  source: RadioProgramSource;
  key: string;
  releaseId: string | null;
  calendarReleaseId: string | null;
  occurrenceId: string | null;
  sourceRole: CalendarRuntimeSourceRole | null;
  calendarItemId: string | null;
  calendarClockItemId: string | null;
  calendarItemStartsAt: Date | null;
  calendarItemEndsAt: Date | null;
  calendarItemSourceOffsetMs: number | null;
};

export type RadioCalendarProgramContext = Pick<RadioProgramDecision,
  "calendarReleaseId" | "occurrenceId" | "sourceRole" | "calendarItemId">;

const noCalendarContext = {
  calendarReleaseId: null,
  occurrenceId: null,
  sourceRole: null,
  calendarItemId: null,
  calendarClockItemId: null,
  calendarItemStartsAt: null,
  calendarItemEndsAt: null,
  calendarItemSourceOffsetMs: null,
} as const;

export function calendarRadioPlaybackWindow(input: {
  sourceOffsetMs: number;
  startsAt: Date;
  endsAt: Date;
  databaseNow: Date;
  preparedAt: Date;
}): { sourcePositionMs: number; remainingMs: number } {
  const elapsedMs = Math.max(0, input.databaseNow.getTime() - input.startsAt.getTime());
  const preparationMs = Math.max(0, input.preparedAt.getTime() - input.databaseNow.getTime());
  return {
    sourcePositionMs: input.sourceOffsetMs + elapsedMs + preparationMs,
    remainingMs: input.endsAt.getTime() - input.databaseNow.getTime() - preparationMs,
  };
}

export function chooseRadioProgramSource(snapshot: RadioProgramSnapshot): RadioProgramDecision {
  if (snapshot.activeClockReleaseId) {
    return {
      source: "CLOCK",
      key: `clock:${snapshot.activeClockReleaseId}`,
      releaseId: snapshot.activeClockReleaseId,
      ...noCalendarContext,
    };
  }
  return { source: "SILENCE", key: "silence", releaseId: null, ...noCalendarContext };
}

function calendarClockDecision(
  runtime: CalendarRuntimeResolution,
  item: CalendarRadioOccurrenceItem,
  occurrenceId: string,
  sourceRole: "PRIMARY" | "FALLBACK",
): RadioProgramDecision {
  return {
    source: "CLOCK",
    key: `calendar:${runtime.calendarReleaseId}:${occurrenceId}:${sourceRole}:${item.id}:${item.clockItemId}:CLOCK`,
    releaseId: item.clockReleaseId,
    calendarReleaseId: runtime.calendarReleaseId,
    occurrenceId,
    sourceRole,
    calendarItemId: item.id,
    calendarClockItemId: item.clockItemId,
    calendarItemStartsAt: item.startsAt,
    calendarItemEndsAt: item.endsAt,
    calendarItemSourceOffsetMs: item.sourceOffsetMs,
  };
}

function calendarBaselineDecision(
  snapshot: RadioProgramSnapshot,
  runtime: CalendarRuntimeResolution,
): RadioProgramDecision {
  if (!snapshot.activeClockReleaseId) {
    return {
      source: "SILENCE",
      key: `calendar:${runtime.calendarReleaseId}:BASELINE:none:SILENCE`,
      releaseId: null,
      calendarReleaseId: runtime.calendarReleaseId,
      occurrenceId: null,
      sourceRole: null,
      calendarItemId: null,
      calendarClockItemId: null,
      calendarItemStartsAt: null,
      calendarItemEndsAt: null,
      calendarItemSourceOffsetMs: null,
    };
  }
  return {
    source: "CLOCK",
    key: `calendar:${runtime.calendarReleaseId}:BASELINE:${snapshot.activeClockReleaseId}:CLOCK`,
    releaseId: snapshot.activeClockReleaseId,
    calendarReleaseId: runtime.calendarReleaseId,
    occurrenceId: null,
    sourceRole: "BASELINE",
    calendarItemId: null,
    calendarClockItemId: null,
    calendarItemStartsAt: null,
    calendarItemEndsAt: null,
    calendarItemSourceOffsetMs: null,
  };
}

export function chooseCalendarRadioProgramSource(
  snapshot: RadioProgramSnapshot,
  runtime: CalendarRuntimeResolution,
): RadioProgramDecision {
  const occurrence = runtime.occurrence;
  if (!occurrence) return calendarBaselineDecision(snapshot, runtime);
  if (occurrence.eventKind === "OFFLINE") {
    return {
      source: "SILENCE",
      key: `calendar:${runtime.calendarReleaseId}:${occurrence.id}:OFFLINE:SILENCE`,
      releaseId: snapshot.activeClockReleaseId,
      calendarReleaseId: runtime.calendarReleaseId,
      occurrenceId: occurrence.id,
      sourceRole: null,
      calendarItemId: null,
      calendarClockItemId: null,
      calendarItemStartsAt: null,
      calendarItemEndsAt: null,
      calendarItemSourceOffsetMs: null,
    };
  }
  if (occurrence.source.kind === "RADIO_CLOCK_BLOCK" && occurrence.source.item) {
    return calendarClockDecision(runtime, occurrence.source.item, occurrence.id, "PRIMARY");
  }
  return {
    ...calendarBaselineDecision(snapshot, runtime),
    source: "SILENCE",
    key: `calendar:${runtime.calendarReleaseId}:${occurrence.id}:PRIMARY:none:SILENCE`,
    occurrenceId: occurrence.id,
    sourceRole: "PRIMARY",
  };
}

export async function loadRadioProgramDecision(stationId: string): Promise<RadioProgramDecision | null> {
  const result = await query<{
    active_clock_release_id: string | null;
    clock_ready: boolean;
    database_now: Date;
  }>(
    `SELECT station.active_clock_release_id,
            (station.active_clock_release_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM clock_timeline_items timeline
              JOIN radio_timeline_delivery delivery ON delivery.timeline_item_id = timeline.id
              WHERE timeline.release_id = station.active_clock_release_id
                AND timeline.starts_at <= clock_timestamp() AND timeline.ends_at > clock_timestamp()
            )) AS clock_ready,
            clock_timestamp() AS database_now
       FROM stations station
      WHERE station.id = $1 AND station.station_kind = 'RADIO'
        AND station.broadcast_state = 'RUNNING' AND station.deleted_at IS NULL
        AND station.moderation_status = 'ACTIVE'`,
    [stationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const snapshot: RadioProgramSnapshot = {
    activeClockReleaseId: row.active_clock_release_id,
    clockReady: row.clock_ready,
    databaseNow: row.database_now,
  };
  const calendarRuntime = await resolveCalendarRuntime(stationId, row.database_now);
  return calendarRuntime?.stationKind === "RADIO"
    ? chooseCalendarRadioProgramSource(snapshot, calendarRuntime)
    : chooseRadioProgramSource(snapshot);
}

export async function acknowledgeRadioProgramSource(
  lease: RadioLease,
  outputSession: RadioSession,
  source: RadioProgramSource,
  calendarContext?: RadioCalendarProgramContext,
): Promise<boolean> {
  const result = await query(
    `UPDATE radio_playout_state playout
         SET program_source = $5,
             calendar_release_id = $6::uuid, occurrence_id = $7::uuid,
             source_role = $8::calendar_source_role,
             current_timeline_item_id = CASE
               WHEN $5 = 'CLOCK' AND $9::uuid IS NULL THEN playout.current_timeline_item_id
               ELSE NULL
             END,
             current_calendar_item_id = CASE WHEN $5 = 'CLOCK' THEN $9::uuid ELSE NULL END,
             source_changed_at = CASE
               WHEN playout.program_source <> $5
                 OR playout.calendar_release_id IS DISTINCT FROM $6::uuid
                 OR playout.occurrence_id IS DISTINCT FROM $7::uuid
                 OR playout.source_role IS DISTINCT FROM $8::calendar_source_role
                 OR playout.current_calendar_item_id IS DISTINCT FROM $9::uuid
               THEN now() ELSE playout.source_changed_at END,
             heartbeat_at = now(), updated_at = now()
        FROM radio_playout_leases active_lease
       WHERE playout.station_id = $1 AND active_lease.station_id = playout.station_id
         AND active_lease.holder_id = $2 AND active_lease.fence = $3
         AND active_lease.lease_until > clock_timestamp()
         AND playout.lease_fence = active_lease.fence AND playout.active_session_id = $4`,
    [lease.stationId, lease.holderId, lease.fence, outputSession.id, source,
      calendarContext?.calendarReleaseId ?? null, calendarContext?.occurrenceId ?? null,
      calendarContext?.sourceRole ?? null, calendarContext?.calendarItemId ?? null],
  );
  return Boolean(result.rowCount);
}
