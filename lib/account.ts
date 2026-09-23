import { compare, hash } from "bcryptjs";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";

export async function replaceTemporaryPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query<{
      password_hash: string | null;
      must_change_password: boolean;
      disabled_at: Date | null;
      deletion_requested_at: Date | null;
      anonymized_at: Date | null;
    }>(
      `SELECT password_hash, must_change_password, disabled_at, deletion_requested_at, anonymized_at
         FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const user = result.rows[0];
    if (!user || user.disabled_at || user.deletion_requested_at || user.anonymized_at) {
      throw new HttpError(401, "Sign in is required.", "UNAUTHENTICATED");
    }
    if (!user.must_change_password) {
      throw new HttpError(409, "A temporary password change is not required.", "PASSWORD_CHANGE_NOT_REQUIRED");
    }
    if (!user.password_hash || !(await compare(currentPassword, user.password_hash))) {
      throw new HttpError(401, "The current password is incorrect.", "INVALID_CREDENTIALS");
    }

    await client.query(
      `UPDATE users
          SET password_hash = $2, must_change_password = false,
              version = version + 1, updated_at = now()
        WHERE id = $1`,
      [userId, await hash(newPassword, 12)],
    );
    await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await client.query(
      "UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND authentication_method = 'PASSWORD' AND revoked_at IS NULL",
      [userId],
    );
  });
}
