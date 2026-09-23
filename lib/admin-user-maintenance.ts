import type { PoolClient } from "pg";

type AvatarCleanup = (revision: string) => Promise<unknown>;

async function cleanupAvatar(revision: string): Promise<unknown> {
  const { removeAvatarRevision } = await import("@/lib/avatar-image");
  return removeAvatarRevision(revision);
}

export async function anonymizeUserIfEligible(client: PoolClient, userId: string, removeAvatar: AvatarCleanup = cleanupAvatar): Promise<boolean> {
  let avatarRevision: string | null = null;
  await client.query("BEGIN");
  try {
    const result = await client.query<{
      id: string;
      email: string;
      avatar_revision: string | null;
      deletion_requested_at: Date;
      anonymize_after: Date;
    }>(
      `SELECT id, email, avatar_revision, deletion_requested_at, anonymize_after
         FROM users u
        WHERE id = $1
          AND deletion_requested_at IS NOT NULL
          AND anonymize_after <= now()
          AND anonymized_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM stations s WHERE s.owner_id = u.id)
        FOR UPDATE`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return false;
    }
    avatarRevision = user.avatar_revision;

    await client.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM mobile_refresh_tokens WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [user.id]);
    await client.query("UPDATE moderation_service_tokens SET active = false WHERE created_by_user_id = $1 AND active = true", [user.id]);
    await client.query("DELETE FROM station_fans WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM station_ratings WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM station_tunes WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM user_blocks WHERE blocker_user_id = $1 OR blocked_user_id = $1", [user.id]);
    await client.query(
      `UPDATE users
          SET email = 'deleted-' || id::text || '@anonymized.invalid',
              display_name = 'Deleted user',
              password_hash = crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 12)),
               role = 'USER', must_change_password = false,
               avatar_revision = NULL, weather_zip_code = NULL,
               show_explicit_content = false, explicit_age_attested_at = NULL,
              disabled_reason = NULL, disabled_by_user_id = NULL,
              anonymized_at = now(), version = version + 1, updated_at = now()
        WHERE id = $1`,
      [user.id],
    );
    await client.query(
      `INSERT INTO admin_audit_log
         (actor_user_id, actor_name, target_user_id, target_label, action, metadata)
       VALUES (NULL, 'System maintenance', $1, $2, 'USER_ANONYMIZED', $3)`,
      [user.id, user.email, {
        deletionRequestedAt: user.deletion_requested_at.toISOString(),
        anonymizeAfter: user.anonymize_after.toISOString(),
      }],
    );
    await client.query("COMMIT");
    if (avatarRevision) {
      await removeAvatar(avatarRevision).catch((error) => {
        console.error(`Could not remove anonymized avatar ${avatarRevision}:`, error instanceof Error ? error.message : "Avatar cleanup failed");
      });
    }
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
