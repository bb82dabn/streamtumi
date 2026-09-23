import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/redis";
import { startWorkerHeartbeat, type WorkerHeartbeat } from "@/lib/worker-health";
import { resolveCalendarRuntime } from "@/lib/calendar-runtime";
import {
  appendTvJournalSegments,
  latestTvJournalSegment,
  loadTvAutomationSchedulePlan,
  planTvJournalCatchUp,
  type TvCalendarAppendContext,
} from "@/lib/tv-segment-journal";
import {
  acquireTvPlayoutLease,
  releaseTvPlayoutLease,
  renewTvPlayoutLease,
  type TvPlayoutLease,
} from "@/lib/tv-playout-lease";
import {
  claimTvPlayoutState,
  loadTvAutomationSnapshot,
  type TvAutomationSnapshot,
} from "@/lib/tv-playout-program";

type DesiredTvStation = { id: string };
type StationRuntime = {
  stationId: string;
  lease: TvPlayoutLease;
  leaseExpiryTimer: ReturnType<typeof setTimeout> | null;
};

const maxCatchUpMs = 30_000;
const normalAheadMs = 12_000;
const maxAppendSegments = 30;
const holderId = randomUUID();
const runtimes = new Map<string, StationRuntime>();
let heartbeat: WorkerHeartbeat | null = null;
let shuttingDown = false;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function armLeaseExpiry(runtime: StationRuntime): void {
  if (runtime.leaseExpiryTimer) clearTimeout(runtime.leaseExpiryTimer);
  const delay = Math.max(0, runtime.lease.leaseUntil.getTime() - Date.now());
  runtime.leaseExpiryTimer = setTimeout(() => {
    console.error(`TV playout lease expired locally for ${runtime.stationId}; stopping automation.`);
    void stopRuntime(runtime, false);
  }, delay);
}

async function desiredStations(limit: number): Promise<DesiredTvStation[]> {
  const result = await query<DesiredTvStation>(
    `SELECT station.id
       FROM stations station
       JOIN schedules schedule
         ON schedule.id = station.active_schedule_id AND schedule.station_id = station.id
       LEFT JOIN tv_playout_leases active_lease
         ON active_lease.station_id = station.id
        AND active_lease.lease_until > clock_timestamp()
      WHERE station.station_kind = 'TV'
        AND station.programming_mode = 'LEGACY_LOOP'
        AND station.tv_delivery_mode = 'CHANNEL_HLS'
        AND station.broadcast_state = 'RUNNING'
        AND station.schedule_started_at IS NOT NULL
        AND station.schedule_started_at <= clock_timestamp() + interval '30 seconds'
        AND station.deleted_at IS NULL
        AND station.moderation_status = 'ACTIVE'
        AND (
          NOT EXISTS (
            SELECT 1 FROM station_programming_profiles profile
             WHERE profile.id = station.active_programming_profile_id
               AND profile.station_id = station.id
               AND profile.strategy = 'CALENDAR_EVENTS'
          )
          OR EXISTS (
            SELECT 1
              FROM station_programming_profiles profile
              JOIN calendar_releases release
                ON release.station_id = profile.station_id
               AND release.profile_id = profile.id
              JOIN calendar_release_materialization_state materialization
                ON materialization.station_id = release.station_id
               AND materialization.release_id = release.id
             WHERE profile.id = station.active_programming_profile_id
               AND profile.station_id = station.id
               AND profile.strategy = 'CALENDAR_EVENTS'
               AND profile.lifecycle = 'ACTIVE'
               AND release.id = station.active_calendar_release_id
               AND materialization.status = 'READY'
          )
        )
        AND (active_lease.station_id IS NULL OR active_lease.holder_id = $1::uuid)
        AND EXISTS (SELECT 1 FROM schedule_items item WHERE item.schedule_id = schedule.id)
        AND schedule.total_duration_ms = (
          SELECT sum(item.duration_ms + schedule.transition_ms)
            FROM schedule_items item WHERE item.schedule_id = schedule.id
        )
        AND NOT EXISTS (
          SELECT 1
            FROM schedule_items item
            LEFT JOIN tv_schedule_item_delivery delivery ON delivery.schedule_item_id = item.id
            LEFT JOIN tv_channel_derivatives derivative ON derivative.id = delivery.derivative_id
            LEFT JOIN tv_channel_delivery_descriptors descriptor ON descriptor.id = derivative.descriptor_id
            LEFT JOIN tv_channel_transition_fillers filler ON filler.id = delivery.transition_filler_id
           WHERE item.schedule_id = schedule.id
             AND (delivery.schedule_item_id IS NULL
               OR descriptor.profile IS DISTINCT FROM 'tv-channel-v1'
               OR descriptor.duration_ms IS DISTINCT FROM item.duration_ms
               OR (schedule.transition_ms = 0 AND delivery.transition_filler_id IS NOT NULL)
               OR (schedule.transition_ms > 0 AND (
                 filler.id IS NULL
                 OR filler.station_id IS DISTINCT FROM station.id
                 OR filler.transition_ms IS DISTINCT FROM schedule.transition_ms
               )))
        )
      ORDER BY (active_lease.holder_id = $1::uuid) DESC, station.updated_at, station.id
      LIMIT $2`,
    [holderId, limit],
  );
  return result.rows;
}

