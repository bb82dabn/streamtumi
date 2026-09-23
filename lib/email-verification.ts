import { z } from "zod";
import { hashToken, randomToken } from "@/lib/crypto";
import { query, transaction } from "@/lib/db";
import { deliverEmail } from "@/lib/email-delivery";
import { env } from "@/lib/env";

export const emailVerificationTtlMs = 30 * 60 * 1000;
export const emailVerificationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const emailVerificationRequestSchema = z.object({ token: emailVerificationTokenSchema });
export const emailVerificationResendRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export const emailVerificationResendMessage = "If an unverified account exists, a new verification email has been requested.";

export type EmailVerificationDelivery = "SENT" | "FAILED" | "NOT_REQUIRED";

export type EmailVerificationChallenge = {
  token: string;
  email: string;
  expiresAt: Date;
};

type ChallengeUserRow = {
  id: string;
  email: string;
  email_verified_at: Date | null;
};

export async function issueEmailVerificationChallenge(userId: string): Promise<EmailVerificationChallenge | null> {
  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + emailVerificationTtlMs);

  return transaction(async (client) => {
    const result = await client.query<ChallengeUserRow>(
      `SELECT id, email, email_verified_at FROM users
        WHERE id = $1 AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL
        FOR UPDATE`,
      [userId],
    );
    const user = result.rows[0];
    if (!user || user.email_verified_at) return null;

    await client.query(
      `UPDATE email_verification_tokens SET invalidated_at = now()
        WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [user.id],
    );
    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );
    return { token, email: user.email, expiresAt };
  });
}

async function deliverEmailVerificationChallenge(challenge: EmailVerificationChallenge): Promise<void> {
  const webUrl = new URL("/verify-email", env().APP_URL);
  webUrl.searchParams.set("token", challenge.token);
  const mobileUrl = new URL("streamtumi://verify-email");
  mobileUrl.searchParams.set("token", challenge.token);
  const expiresAt = challenge.expiresAt.toISOString();

  await deliverEmail({
    to: challenge.email,
    subject: "Verify your StreamTumi email",
    text: [
      "Verify your StreamTumi email to join communities and update your public profile.",
      "",
      `Open in StreamTumi: ${mobileUrl.href}`,
      `Verify on the web: ${webUrl.href}`,
      "",
      `This single-use link expires at ${expiresAt} (30 minutes after it was requested).`,
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `<p>Verify your StreamTumi email to join communities and update your public profile.</p><p><a href="${webUrl.href}">Verify email</a></p><p><a href="${mobileUrl.href}">Open in the StreamTumi app</a></p><p>This single-use link expires in 30 minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
  });
}

export async function issueAndSendEmailVerification(userId: string): Promise<EmailVerificationDelivery> {
  const challenge = await issueEmailVerificationChallenge(userId);
  if (!challenge) return "NOT_REQUIRED";
  try {
    await deliverEmailVerificationChallenge(challenge);
    return "SENT";
  } catch {
    return "FAILED";
  }
}

export async function requestEmailVerificationByEmail(email: string): Promise<void> {
  const result = await query<{ id: string }>(
    `SELECT id FROM users
      WHERE lower(btrim(email)) = $1 AND email_verified_at IS NULL
        AND disabled_at IS NULL AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
    [email],
  );
  const user = result.rows[0];
  if (user) await issueAndSendEmailVerification(user.id);
}

export async function consumeEmailVerificationToken(tokenValue: string, expectedUserId?: string): Promise<boolean> {
  const parsed = emailVerificationTokenSchema.safeParse(tokenValue);
  if (!parsed.success) return false;
  const tokenHash = hashToken(parsed.data);

  return transaction(async (client) => {
    const tokenResult = await client.query<{ user_id: string }>(
      "SELECT user_id FROM email_verification_tokens WHERE token_hash = $1",
      [tokenHash],
    );
    const token = tokenResult.rows[0];
    if (!token || (expectedUserId && token.user_id !== expectedUserId)) return false;

    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [token.user_id]);
    const claimed = await client.query<{ user_id: string }>(
      `UPDATE email_verification_tokens
          SET consumed_at = now()
        WHERE token_hash = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
          AND expires_at > now()
        RETURNING user_id`,
      [tokenHash],
    );
    if (!claimed.rowCount) return false;

    await client.query(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1",
      [token.user_id],
    );
    await client.query(
      `UPDATE email_verification_tokens SET invalidated_at = now()
        WHERE user_id = $1 AND token_hash <> $2
          AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [token.user_id, tokenHash],
    );
    return true;
  });
}
