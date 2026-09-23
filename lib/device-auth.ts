import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import {
  deviceAuthorizationStartRequestSchema,
  deviceLoginRequestSchema,
  deviceTokenRequestSchema,
  deviceUserCodeSchema,
  type DeviceAuthorizationStartRequest,
  type DeviceScope,
  type DeviceType,
  type LinkedDevice,
} from "@/packages/contracts/src/device";
import type { AuthUser } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { query, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { passwordMatches } from "@/lib/password-auth";

export const DEVICE_AUTHORIZATION_TTL_SECONDS = 600;
export const DEVICE_POLL_INTERVAL_SECONDS = 5;
export const DEVICE_SESSION_TTL_DAYS = 180;
export const DEVICE_SCOPES = ["catalog:read", "tunes:write", "rooms:join"] as const satisfies readonly DeviceScope[];

const userCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const strictDeviceBearerPattern = /^Device ([A-Za-z0-9_-]{43})$/;

type AuthorizationRow = {
  id: string;
  device_type: DeviceType;
  display_name: string;
  scopes: DeviceScope[];
  expires_at: Date;
  poll_interval_seconds: number;
  next_poll_at: Date;
  approved_user_id: string | null;
  consumed_at: Date | null;
};

type DeviceSessionRow = {
  id: string;
  device_type: DeviceType;
  display_name: string;
  scopes: DeviceScope[];
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
};

type DeviceIdentityRow = DeviceSessionRow & {
  user_id: string;
  email: string;
  user_display_name: string;
  role: AuthUser["role"];
  must_change_password: boolean;
  email_verified_at: Date | null;
  show_explicit_content: boolean;
  explicit_age_attested_at: Date | null;
};

export type DeviceAuthorizationPollResult =
  | { status: "authorization_pending"; interval: number }
  | { status: "slow_down"; interval: number }
  | { status: "expired_token" }
  | { status: "authorized"; deviceToken: string; expiresAt: string; scopes: DeviceScope[] };

export type DeviceIdentity = {
  sessionId: string;
  deviceType: DeviceType;
  scopes: DeviceScope[];
  user: AuthUser;
};

function generateUserCode(): string {
  const bytes = randomBytes(8);
  let value = "";
  for (const byte of bytes) value += userCodeAlphabet[byte % userCodeAlphabet.length];
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export function normalizeDeviceUserCode(value: string): string {
  const compact = value.trim().toUpperCase().replaceAll("-", "");
  return deviceUserCodeSchema.parse(compact).replaceAll("-", "");
}

export function parseDeviceBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  return strictDeviceBearerPattern.exec(authorization)?.[1] ?? null;
}

async function insertDeviceSession(
  client: PoolClient,
  input: {
    authorizationId: string | null;
    userId: string;
    deviceType: DeviceType;
    displayName: string;
    scopes: readonly DeviceScope[];
    authenticationMethod: "PAIRING" | "PASSWORD";
  },
  now: Date,
): Promise<{ deviceToken: string; expiresAt: string; scopes: DeviceScope[] }> {
  const deviceToken = randomToken();
  const expiresAt = new Date(now.getTime() + DEVICE_SESSION_TTL_DAYS * 86_400_000);
  await client.query(
    `INSERT INTO device_sessions
       (authorization_id, user_id, device_type, display_name, token_hash, scopes,
        authentication_method, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [input.authorizationId, input.userId, input.deviceType, input.displayName,
      hashToken(deviceToken), [...input.scopes], input.authenticationMethod, now, expiresAt],
  );
  return { deviceToken, expiresAt: expiresAt.toISOString(), scopes: [...input.scopes] };
}

export async function loginDeviceWithPassword(
  input: unknown,
  now = new Date(),
): Promise<{ deviceToken: string; expiresAt: string; scopes: DeviceScope[]; account: { displayName: string; email: string } }> {
  const data = deviceLoginRequestSchema.parse(input);
  return transaction(async (client) => {
    const result = await client.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string | null;
      disabled_at: Date | null;
      deletion_requested_at: Date | null;
      anonymized_at: Date | null;
      must_change_password: boolean;
    }>(
      `SELECT id, email, display_name, password_hash, disabled_at, deletion_requested_at,
              anonymized_at, must_change_password
         FROM users WHERE lower(btrim(email)) = $1 FOR UPDATE`,
      [data.email],
    );
    const user = result.rows[0];
    if (!(await passwordMatches(data.password, user?.password_hash))
      || user?.disabled_at || user?.deletion_requested_at || user?.anonymized_at) {
      throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    if (user.must_change_password) {
      throw new HttpError(403, "Change your temporary password on the website before signing in on Roku.", "PASSWORD_CHANGE_REQUIRED");
    }
    const session = await insertDeviceSession(client, {
      authorizationId: null,
      userId: user.id,
      deviceType: data.deviceType,
      displayName: data.displayName,
      scopes: DEVICE_SCOPES,
      authenticationMethod: "PASSWORD",
    }, now);
    return { ...session, account: { displayName: user.display_name, email: user.email } };
  });
}

export async function startDeviceAuthorization(
  input: DeviceAuthorizationStartRequest,
  now = new Date(),
): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: 600;
  interval: 5;
}> {
  const data = deviceAuthorizationStartRequestSchema.parse(input);
  const expiresAt = new Date(now.getTime() + DEVICE_AUTHORIZATION_TTL_SECONDS * 1000);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const deviceCode = randomToken();
    const userCode = generateUserCode();
    const inserted = await query(
      `INSERT INTO device_authorizations
         (device_code_hash, user_code_hash, device_type, display_name, scopes, created_at, expires_at, next_poll_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        hashToken(deviceCode),
        hashToken(normalizeDeviceUserCode(userCode)),
        data.deviceType,
        data.displayName,
        [...DEVICE_SCOPES],
        now,
        expiresAt,
      ],
    );
    if (!inserted.rowCount) continue;

    const verificationUri = new URL("/activate", env().APP_URL).toString();
    const complete = new URL(verificationUri);
    complete.searchParams.set("user_code", userCode);
    return {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete: complete.toString(),
      expiresIn: DEVICE_AUTHORIZATION_TTL_SECONDS,
      interval: DEVICE_POLL_INTERVAL_SECONDS,
    };
  }
  throw new HttpError(503, "A device code could not be created. Try again.", "DEVICE_CODE_UNAVAILABLE");
}

