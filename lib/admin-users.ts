import { hash } from "bcryptjs";
import type { PoolClient } from "pg";
import type { AuthUser, UserRole } from "@/lib/auth";
import {
  accountLifecycleLockId,
  assertNotLastEnabledAdmin,
  clearAccountRelationships,
  revokeAccountCredentials,
  scheduleOwnedStationsForDeletion,
} from "@/lib/account-deletion";
import type { AdminAuditEntry, AdminUserMutation } from "@/lib/admin-dashboard";
import { transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";

type ManagedUserRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  version: number;
  updated_at: Date;
  disabled_at: Date | null;
  disabled_reason: string | null;
  disabled_by_user_id: string | null;
  must_change_password: boolean;
  deletion_requested_at: Date | null;
  anonymize_after: Date | null;
  deletion_requested_by_user_id: string | null;
  anonymized_at: Date | null;
};

type AuditRow = {
  id: string;
  actor_name: string;
  target_label: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type MutationResult = { user: AdminUserMutation; audit: AdminAuditEntry | null };

const managedUserColumns = `id, email, display_name, role, version, updated_at,
  disabled_at, disabled_reason, disabled_by_user_id, must_change_password,
  deletion_requested_at, anonymize_after, deletion_requested_by_user_id, anonymized_at`;

function statusOf(row: ManagedUserRow): AdminUserMutation["status"] {
  if (row.anonymized_at) return "ANONYMIZED";
  if (row.deletion_requested_at) return "DELETION_PENDING";
  if (row.disabled_at) return "DISABLED";
  return "ACTIVE";
}

function presentUser(row: ManagedUserRow): AdminUserMutation {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: statusOf(row),
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
    disabledAt: row.disabled_at?.toISOString() ?? null,
    disabledReason: row.disabled_reason,
    mustChangePassword: row.must_change_password,
    deletionRequestedAt: row.deletion_requested_at?.toISOString() ?? null,
    anonymizeAfter: row.anonymize_after?.toISOString() ?? null,
    anonymizedAt: row.anonymized_at?.toISOString() ?? null,
  };
}

function presentAudit(row: AuditRow): AdminAuditEntry {
  return {
    id: row.id,
    actorName: row.actor_name,
    targetLabel: row.target_label,
    action: row.action,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function mapConcurrentConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (["40001", "40P01"].includes(databaseCode(error) ?? "")) {
      throw new HttpError(409, "Administrator access changed concurrently. Refresh and try again.", "ADMIN_CONFLICT");
    }
    throw error;
  }
}

async function audit(
  client: PoolClient,
  actor: ManagedUserRow,
  target: ManagedUserRow,
  action: string,
  metadata: Record<string, unknown>,
): Promise<AdminAuditEntry> {
  const result = await client.query<AuditRow>(
    `INSERT INTO admin_audit_log
       (actor_user_id, actor_name, target_user_id, target_label, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, actor_name, target_label, action, metadata, created_at`,
    [actor.id, actor.display_name, target.id, target.email, action, metadata],
  );
  return presentAudit(result.rows[0]);
}

async function privilegedMutation<T>(
  targetUserId: string,
  expectedVersion: number,
  actorIdentity: AuthUser,
  work: (client: PoolClient, actor: ManagedUserRow, target: ManagedUserRow) => Promise<T>,
): Promise<T> {
  return mapConcurrentConflict(() => transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock($1)", [accountLifecycleLockId]);
    const actorResult = await client.query<ManagedUserRow>(
      `SELECT ${managedUserColumns} FROM users WHERE id = $1 FOR UPDATE`,
      [actorIdentity.id],
    );
    const actor = actorResult.rows[0];
    if (!actor || actor.role !== "ADMIN" || actor.disabled_at || actor.deletion_requested_at || actor.anonymized_at || actor.must_change_password) {
      throw new HttpError(403, "Your administrator access is no longer active.", "ADMIN_ACCESS_REVOKED");
    }

    const targetResult = await client.query<ManagedUserRow>(
      `SELECT ${managedUserColumns} FROM users WHERE id = $1 FOR UPDATE`,
      [targetUserId],
    );
    const target = targetResult.rows[0];
    if (!target) throw new HttpError(404, "User not found.", "NOT_FOUND");
    if (target.version !== expectedVersion) {
      throw new HttpError(409, "The account changed. Refresh before trying again.", "VERSION_CONFLICT");
    }
    return work(client, actor, target);
  }));
}

function assertManageable(target: ManagedUserRow): void {
  if (target.anonymized_at) throw new HttpError(409, "An anonymized account cannot be changed.", "USER_ANONYMIZED");
  if (target.deletion_requested_at) throw new HttpError(409, "Account deletion is already irreversible and pending anonymization.", "USER_DELETION_PENDING");
}

