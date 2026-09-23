import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { MOBILE_ACCESS_TTL_MS, resolveSessionUser, type AuthUser } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";

const mobileBearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/i;
const mobileRefreshRequestSchema = z.object({
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
const MOBILE_REFRESH_TTL_MS = 30 * 86_400_000;

export type MobileUser = {
  id: string;
  email: string;
  displayName: string;
  role: AuthUser["role"];
  emailVerified: boolean;
};

export type MobileCredentials = {
  token: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

type RefreshRow = {
  id: string;
  family_id: string;
  user_id: string;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
  authenticated_at: Date;
  email: string;
  display_name: string;
  role: AuthUser["role"];
  must_change_password: boolean;
  email_verified_at: Date | null;
  disabled_at: Date | null;
  deletion_requested_at: Date | null;
  anonymized_at: Date | null;
};

export function parseMobileBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  return mobileBearerPattern.exec(authorization)?.[1] ?? null;
}

export function parseMobileRefreshToken(input: unknown): string {
  return mobileRefreshRequestSchema.parse(input).refreshToken;
}

export async function requireMobileAuth(request: Request): Promise<{ token: string; user: AuthUser }> {
  const token = parseMobileBearerToken(request.headers.get("authorization"));
  if (!token) throw new HttpError(401, "A valid bearer token is required.", "UNAUTHENTICATED");

  const user = await resolveSessionUser(token, "MOBILE");
  if (!user) throw new HttpError(401, "A valid bearer token is required.", "UNAUTHENTICATED");
  if (user.mustChangePassword) {
    throw new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
  }
  return { token, user };
}

export async function optionalMobileAuth(request: Request): Promise<{ token: string; user: AuthUser } | null> {
  if (request.headers.get("authorization") === null) return null;
  return requireMobileAuth(request);
}

export function mobileUser(user: AuthUser): MobileUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified === true,
  };
}

function credentialTimes() {
  const now = Date.now();
  return {
    accessExpiresAt: new Date(now + MOBILE_ACCESS_TTL_MS),
    refreshExpiresAt: new Date(now + MOBILE_REFRESH_TTL_MS),
  };
}

export async function issueMobileCredentials(
  client: PoolClient,
  userId: string,
  authenticatedAt = new Date(),
): Promise<MobileCredentials> {
  const token = randomToken();
  const refreshToken = randomToken();
  const familyId = randomUUID();
  const { accessExpiresAt, refreshExpiresAt } = credentialTimes();
  await client.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, audience, mobile_refresh_family_id, authenticated_at)
     VALUES ($1, $2, $3, 'MOBILE', $4, $5)`,
    [userId, hashToken(token), accessExpiresAt, familyId, authenticatedAt],
  );
  await client.query(
    `INSERT INTO mobile_refresh_tokens (family_id, user_id, token_hash, expires_at, authenticated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [familyId, userId, hashToken(refreshToken), refreshExpiresAt, authenticatedAt],
  );
  return {
    token,
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshToken,
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export async function createMobileCredentials(userId: string): Promise<MobileCredentials> {
  return transaction(async (client) => {
    const active = await client.query<{ must_change_password: boolean }>(
      `SELECT must_change_password FROM users
        WHERE id = $1 AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL
        FOR UPDATE`,
      [userId],
    );
    if (!active.rowCount) throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    if (active.rows[0]?.must_change_password) {
      throw new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
    }
    return issueMobileCredentials(client, userId);
  });
}

async function revokeMobileFamily(client: PoolClient, userId: string, familyId: string): Promise<void> {
  await client.query(
    `UPDATE mobile_refresh_tokens SET revoked_at = COALESCE(revoked_at, now())
      WHERE user_id = $1 AND family_id = $2`,
    [userId, familyId],
  );
  await client.query(
    `DELETE FROM sessions
      WHERE user_id = $1 AND mobile_refresh_family_id = $2 AND audience = 'MOBILE'`,
    [userId, familyId],
  );
}

export async function rotateMobileRefreshToken(refreshToken: string): Promise<MobileCredentials & { user: MobileUser }> {
  const token = randomToken();
  const replacementRefreshToken = randomToken();
  const { accessExpiresAt, refreshExpiresAt } = credentialTimes();
  const outcome = await transaction(async (client): Promise<
    | { credentials: MobileCredentials; user: MobileUser }
    | { error: HttpError }
  > => {
    const result = await client.query<RefreshRow>(
      `SELECT r.id, r.family_id, r.user_id, r.expires_at, r.consumed_at, r.revoked_at, r.authenticated_at,
              u.email, u.display_name, u.role, u.must_change_password, u.email_verified_at,
              u.disabled_at, u.deletion_requested_at, u.anonymized_at
         FROM mobile_refresh_tokens r
         JOIN users u ON u.id = r.user_id
        WHERE r.token_hash = $1
        FOR UPDATE OF r, u`,
      [hashToken(refreshToken)],
    );
    const row = result.rows[0];
    if (!row) {
      return { error: new HttpError(401, "The refresh token is invalid or expired.", "REFRESH_TOKEN_INVALID") };
    }
    if (row.consumed_at || row.revoked_at) {
      await revokeMobileFamily(client, row.user_id, row.family_id);
      return { error: new HttpError(401, "Refresh token reuse was detected.", "REFRESH_TOKEN_REUSED") };
    }
    if (row.disabled_at || row.deletion_requested_at || row.anonymized_at) {
      await revokeMobileFamily(client, row.user_id, row.family_id);
      return { error: new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE") };
    }
    if (row.must_change_password) {
      await revokeMobileFamily(client, row.user_id, row.family_id);
      return { error: new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED") };
    }
    if (row.expires_at.getTime() <= Date.now()) {
      await revokeMobileFamily(client, row.user_id, row.family_id);
      return { error: new HttpError(401, "The refresh token is invalid or expired.", "REFRESH_TOKEN_INVALID") };
    }

    const replacement = await client.query<{ id: string }>(
      `INSERT INTO mobile_refresh_tokens (family_id, user_id, token_hash, expires_at, authenticated_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [row.family_id, row.user_id, hashToken(replacementRefreshToken), refreshExpiresAt, row.authenticated_at],
    );
    await client.query(
      `UPDATE mobile_refresh_tokens
          SET consumed_at = now(), replacement_id = $2
        WHERE id = $1`,
      [row.id, replacement.rows[0].id],
    );
    await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, audience, mobile_refresh_family_id, authenticated_at)
       VALUES ($1, $2, $3, 'MOBILE', $4, $5)`,
      [row.user_id, hashToken(token), accessExpiresAt, row.family_id, row.authenticated_at],
    );

    return {
      credentials: {
        token,
        accessExpiresAt: accessExpiresAt.toISOString(),
        refreshToken: replacementRefreshToken,
        refreshExpiresAt: refreshExpiresAt.toISOString(),
      },
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        emailVerified: row.email_verified_at != null,
      },
    };
  });

  if ("error" in outcome) throw outcome.error;
  return { ...outcome.credentials, user: outcome.user };
}

export async function revokeMobileCredentials(token: string, refreshToken: string): Promise<void> {
  await transaction(async (client) => {
    const refresh = await client.query<{ user_id: string; family_id: string }>(
      `SELECT user_id, family_id FROM mobile_refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE`,
      [hashToken(refreshToken)],
    );
    const row = refresh.rows[0];
    if (row) await revokeMobileFamily(client, row.user_id, row.family_id);
    await client.query(
      "DELETE FROM sessions WHERE token_hash = $1 AND audience = 'MOBILE'",
      [hashToken(token)],
    );
  });
}