export async function approveDeviceAuthorization(
  userId: string,
  rawUserCode: string,
  now = new Date(),
): Promise<{ deviceType: DeviceType; displayName: string }> {
  const userCode = normalizeDeviceUserCode(rawUserCode);
  return transaction(async (client) => {
    const result = await client.query<AuthorizationRow>(
      `SELECT id, device_type, display_name, scopes, expires_at, poll_interval_seconds,
              next_poll_at, approved_user_id, consumed_at
         FROM device_authorizations
        WHERE user_code_hash = $1
        FOR UPDATE`,
      [hashToken(userCode)],
    );
    const authorization = result.rows[0];
    if (!authorization || authorization.expires_at.getTime() <= now.getTime() || authorization.consumed_at) {
      throw new HttpError(404, "That activation code is invalid or expired.", "DEVICE_CODE_INVALID");
    }
    if (authorization.approved_user_id && authorization.approved_user_id !== userId) {
      throw new HttpError(404, "That activation code is invalid or expired.", "DEVICE_CODE_INVALID");
    }
    if (!authorization.approved_user_id) {
      await client.query(
        `UPDATE device_authorizations
            SET approved_user_id = $2, approved_at = $3
          WHERE id = $1`,
        [authorization.id, userId, now],
      );
    }
    return { deviceType: authorization.device_type, displayName: authorization.display_name };
  });
}

