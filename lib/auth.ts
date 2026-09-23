import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { hashToken, randomToken } from "@/lib/crypto";
import { canManageResource } from "@/lib/authorization";
import type { StationKind } from "@/lib/station-kind";

export const sessionCookieName = "cl_session";
export type SessionAudience = "MAIN" | "RADIO" | "MOBILE";
export const MOBILE_ACCESS_TTL_MS = 15 * 60 * 1000;

export type UserRole = "USER" | "MODERATOR" | "ADMIN";
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
  emailVerified?: boolean;
  showExplicitContent?: boolean;
  explicitAgeAttestedAt?: string | null;
};

type SessionUserRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  must_change_password: boolean;
  email_verified_at: Date | null;
  show_explicit_content: boolean;
  explicit_age_attested_at: Date | null;
};

export async function requestSessionAudience(): Promise<SessionAudience> {
  return "MAIN";
}

export async function createSession(userId: string, audience: SessionAudience = "MAIN"): Promise<string> {
  if (audience === "RADIO") audience = "MAIN";
  const token = randomToken();
  const ttlMs = audience === "MOBILE" ? MOBILE_ACCESS_TTL_MS : env().SESSION_TTL_DAYS * 86_400_000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await transaction(async (client) => {
    const active = await client.query<{ must_change_password: boolean }>(
      `SELECT must_change_password FROM users
        WHERE id = $1 AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL
        FOR UPDATE`,
      [userId],
    );
    if (!active.rowCount) throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    if (audience === "MOBILE" && active.rows[0]?.must_change_password) {
      throw new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
    }
    await client.query("INSERT INTO sessions (user_id, token_hash, expires_at, audience) VALUES ($1, $2, $3, $4)", [userId, hashToken(token), expiresAt, audience]);
  });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env().SESSION_TTL_DAYS * 86_400,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  jar.delete(sessionCookieName);
}

export async function resolveSessionUser(token: string, audience: SessionAudience): Promise<AuthUser | null> {
  const result = await query<SessionUserRow>(
    `SELECT u.id, u.email, u.display_name, u.role, u.must_change_password, u.email_verified_at,
            u.show_explicit_content, u.explicit_age_attested_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.audience = $2 AND s.expires_at > now()
        AND u.disabled_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL`,
    [hashToken(token), audience],
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: row.must_change_password,
    emailVerified: row.email_verified_at != null,
    showExplicitContent: row.show_explicit_content,
    explicitAgeAttestedAt: row.explicit_age_attested_at?.toISOString() ?? null,
  } : null;
}

export async function currentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;
  return resolveSessionUser(token, await requestSessionAudience());
}

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/change-password");
  return user;
}

export async function requireApiUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in is required.", "UNAUTHENTICATED");
  if (user.mustChangePassword) throw new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
  return user;
}

export async function requirePasswordChangeUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in is required.", "UNAUTHENTICATED");
  return user;
}

export async function requireModerator(): Promise<AuthUser> {
  const user = await requireApiUser();
  if (user.role !== "MODERATOR" && user.role !== "ADMIN") throw new HttpError(403, "Moderator access is required.", "FORBIDDEN");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireApiUser();
  if (user.role !== "ADMIN") throw new HttpError(403, "Administrator access is required.", "FORBIDDEN");
  return user;
}

export async function lockActiveUser(client: PoolClient, userId: string): Promise<void> {
  const active = await client.query(
    `SELECT 1 FROM users
      WHERE id = $1 AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL
      FOR UPDATE`,
    [userId],
  );
  if (!active.rowCount) {
    throw new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE");
  }
}

export async function assertStationOwner(stationId: string, userId: string): Promise<void> {
  const station = await query<{ owner_id: string }>("SELECT owner_id FROM stations WHERE id = $1 AND COALESCE(playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')", [stationId]);
  if (!station.rows[0] || !canManageResource(userId, station.rows[0].owner_id)) throw new HttpError(404, "Station not found.", "NOT_FOUND");
}

export async function assertStationOwnerKind(stationId: string, userId: string, kind: StationKind): Promise<void> {
  const station = await query<{ owner_id: string; station_kind: StationKind }>(
    "SELECT owner_id, station_kind FROM stations WHERE id = $1 AND deleted_at IS NULL AND COALESCE(playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')",
    [stationId],
  );
  if (!station.rows[0] || station.rows[0].station_kind !== kind || !canManageResource(userId, station.rows[0].owner_id)) {
    throw new HttpError(404, "Station not found.", "NOT_FOUND");
  }
}

export async function assertVideoOwner(videoId: string, userId: string): Promise<{ stationId: string }> {
  const result = await query<{ station_id: string; owner_id: string }>(
    "SELECT v.station_id, s.owner_id FROM videos v JOIN stations s ON s.id = v.station_id WHERE v.id = $1 AND COALESCE(s.playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')",
    [videoId],
  );
  if (!result.rows[0] || !canManageResource(userId, result.rows[0].owner_id)) throw new HttpError(404, "Video not found.", "NOT_FOUND");
  return { stationId: result.rows[0].station_id };
}

export async function assertRadioTrackOwner(trackId: string, userId: string): Promise<{ stationId: string }> {
  const result = await query<{ station_id: string; owner_id: string }>(
    "SELECT t.station_id, s.owner_id FROM radio_tracks t JOIN stations s ON s.id = t.station_id WHERE t.id = $1 AND s.station_kind = 'RADIO' AND s.deleted_at IS NULL AND COALESCE(s.playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')",
    [trackId],
  );
  if (!result.rows[0] || !canManageResource(userId, result.rows[0].owner_id)) throw new HttpError(404, "Track not found.", "NOT_FOUND");
  return { stationId: result.rows[0].station_id };
}

export async function makePasswordHash(password: string): Promise<string> {
  return hash(password, 12);
}