async function revokeCredentials(client: PoolClient, targetUserId: string): Promise<{ sessions: number; tokens: number; refreshTokens: number }> {
  const revoked = await revokeAccountCredentials(client, targetUserId);
  return { sessions: revoked.sessions, tokens: revoked.moderationTokens, refreshTokens: revoked.refreshTokens };
}

export async function updateUserProfile(
  targetUserId: string,
  profile: { displayName: string; email: string; expectedVersion: number },
  actor: AuthUser,
): Promise<MutationResult> {
  try {
    return await privilegedMutation(targetUserId, profile.expectedVersion, actor, async (client, lockedActor, target) => {
      assertManageable(target);
      if (target.display_name === profile.displayName && target.email === profile.email) {
        return { user: presentUser(target), audit: null };
      }
      const changedFields = [
        ...(target.display_name !== profile.displayName ? ["displayName"] : []),
        ...(target.email !== profile.email ? ["email"] : []),
      ];
      const result = await client.query<ManagedUserRow>(
        `UPDATE users SET display_name = $2, email = $3, version = version + 1, updated_at = now()
          WHERE id = $1 AND version = $4 RETURNING ${managedUserColumns}`,
        [target.id, profile.displayName, profile.email, profile.expectedVersion],
      );
      if (!result.rows[0]) throw new HttpError(409, "The account changed. Refresh before trying again.", "VERSION_CONFLICT");
      const entry = await audit(client, lockedActor, target, "USER_PROFILE_UPDATED", {
        changedFields,
        ...(target.email !== profile.email ? { email: { from: target.email, to: profile.email } } : {}),
      });
      return { user: presentUser(result.rows[0]), audit: entry };
    });
  } catch (error) {
    if (databaseCode(error) === "23505") {
      throw new HttpError(409, "An account already exists for that email.", "EMAIL_EXISTS");
    }
    throw error;
  }
}

export async function changeUserRole(
  targetUserId: string,
  role: UserRole,
  expectedVersion: number,
  actor: AuthUser,
): Promise<MutationResult> {
  return privilegedMutation(targetUserId, expectedVersion, actor, async (client, lockedActor, target) => {
    assertManageable(target);
    if (target.id === lockedActor.id && role !== "ADMIN") {
      throw new HttpError(409, "You cannot remove your own administrator access.", "SELF_DEMOTION");
    }
    if (target.role === role) return { user: presentUser(target), audit: null };
    if (role !== "ADMIN") await assertNotLastEnabledAdmin(client, target);

    const result = await client.query<ManagedUserRow>(
      `UPDATE users SET role = $2::user_role, version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $3 RETURNING ${managedUserColumns}`,
      [target.id, role, expectedVersion],
    );
    if (!result.rows[0]) throw new HttpError(409, "The account changed. Refresh before trying again.", "VERSION_CONFLICT");
    const revoked = await revokeCredentials(client, target.id);
    const entry = await audit(client, lockedActor, target, "USER_ROLE_CHANGED", {
      from: target.role,
      to: role,
      sessionsRevoked: revoked.sessions,
      mobileRefreshTokensRevoked: revoked.refreshTokens,
      moderationTokensRevoked: revoked.tokens,
    });
    return { user: presentUser(result.rows[0]), audit: entry };
  });
}

export async function setUserDisabled(
  targetUserId: string,
  disabled: boolean,
  reason: string | undefined,
  expectedVersion: number,
  actor: AuthUser,
): Promise<MutationResult> {
  return privilegedMutation(targetUserId, expectedVersion, actor, async (client, lockedActor, target) => {
    assertManageable(target);
    if (disabled && target.id === lockedActor.id) {
      throw new HttpError(409, "You cannot disable your own account.", "SELF_DISABLE");
    }
    if (Boolean(target.disabled_at) === disabled) return { user: presentUser(target), audit: null };
    if (disabled) await assertNotLastEnabledAdmin(client, target);

    const result = await client.query<ManagedUserRow>(
      `UPDATE users
          SET disabled_at = CASE WHEN $2 THEN now() ELSE NULL END,
              disabled_reason = CASE WHEN $2 THEN $3 ELSE NULL END,
              disabled_by_user_id = CASE WHEN $2 THEN $4::uuid ELSE NULL END,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $5 RETURNING ${managedUserColumns}`,
      [target.id, disabled, disabled ? reason : null, lockedActor.id, expectedVersion],
    );
    if (!result.rows[0]) throw new HttpError(409, "The account changed. Refresh before trying again.", "VERSION_CONFLICT");
    const revoked = disabled ? await revokeCredentials(client, target.id) : { sessions: 0, tokens: 0, refreshTokens: 0 };
    const entry = await audit(client, lockedActor, target, disabled ? "USER_DISABLED" : "USER_RE_ENABLED", {
      ...(disabled ? { reason, sessionsRevoked: revoked.sessions, mobileRefreshTokensRevoked: revoked.refreshTokens, moderationTokensRevoked: revoked.tokens } : {}),
    });
    return { user: presentUser(result.rows[0]), audit: entry };
  });
}

