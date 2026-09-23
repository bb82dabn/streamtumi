import type { PoolClient } from "pg";
import type { UserRole } from "@/lib/auth";
import { HttpError } from "@/lib/http";

export const accountLifecycleLockId = 7_155_204_285;

type LifecycleUser = {
  id: string;
  role: UserRole;
  disabled_at: Date | null;
};

export async function assertNotLastEnabledAdmin(client: PoolClient, target: LifecycleUser): Promise<void> {
  if (target.role !== "ADMIN" || target.disabled_at) return;
  const result = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM users
      WHERE role = 'ADMIN' AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
  );
  if ((result.rows[0]?.count ?? 0) <= 1) {
    throw new HttpError(409, "The last enabled administrator cannot be removed or disabled.", "LAST_ENABLED_ADMIN");
  }
}

export async function scheduleOwnedStationsForDeletion(
  client: PoolClient,
  userId: string,
  graceDays: number,
  preserveLegalHolds: boolean,
): Promise<{ owned: number; scheduled: number; held: number }> {
  const stations = await client.query<{ id: string; legal_hold_at: Date | null }>(
    "SELECT id, legal_hold_at FROM stations WHERE owner_id = $1 ORDER BY id FOR UPDATE",
    [userId],
  );
  const held = stations.rows.filter((station) => station.legal_hold_at).length;
  if (held && !preserveLegalHolds) {
    throw new HttpError(409, "This user owns a station under legal hold and cannot be deleted.", "LEGAL_HOLD");
  }

  const scheduled = await client.query(
    `UPDATE stations
        SET deleted_access_enabled = CASE WHEN deleted_at IS NULL THEN access_enabled ELSE deleted_access_enabled END,
            deleted_at = COALESCE(deleted_at, now()),
            purge_after = CASE WHEN deleted_at IS NULL THEN now() + ($2 * interval '1 day')
                               ELSE COALESCE(purge_after, now() + ($2 * interval '1 day')) END,
            access_enabled = false, broadcast_state = 'STOPPED', stopped_at = now(), updated_at = now()
      WHERE owner_id = $1`,
    [userId, graceDays],
  );
  return { owned: stations.rowCount ?? 0, scheduled: scheduled.rowCount ?? 0, held };
}

export async function revokeAccountCredentials(
  client: PoolClient,
  userId: string,
): Promise<{ sessions: number; refreshTokens: number; moderationTokens: number }> {
  const sessions = await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  const refreshTokens = await client.query(
    "UPDATE mobile_refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
  const moderationTokens = await client.query(
    "UPDATE moderation_service_tokens SET active = false WHERE created_by_user_id = $1 AND active = true",
    [userId],
  );
  await client.query(
    "UPDATE password_reset_tokens SET invalidated_at = now() WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL",
    [userId],
  );
  await client.query(
    "UPDATE email_verification_tokens SET invalidated_at = now() WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL",
    [userId],
  );
  return {
    sessions: sessions.rowCount ?? 0,
    refreshTokens: refreshTokens.rowCount ?? 0,
    moderationTokens: moderationTokens.rowCount ?? 0,
  };
}

export async function clearAccountRelationships(client: PoolClient, userId: string): Promise<void> {
  await client.query("DELETE FROM station_fans WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM station_ratings WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM station_tunes WHERE user_id = $1", [userId]);
  await client.query(
    "DELETE FROM user_blocks WHERE blocker_user_id = $1 OR blocked_user_id = $1",
    [userId],
  );
}
