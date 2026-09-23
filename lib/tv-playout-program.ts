import { query } from "@/lib/db";
import type { TvPlayoutLease } from "@/lib/tv-playout-lease";

export type TvAutomationSnapshot = {
  stationId: string;
  fallbackScheduleId: string;
  databaseNow: Date;
};

export async function claimTvPlayoutState(lease: TvPlayoutLease): Promise<boolean> {
  const result = await query(
    `INSERT INTO tv_playout_state
       (station_id, observed_source, lease_fence, source_changed_at, updated_at)
     SELECT lease.station_id, 'AUTOMATION', lease.fence, now(), now()
       FROM tv_playout_leases lease
      WHERE lease.station_id = $1 AND lease.holder_id = $2 AND lease.fence = $3
        AND lease.lease_until > clock_timestamp()
     ON CONFLICT (station_id) DO UPDATE
       SET observed_source = 'AUTOMATION', lease_fence = EXCLUDED.lease_fence, updated_at = now()
     RETURNING station_id`,
    [lease.stationId, lease.holderId, lease.fence],
  );
  return result.rowCount === 1;
}

export async function loadTvAutomationSnapshot(lease: TvPlayoutLease): Promise<TvAutomationSnapshot | null> {
  const result = await query<{
    station_id: string;
    fallback_schedule_id: string;
    database_now: Date;
  }>(
    `SELECT station.id AS station_id, station.active_schedule_id AS fallback_schedule_id,
            clock_timestamp() AS database_now
       FROM tv_playout_leases lease
       JOIN stations station ON station.id = lease.station_id
      WHERE lease.station_id = $1 AND lease.holder_id = $2 AND lease.fence = $3
        AND lease.lease_until > clock_timestamp()
        AND station.station_kind = 'TV' AND station.programming_mode = 'LEGACY_LOOP'
        AND station.tv_delivery_mode = 'CHANNEL_HLS' AND station.broadcast_state = 'RUNNING'
        AND station.active_schedule_id IS NOT NULL
        AND station.deleted_at IS NULL AND station.moderation_status = 'ACTIVE'`,
    [lease.stationId, lease.holderId, lease.fence],
  );
  const row = result.rows[0];
  return row ? {
    stationId: row.station_id,
    fallbackScheduleId: row.fallback_schedule_id,
    databaseNow: row.database_now,
  } : null;
}