async function appendAutomation(runtime: StationRuntime, snapshot: TvAutomationSnapshot): Promise<void> {
  const calendarRuntime = await resolveCalendarRuntime(runtime.stationId, snapshot.databaseNow);
  let scheduleId = snapshot.fallbackScheduleId;
  let startedAt: Date | undefined;
  let calendarContext: TvCalendarAppendContext | undefined;
  if (calendarRuntime) {
    const source = calendarRuntime.desiredSource;
    const sourceRole = calendarRuntime.desiredSourceRole;
    if (source.kind !== "TV_SCHEDULE" || !sourceRole) return;
    const occurrenceId = sourceRole === "BASELINE" ? null : calendarRuntime.occurrence?.id ?? null;
    if (sourceRole !== "BASELINE" && !occurrenceId) return;
    scheduleId = source.scheduleId;
    startedAt = source.epochAt;
    calendarContext = {
      calendarReleaseId: calendarRuntime.calendarReleaseId,
      occurrenceId,
      sourceRole,
      epochAt: source.epochAt,
    };
  }

  const tail = await latestTvJournalSegment(runtime.stationId);
  if (tail && tail.endsAt.getTime() >= snapshot.databaseNow.getTime() + normalAheadMs) return;
  const schedule = await loadTvAutomationSchedulePlan(runtime.stationId, scheduleId, startedAt);
  if (!schedule) throw new Error("TV automation schedule is no longer available.");
  let planned = planTvJournalCatchUp(schedule, {
    now: snapshot.databaseNow,
    tailEndsAt: tail?.endsAt ?? null,
    maxCatchUpMs: calendarContext ? 0 : maxCatchUpMs,
    aheadMs: normalAheadMs,
    maxSegments: maxAppendSegments,
    through: calendarRuntime?.nextBoundaryAt ?? undefined,
  });
  if (calendarContext && tail && tail.endsAt.getTime() < snapshot.databaseNow.getTime()) {
    planned = planned.filter((segment) => segment.startsAt.getTime() >= snapshot.databaseNow.getTime());
    if (planned[0] && !planned[0].discontinuity) planned[0] = { ...planned[0], discontinuity: true };
  }
  if (planned.length) await appendTvJournalSegments(runtime.lease, planned, calendarContext);
}

async function acquireRuntime(stationId: string): Promise<StationRuntime | null> {
  const lease = await acquireTvPlayoutLease(stationId, holderId, env().TV_PLAYOUT_LEASE_SECONDS);
  if (!lease) return null;
  if (!await claimTvPlayoutState(lease)) {
    await releaseTvPlayoutLease(lease).catch(() => undefined);
    return null;
  }
  const runtime: StationRuntime = { stationId, lease, leaseExpiryTimer: null };
  runtimes.set(stationId, runtime);
  armLeaseExpiry(runtime);
  return runtime;
}

async function stopRuntime(runtime: StationRuntime, releaseLease: boolean): Promise<void> {
  if (runtimes.get(runtime.stationId) === runtime) runtimes.delete(runtime.stationId);
  if (runtime.leaseExpiryTimer) clearTimeout(runtime.leaseExpiryTimer);
  runtime.leaseExpiryTimer = null;
  if (releaseLease) await releaseTvPlayoutLease(runtime.lease).catch(() => undefined);
}

async function reconcileStation(station: DesiredTvStation): Promise<void> {
  const runtime = runtimes.get(station.id) ?? await acquireRuntime(station.id);
  if (!runtime) return;
  const renewed = await renewTvPlayoutLease(runtime.lease, env().TV_PLAYOUT_LEASE_SECONDS);
  if (!renewed) {
    await stopRuntime(runtime, false);
    return;
  }
  if (shuttingDown || runtimes.get(station.id) !== runtime) {
    await releaseTvPlayoutLease(renewed).catch(() => undefined);
    return;
  }
  runtime.lease = renewed;
  armLeaseExpiry(runtime);
  if (!await claimTvPlayoutState(renewed)) {
    await stopRuntime(runtime, false);
    return;
  }
  const snapshot = await loadTvAutomationSnapshot(renewed);
  if (!snapshot) throw new Error("TV station lost its playout or station fence.");
  await appendAutomation(runtime, snapshot);
}

async function reconcile(): Promise<void> {
  const desired = await desiredStations(env().TV_PLAYOUT_MAX_STATIONS);
  const desiredIds = new Set(desired.map((station) => station.id));
  for (const runtime of [...runtimes.values()]) {
    if (!desiredIds.has(runtime.stationId)) await stopRuntime(runtime, true);
  }
  for (const station of desired) {
    try {
      await reconcileStation(station);
    } catch (error) {
      console.error(`TV playout reconciliation failed for ${station.id}:`, error instanceof Error ? error.message : error);
    }
  }
}

async function main(): Promise<void> {
  console.info(`Starting fenced TV playout arbiter ${holderId} with capacity ${env().TV_PLAYOUT_MAX_STATIONS}`);
  heartbeat = await startWorkerHeartbeat("tv-playout");
  while (!shuttingDown) {
    try { await reconcile(); }
    catch (error) { console.error("TV playout reconciliation failed:", error); }
    if (!shuttingDown) await sleep(env().TV_PLAYOUT_RECONCILE_SECONDS * 1_000);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; stopping fenced TV playout arbiter`);
  await heartbeat?.stop();
  await Promise.allSettled([...runtimes.values()].map((runtime) => stopRuntime(runtime, true)));
  await getRedis().quit();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void main();