export async function assignTemporaryPassword(
  targetUserId: string,
  password: string,
  expectedVersion: number,
  actor: AuthUser,
): Promise<MutationResult> {
  const passwordHash = await hash(password, 12);
  return privilegedMutation(targetUserId, expectedVersion, actor, async (client, lockedActor, target) => {
    assertManageable(target);
    const result = await client.query<ManagedUserRow>(
      `UPDATE users
          SET password_hash = $2, must_change_password = true,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $3 RETURNING ${managedUserColumns}`,
      [target.id, passwordHash, expectedVersion],
    );
    if (!result.rows[0]) throw new HttpError(409, "The account changed. Refresh before trying again.", "VERSION_CONFLICT");
    const revoked = await revokeCredentials(client, target.id);
    const entry = await audit(client, lockedActor, target, "USER_TEMPORARY_PASSWORD_SET", {
      mustChangePassword: true,
      sessionsRevoked: revoked.sessions,
      mobileRefreshTokensRevoked: revoked.refreshTokens,
      moderationTokensRevoked: revoked.tokens,
    });
    return { user: presentUser(result.rows[0]), audit: entry };
  });
}

export async function requestUserDeletion(
  targetUserId: string,
  confirmation: string,
  expectedVersion: number,
  actor: AuthUser,
): Promise<MutationResult> {
  return privilegedMutation(targetUserId, expectedVersion, actor, async (client, lockedActor, target) => {
    assertManageable(target);
    if (target.id === lockedActor.id) throw new HttpError(409, "You cannot delete your own account.", "SELF_DELETE");
    if (confirmation !== target.email) throw new HttpError(400, "Type the account email exactly to confirm deletion.", "DELETE_CONFIRMATION_MISMATCH");
    await assertNotLastEnabledAdmin(client, target);

    const graceDays = env().STATION_DELETE_GRACE_DAYS;
    const stations = await scheduleOwnedStationsForDeletion(client, target.id, graceDays, false);
    const result = await client.query<ManagedUserRow>(
      `UPDATE users
          SET disabled_at = COALESCE(disabled_at, now()),
              disabled_reason = 'Account deletion requested by an administrator',
              disabled_by_user_id = $2,
              deletion_requested_at = now(), anonymize_after = now() + ($3 * interval '1 day'),
              deletion_requested_by_user_id = $2, avatar_revision = NULL,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $4 RETURNING ${managedUserColumns}`,
      [target.id, lockedActor.id, graceDays, expectedVersion],
    );
    if (!result.rows[0]) throw new HttpError(409, "The account changed. Refresh before trying again.", "VERSION_CONFLICT");
    const revoked = await revokeCredentials(client, target.id);
    await clearAccountRelationships(client, target.id);
    const entry = await audit(client, lockedActor, target, "USER_DELETION_REQUESTED", {
      irreversible: true,
      ownedStations: stations.owned,
      stationsScheduled: stations.scheduled,
      sessionsRevoked: revoked.sessions,
      mobileRefreshTokensRevoked: revoked.refreshTokens,
      moderationTokensRevoked: revoked.tokens,
      anonymizeAfter: result.rows[0].anonymize_after?.toISOString(),
    });
    return { user: presentUser(result.rows[0]), audit: entry };
  });
}

export async function bootstrapFirstAdmin(email: string): Promise<AdminUserMutation> {
  return mapConcurrentConflict(() => transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock($1)", [accountLifecycleLockId]);
    const admins = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM users
        WHERE role = 'ADMIN' AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
    );
    if ((admins.rows[0]?.count ?? 0) > 0) {
      throw new HttpError(409, "An enabled administrator already exists; provide --actor-email.", "ADMIN_EXISTS");
    }
    const targetResult = await client.query<ManagedUserRow>(
      `SELECT ${managedUserColumns} FROM users WHERE lower(btrim(email)) = $1 FOR UPDATE`,
      [email],
    );
    const target = targetResult.rows[0];
    if (!target) throw new HttpError(404, `No user exists for ${email}`, "NOT_FOUND");
    assertManageable(target);
    if (target.disabled_at) throw new HttpError(409, "A disabled account cannot bootstrap administration.", "USER_DISABLED");
    const result = await client.query<ManagedUserRow>(
      `UPDATE users SET role = 'ADMIN', version = version + 1, updated_at = now()
        WHERE id = $1 RETURNING ${managedUserColumns}`,
      [target.id],
    );
    await client.query(
      `INSERT INTO admin_audit_log
         (actor_user_id, actor_name, target_user_id, target_label, action, metadata)
       VALUES (NULL, 'System bootstrap CLI', $1, $2, 'USER_ROLE_CHANGED', $3)`,
      [target.id, target.email, { from: target.role, to: "ADMIN", bootstrap: true }],
    );
    return presentUser(result.rows[0]);
  }));
}