export async function pollDeviceAuthorization(
  rawDeviceCode: string,
  now = new Date(),
): Promise<DeviceAuthorizationPollResult> {
  const parsed = deviceTokenRequestSchema.safeParse({ deviceCode: rawDeviceCode });
  if (!parsed.success) return { status: "expired_token" };
  const deviceCodeHash = hashToken(parsed.data.deviceCode);

  return transaction(async (client) => {
    const result = await client.query<AuthorizationRow>(
      `SELECT id, device_type, display_name, scopes, expires_at, poll_interval_seconds,
              next_poll_at, approved_user_id, consumed_at
         FROM device_authorizations
        WHERE device_code_hash = $1
        FOR UPDATE`,
      [deviceCodeHash],
    );
    const authorization = result.rows[0];
    if (!authorization || authorization.expires_at.getTime() <= now.getTime() || authorization.consumed_at) {
      return { status: "expired_token" };
    }

    if (authorization.next_poll_at.getTime() > now.getTime()) {
      const interval = authorization.poll_interval_seconds + 5;
      await client.query(
        `UPDATE device_authorizations
            SET poll_interval_seconds = $2, next_poll_at = $3
          WHERE id = $1`,
        [authorization.id, interval, new Date(now.getTime() + interval * 1000)],
      );
      return { status: "slow_down", interval };
    }

    await client.query(
      "UPDATE device_authorizations SET next_poll_at = $2 WHERE id = $1",
      [authorization.id, new Date(now.getTime() + authorization.poll_interval_seconds * 1000)],
    );
    if (!authorization.approved_user_id) {
      return { status: "authorization_pending", interval: authorization.poll_interval_seconds };
    }

    const active = await client.query(
      `SELECT 1 FROM users
        WHERE id = $1 AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL
        FOR UPDATE`,
      [authorization.approved_user_id],
    );
    if (!active.rowCount) {
      await client.query("UPDATE device_authorizations SET consumed_at = $2 WHERE id = $1", [authorization.id, now]);
      return { status: "expired_token" };
    }

    const session = await insertDeviceSession(client, {
      authorizationId: authorization.id,
      userId: authorization.approved_user_id,
      deviceType: authorization.device_type,
      displayName: authorization.display_name,
      scopes: authorization.scopes,
      authenticationMethod: "PAIRING",
    }, now);
    await client.query("UPDATE device_authorizations SET consumed_at = $2 WHERE id = $1", [authorization.id, now]);
    return {
      status: "authorized",
      deviceToken: session.deviceToken,
      expiresAt: session.expiresAt,
      scopes: session.scopes,
    };
  });
}

export async function requireDeviceAuth(
  request: Request,
  requiredScope?: DeviceScope,
): Promise<DeviceIdentity> {
  const token = parseDeviceBearerToken(request.headers.get("authorization"));
  if (!token) throw new HttpError(401, "A valid device token is required.", "DEVICE_UNAUTHENTICATED");

  const result = await query<DeviceIdentityRow>(
    `UPDATE device_sessions d
        SET last_used_at = now()
       FROM users u
      WHERE d.token_hash = $1 AND d.user_id = u.id
        AND d.expires_at > now() AND d.revoked_at IS NULL
        AND u.disabled_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL
        AND u.must_change_password = false
      RETURNING d.id, d.user_id, d.device_type, d.display_name, d.scopes, d.created_at,
                d.last_used_at, d.expires_at, d.revoked_at, u.email,
                u.display_name AS user_display_name, u.role, u.must_change_password,
                u.email_verified_at, u.show_explicit_content, u.explicit_age_attested_at`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(401, "A valid device token is required.", "DEVICE_UNAUTHENTICATED");
  if (requiredScope && !row.scopes.includes(requiredScope)) {
    throw new HttpError(403, "The device token does not grant this scope.", "DEVICE_SCOPE_REQUIRED");
  }
  return {
    sessionId: row.id,
    deviceType: row.device_type,
    scopes: row.scopes,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.user_display_name,
      role: row.role,
      mustChangePassword: row.must_change_password,
      emailVerified: row.email_verified_at != null,
      showExplicitContent: row.show_explicit_content,
      explicitAgeAttestedAt: row.explicit_age_attested_at?.toISOString() ?? null,
    },
  };
}

export async function optionalDeviceAuth(request: Request, requiredScope?: DeviceScope): Promise<DeviceIdentity | null> {
  if (!request.headers.get("authorization")) return null;
  return requireDeviceAuth(request, requiredScope);
}

function presentLinkedDevice(row: DeviceSessionRow): LinkedDevice {
  return {
    id: row.id,
    deviceType: row.device_type,
    displayName: row.display_name,
    scopes: row.scopes,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

export async function listLinkedDevices(userId: string): Promise<LinkedDevice[]> {
  const result = await query<DeviceSessionRow>(
    `SELECT id, device_type, display_name, scopes, created_at, last_used_at, expires_at, revoked_at
       FROM device_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
    [userId],
  );
  return result.rows.map(presentLinkedDevice);
}

export async function revokeLinkedDevice(userId: string, deviceId: string): Promise<boolean> {
  const result = await query(
    `UPDATE device_sessions
        SET revoked_at = COALESCE(revoked_at, now())
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [deviceId, userId],
  );
  return Boolean(result.rowCount);
}

export async function revokeCurrentDevice(sessionId: string): Promise<void> {
  await query(
    "UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1",
    [sessionId],
  );
}

export async function approveDeviceUser(
  user: AuthUser,
  rawUserCode: string,
): Promise<{ deviceType: DeviceType; displayName: string }> {
  return approveDeviceAuthorization(user.id, rawUserCode);
}
