import { hash } from "bcryptjs";
import { z } from "zod";
import { hashToken, randomToken } from "@/lib/crypto";
import { query, transaction } from "@/lib/db";
import { deliverEmail } from "@/lib/email-delivery";
import { env } from "@/lib/env";
import { emailSchema, passwordSchema } from "@/lib/validation";

export const passwordResetTtlMs = 30 * 60 * 1000;
export const passwordResetTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const passwordResetRequestSchema = z.object({ email: emailSchema }).strict();
export const passwordResetSchema = z.object({
  token: passwordResetTokenSchema,
  newPassword: passwordSchema,
}).strict();
export const passwordResetRequestMessage = "If a password account exists for that email, reset instructions have been sent.";

type PasswordResetChallenge = {
  token: string;
  email: string;
  expiresAt: Date;
};

export async function issuePasswordResetChallenge(email: string): Promise<PasswordResetChallenge | null> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + passwordResetTtlMs);

  return transaction(async (client) => {
    const result = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users
        WHERE lower(btrim(email)) = $1 AND password_hash IS NOT NULL
          AND disabled_at IS NULL AND deletion_requested_at IS NULL AND anonymized_at IS NULL
        FOR UPDATE`,
      [email],
    );
    const user = result.rows[0];
    if (!user) return null;

    await client.query(
      `UPDATE password_reset_tokens SET invalidated_at = now()
        WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [user.id],
    );
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(token), expiresAt],
    );
    return { token, email: user.email, expiresAt };
  });
}

async function deliverPasswordResetChallenge(challenge: PasswordResetChallenge): Promise<void> {
  const webUrl = new URL("/reset-password", env().APP_URL);
  webUrl.searchParams.set("token", challenge.token);
  const mobileUrl = new URL("streamtumi://reset-password");
  mobileUrl.searchParams.set("token", challenge.token);

  await deliverEmail({
    to: challenge.email,
    subject: "Reset your StreamTumi password",
    text: [
      "A password reset was requested for your StreamTumi account.",
      "",
      `Open in StreamTumi: ${mobileUrl.href}`,
      `Reset on the web: ${webUrl.href}`,
      "",
      `This single-use link expires at ${challenge.expiresAt.toISOString()} (30 minutes after it was requested).`,
      "If you did not request this, you can ignore this email. Your password has not changed.",
    ].join("\n"),
    html: `<p>A password reset was requested for your StreamTumi account.</p><p><a href="${webUrl.href}">Reset password</a></p><p><a href="${mobileUrl.href}">Open in the StreamTumi app</a></p><p>This single-use link expires in 30 minutes.</p><p>If you did not request this, you can ignore this email. Your password has not changed.</p>`,
  });
}

export async function requestPasswordResetByEmail(email: string): Promise<void> {
  const challenge = await issuePasswordResetChallenge(email);
  if (!challenge) return;
  try {
    await deliverPasswordResetChallenge(challenge);
  } catch {
    // Requests always receive the same response, including delivery failures and unknown accounts.
  }
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const parsedToken = passwordResetTokenSchema.safeParse(token);
  if (!parsedToken.success) return false;
  const tokenHash = hashToken(parsedToken.data);
  const passwordHash = await hash(newPassword, 12);

  return transaction(async (client) => {
    const tokenResult = await client.query<{ user_id: string }>(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1",
      [tokenHash],
    );
    const resetToken = tokenResult.rows[0];
    if (!resetToken) return false;

    const user = await client.query(
      `SELECT id FROM users
        WHERE id = $1 AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL
        FOR UPDATE`,
      [resetToken.user_id],
    );
    if (!user.rowCount) return false;

    const claimed = await client.query<{ user_id: string }>(
      `UPDATE password_reset_tokens
          SET consumed_at = now()
        WHERE token_hash = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
          AND expires_at > now()
        RETURNING user_id`,
      [tokenHash],
    );
    if (!claimed.rowCount) return false;

    await client.query(
      `UPDATE users
          SET password_hash = $2, must_change_password = false,
              version = version + 1, updated_at = now()
        WHERE id = $1`,
      [resetToken.user_id, passwordHash],
    );
    await client.query("DELETE FROM sessions WHERE user_id = $1", [resetToken.user_id]);
    await client.query(
      "UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND authentication_method = 'PASSWORD' AND revoked_at IS NULL",
      [resetToken.user_id],
    );
    await client.query(
      "UPDATE mobile_refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1",
      [resetToken.user_id],
    );
    await client.query(
      "UPDATE moderation_service_tokens SET active = false WHERE created_by_user_id = $1 AND active = true",
      [resetToken.user_id],
    );
    await client.query(
      `UPDATE password_reset_tokens SET invalidated_at = now()
        WHERE user_id = $1 AND token_hash <> $2
          AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [resetToken.user_id, tokenHash],
    );
    return true;
  });
}

export async function removeExpiredPasswordResetTokens(): Promise<number> {
  const result = await query(
    `DELETE FROM password_reset_tokens
      WHERE expires_at < now() - interval '1 day'
         OR consumed_at < now() - interval '1 day'
         OR invalidated_at < now() - interval '1 day'`,
  );
  return result.rowCount ?? 0;
}
