import { compare, hash } from "bcryptjs";
import type { UserRole } from "@/lib/auth";
import {
  accountLifecycleLockId,
  assertNotLastEnabledAdmin,
  clearAccountRelationships,
  revokeAccountCredentials,
  scheduleOwnedStationsForDeletion,
} from "@/lib/account-deletion";
import { query, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { issueMobileCredentials, mobileUser, type MobileCredentials, type MobileUser } from "@/lib/mobile-auth";

export type MobileAccountSettings = {
  email: string;
  showExplicitContent: boolean;
  explicitAgeAttestedAt: string | null;
  weatherZipCode: string | null;
};

type AccountRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  must_change_password: boolean;
  email_verified_at: Date | null;
  show_explicit_content: boolean;
  explicit_age_attested_at: Date | null;
  disabled_at: Date | null;
  deletion_requested_at: Date | null;
  anonymized_at: Date | null;
};

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function activeAccount(row: AccountRow | undefined): AccountRow {
  if (!row || row.disabled_at || row.deletion_requested_at || row.anonymized_at) {
    throw new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE");
  }
  return row;
}

function accountUser(row: AccountRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: row.must_change_password,
    emailVerified: row.email_verified_at != null,
  };
}

export async function mobileAccountSettings(userId: string): Promise<MobileAccountSettings> {
  const result = await query<Pick<AccountRow, "email" | "show_explicit_content" | "explicit_age_attested_at"> & { weather_zip_code: string | null }>(
    `SELECT email, show_explicit_content, explicit_age_attested_at, weather_zip_code
       FROM users WHERE id = $1 AND disabled_at IS NULL
         AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE");
  return {
    email: row.email,
    showExplicitContent: row.show_explicit_content,
    explicitAgeAttestedAt: row.explicit_age_attested_at?.toISOString() ?? null,
    weatherZipCode: row.weather_zip_code,
  };
}

export async function updateMobileAdultPreference(
  userId: string,
  showExplicitContent: boolean,
): Promise<{ showExplicitContent: boolean; explicitAgeAttestedAt: string | null }> {
  const result = await query<{ show_explicit_content: boolean; explicit_age_attested_at: Date | null }>(
    `UPDATE users
        SET show_explicit_content = $2,
            explicit_age_attested_at = CASE
              WHEN $2 = true THEN COALESCE(explicit_age_attested_at, now())
              ELSE explicit_age_attested_at
            END,
            version = version + 1, updated_at = now()
      WHERE id = $1 AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL
      RETURNING show_explicit_content, explicit_age_attested_at`,
    [userId, showExplicitContent],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE");
  return {
    showExplicitContent: row.show_explicit_content,
    explicitAgeAttestedAt: row.explicit_age_attested_at?.toISOString() ?? null,
  };
}

export async function changeMobilePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<MobileCredentials & { user: MobileUser }> {
  const passwordHash = await hash(newPassword, 12);
  return transaction(async (client) => {
    const result = await client.query<AccountRow>(
      `SELECT id, email, display_name, role, password_hash, must_change_password, email_verified_at,
              show_explicit_content, explicit_age_attested_at, disabled_at, deletion_requested_at, anonymized_at
         FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const user = activeAccount(result.rows[0]);
    if (!(await compare(currentPassword, user.password_hash))) {
      throw new HttpError(401, "The current password is incorrect.", "INVALID_CREDENTIALS");
    }

    await client.query(
      `UPDATE users
          SET password_hash = $2, must_change_password = false,
              version = version + 1, updated_at = now()
        WHERE id = $1`,
      [user.id, passwordHash],
    );
    await revokeAccountCredentials(client, user.id);
    await client.query(
      "UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND authentication_method = 'PASSWORD' AND revoked_at IS NULL",
      [user.id],
    );
    const credentials = await issueMobileCredentials(client, user.id);
    return { ...credentials, user: mobileUser(accountUser({ ...user, must_change_password: false })) };
  });
}

export async function requestMobileAccountDeletion(
  userId: string,
  confirmationEmail: string,
  currentPassword: string,
): Promise<void> {
  return transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock($1)", [accountLifecycleLockId]);
    const result = await client.query<AccountRow>(
      `SELECT id, email, display_name, role, password_hash, must_change_password, email_verified_at,
              show_explicit_content, explicit_age_attested_at, disabled_at, deletion_requested_at, anonymized_at
         FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const user = activeAccount(result.rows[0]);
    if (normalizedEmail(confirmationEmail) !== normalizedEmail(user.email)) {
      throw new HttpError(400, "Type your normalized account email exactly to confirm deletion.", "DELETE_CONFIRMATION_MISMATCH");
    }

    if (!(await compare(currentPassword, user.password_hash))) {
      throw new HttpError(401, "The current password is incorrect.", "INVALID_CREDENTIALS");
    }

    await assertNotLastEnabledAdmin(client, user);
    const graceDays = env().STATION_DELETE_GRACE_DAYS;
    const stations = await scheduleOwnedStationsForDeletion(client, user.id, graceDays, true);
    const updated = await client.query<{ anonymize_after: Date }>(
      `UPDATE users
          SET disabled_at = COALESCE(disabled_at, now()),
              disabled_reason = 'Account deletion requested by the account owner',
              disabled_by_user_id = $1,
              deletion_requested_at = now(), anonymize_after = now() + ($2 * interval '1 day'),
              deletion_requested_by_user_id = $1, avatar_revision = NULL,
              version = version + 1, updated_at = now()
        WHERE id = $1
        RETURNING anonymize_after`,
      [user.id, graceDays],
    );
    const revoked = await revokeAccountCredentials(client, user.id);
    await clearAccountRelationships(client, user.id);
    await client.query(
      `INSERT INTO admin_audit_log
         (actor_user_id, actor_name, target_user_id, target_label, action, metadata)
       VALUES ($1, $2, $1, $3, 'USER_SELF_DELETION_REQUESTED', $4)`,
      [user.id, user.display_name, user.email, {
        irreversible: true,
        ownedStations: stations.owned,
        stationsScheduled: stations.scheduled,
        heldStationsPreserved: stations.held,
        sessionsRevoked: revoked.sessions,
        mobileRefreshTokensRevoked: revoked.refreshTokens,
        moderationTokensRevoked: revoked.moderationTokens,
        anonymizeAfter: updated.rows[0]?.anonymize_after.toISOString(),
      }],
    );
  });
}
