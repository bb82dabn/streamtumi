import { query } from "@/lib/db";

export type TvPlayoutLease = {
  stationId: string;
  holderId: string;
  fence: number;
  leaseUntil: Date;
};

type LeaseRow = {
  station_id: string;
  holder_id: string;
  fence: string;
  lease_until: Date;
};

function leaseDuration(leaseSeconds: number): number {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) {
    throw new Error("TV playout lease duration must be an integer between 1 and 300 seconds.");
  }
  return leaseSeconds;
}

function leaseFromRow(row: LeaseRow): TvPlayoutLease {
  const fence = Number(row.fence);
  if (!Number.isSafeInteger(fence) || fence < 1) throw new Error("TV playout lease fence is outside the supported range.");
  return {
    stationId: row.station_id,
    holderId: row.holder_id,
    fence,
    leaseUntil: row.lease_until,
  };
}

export async function acquireTvPlayoutLease(
  stationId: string,
  holderId: string,
  leaseSeconds: number,
): Promise<TvPlayoutLease | null> {
  const result = await query<LeaseRow>(
    `INSERT INTO tv_playout_leases (station_id, holder_id, fence, lease_until)
     SELECT station.id, $2::uuid, 1, clock_timestamp() + ($3 * interval '1 second')
       FROM stations station
      WHERE station.id = $1
        AND station.station_kind = 'TV'
        AND station.tv_delivery_mode = 'CHANNEL_HLS'
        AND station.broadcast_state = 'RUNNING'
        AND station.deleted_at IS NULL
        AND station.moderation_status = 'ACTIVE'
     ON CONFLICT (station_id) DO UPDATE
       SET holder_id = EXCLUDED.holder_id,
           fence = CASE
             WHEN tv_playout_leases.holder_id = EXCLUDED.holder_id
              AND tv_playout_leases.lease_until > clock_timestamp()
             THEN tv_playout_leases.fence
             ELSE tv_playout_leases.fence + 1
           END,
           lease_until = clock_timestamp() + ($3 * interval '1 second'),
           updated_at = clock_timestamp()
       WHERE tv_playout_leases.lease_until <= clock_timestamp()
          OR tv_playout_leases.holder_id = EXCLUDED.holder_id
     RETURNING station_id, holder_id, fence::text, lease_until`,
    [stationId, holderId, leaseDuration(leaseSeconds)],
  );
  return result.rows[0] ? leaseFromRow(result.rows[0]) : null;
}

export async function renewTvPlayoutLease(
  lease: TvPlayoutLease,
  leaseSeconds: number,
): Promise<TvPlayoutLease | null> {
  const result = await query<LeaseRow>(
    `UPDATE tv_playout_leases
        SET lease_until = clock_timestamp() + ($4 * interval '1 second'),
            updated_at = clock_timestamp()
      WHERE station_id = $1
        AND holder_id = $2
        AND fence = $3
        AND lease_until > clock_timestamp()
      RETURNING station_id, holder_id, fence::text, lease_until`,
    [lease.stationId, lease.holderId, lease.fence, leaseDuration(leaseSeconds)],
  );
  return result.rows[0] ? leaseFromRow(result.rows[0]) : null;
}

export async function releaseTvPlayoutLease(lease: TvPlayoutLease): Promise<boolean> {
  const result = await query(
    `UPDATE tv_playout_leases
        SET lease_until = clock_timestamp(), updated_at = clock_timestamp()
      WHERE station_id = $1 AND holder_id = $2 AND fence = $3`,
    [lease.stationId, lease.holderId, lease.fence],
  );
  return Boolean(result.rowCount);
}
