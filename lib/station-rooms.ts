import { createHmac, randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import type { DeviceIdentity } from "@/lib/device-auth";
import { decryptSecret, hashToken, randomToken } from "@/lib/crypto";
import { query, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { issueMobilePlaybackGrant, withMobilePlaybackGrant } from "@/lib/mobile-playback-grant";
import type { DeviceRoomCatalogStation, RoomPlaybackResponse } from "@/packages/contracts/src/rooms";

type RoomStationRow = {
  id: string;
  owner_id: string;
  access_token_ciphertext: string;
  access_generation: string | null;
  station_kind: "TV" | "RADIO";
  name: string;
  description: string;
  broadcast_state: "RUNNING" | "STOPPED";
  logo_key: string | null;
  offline_slate_key: string | null;
  effective_explicit: boolean;
  owner_name: string;
  genre_name: string;
};

const stationSelection = `
  SELECT s.id, s.owner_id, s.access_token_ciphertext, room.generation AS access_generation,
         s.station_kind, s.name, s.description, s.broadcast_state, s.logo_key,
         s.offline_slate_key,
         (s.owner_declared_explicit OR s.explicit_enforced_at IS NOT NULL OR genre.is_explicit) AS effective_explicit,
         owner.display_name AS owner_name, genre.name AS genre_name
    FROM stations s
    JOIN users owner ON owner.id = s.owner_id
    JOIN station_genres genre ON genre.id = s.genre_id
    LEFT JOIN station_room_access room ON room.station_id = s.id`;
const protectedRoomStationSelection = stationSelection.replace(
  "LEFT JOIN station_room_access room",
  "JOIN station_room_access room",
);

const availableStation = `s.visibility = 'PRIVATE' AND s.access_enabled = true
  AND (s.access_expires_at IS NULL OR s.access_expires_at > now())
  AND s.deleted_at IS NULL AND s.moderation_status = 'ACTIVE'
  AND COALESCE(s.playback_type, 'conventional') = 'conventional'`;

export function roomKeyLookupHash(accessKey: string): string {
  return createHmac("sha256", env().APP_SECRET)
    .update(`station-room-access:v1:${accessKey}`)
    .digest("hex");
}

function newRoomKey(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function stationRoomAccessState(stationId: string, ownerId: string): Promise<{
  enabled: boolean;
  rotatedAt: string | null;
}> {
  const result = await query<{ generation: string | null; rotated_at: Date | null }>(
    `SELECT room.generation, room.rotated_at
       FROM stations s LEFT JOIN station_room_access room ON room.station_id = s.id
      WHERE s.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL`,
    [stationId, ownerId],
  );
  if (!result.rowCount) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  return { enabled: Boolean(result.rows[0].generation), rotatedAt: result.rows[0].rotated_at?.toISOString() ?? null };
}

export async function rotateStationRoomKey(stationId: string, ownerId: string): Promise<string> {
  return transaction(async (client) => {
    const station = await client.query<{ visibility: "PRIVATE" | "PUBLIC" }>(
      `SELECT visibility FROM stations
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [stationId, ownerId],
    );
    if (!station.rowCount) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    if (station.rows[0].visibility !== "PRIVATE") {
      throw new HttpError(409, "Make the station private before creating a room key.", "PUBLIC_ROOM_KEY_CONFLICT");
    }

    await client.query("DELETE FROM station_room_access WHERE station_id = $1", [stationId]);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const accessKey = newRoomKey();
      const inserted = await client.query(
        `INSERT INTO station_room_access (station_id, code_lookup_hash)
         VALUES ($1, $2) ON CONFLICT (code_lookup_hash) DO NOTHING RETURNING generation`,
        [stationId, roomKeyLookupHash(accessKey)],
      );
      if (!inserted.rowCount) continue;
      await client.query(
        "UPDATE stations SET access_password_hash = NULL, updated_at = now() WHERE id = $1",
        [stationId],
      );
      return accessKey;
    }
    throw new HttpError(503, "A room key could not be created. Try again.", "ROOM_KEY_UNAVAILABLE");
  });
}

export async function disableStationRoomKey(stationId: string, ownerId: string): Promise<boolean> {
  return transaction(async (client) => {
    const station = await client.query(
      "SELECT 1 FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE",
      [stationId, ownerId],
    );
    if (!station.rowCount) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    const removed = await client.query("DELETE FROM station_room_access WHERE station_id = $1 RETURNING station_id", [stationId]);
    return Boolean(removed.rowCount);
  });
}

async function createRoomSession(client: PoolClient, station: RoomStationRow): Promise<string> {
  if (!station.access_generation) throw new HttpError(404, "That room key is invalid or unavailable.", "ROOM_UNAVAILABLE");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = randomToken();
    const inserted = await client.query(
      `INSERT INTO station_room_sessions (station_id, access_generation, token_hash)
       VALUES ($1, $2, $3) ON CONFLICT (token_hash) DO NOTHING RETURNING id`,
      [station.id, station.access_generation, hashToken(token)],
    );
    if (inserted.rowCount) return token;
  }
  throw new HttpError(503, "Room access could not be created. Try again.", "ROOM_SESSION_UNAVAILABLE");
}

function presentPlayback(station: RoomStationRow, roomSessionToken: string | null, membershipSaved: boolean): RoomPlaybackResponse {
  const token = decryptSecret(station.access_token_ciphertext);
  const issued = issueMobilePlaybackGrant(token, station.id, Date.now(), undefined, station.access_generation ?? "legacy");
  const origin = new URL(env().APP_URL).origin;
  const root = `${origin}/api/public/stations/${encodeURIComponent(token)}`;
  const grantUrl = (url: string) => withMobilePlaybackGrant(url, issued.grant);
  return {
    station: {
      id: station.id,
      stationKind: station.station_kind,
      playbackKind: station.station_kind === "RADIO" ? "CONTINUOUS_RADIO" : "SCHEDULED_TV",
      name: station.name,
      description: station.description,
      ownerName: station.owner_name,
      genreName: station.genre_name,
      online: station.broadcast_state === "RUNNING",
      explicit: station.effective_explicit,
      artworkUrl: station.logo_key ? grantUrl(`${root}/assets/logo`) : station.offline_slate_key ? grantUrl(`${root}/assets/slate`) : null,
      slateUrl: station.offline_slate_key ? grantUrl(`${root}/assets/slate`) : null,
      stationUrl: grantUrl(root),
      chatUrl: grantUrl(`${root}/chat/messages`),
      grantExpiresAt: issued.expiresAt.toISOString(),
    },
    roomSessionToken,
    membershipSaved,
  };
}

async function exchangeStationRoomKeyForViewer(
  accessKey: string,
  userId: string | null,
  createMemberSession: boolean,
): Promise<RoomPlaybackResponse> {
  return transaction(async (client) => {
    const result = await client.query<RoomStationRow>(
      `${protectedRoomStationSelection}
        WHERE room.code_lookup_hash = $1 AND ${availableStation}
        FOR SHARE OF s, room`,
      [roomKeyLookupHash(accessKey)],
    );
    const station = result.rows[0];
    if (!station) throw new HttpError(404, "That room key is invalid or unavailable.", "ROOM_UNAVAILABLE");
    if (userId) {
      await client.query(
        `INSERT INTO station_room_memberships (station_id, user_id, access_generation)
         VALUES ($1, $2, $3)
         ON CONFLICT (station_id, user_id) DO UPDATE
           SET access_generation = EXCLUDED.access_generation, joined_at = now()`,
        [station.id, userId, station.access_generation],
      );
      return presentPlayback(station, createMemberSession ? await createRoomSession(client, station) : null, true);
    }
    return presentPlayback(station, await createRoomSession(client, station), false);
  });
}

export async function exchangeStationRoomKey(accessKey: string, device: DeviceIdentity | null): Promise<RoomPlaybackResponse> {
  const userId = device?.scopes.includes("rooms:join") ? device.user.id : null;
  return exchangeStationRoomKeyForViewer(accessKey, userId, false);
}

export async function exchangeMobileStationRoomKey(accessKey: string, userId: string | null): Promise<RoomPlaybackResponse> {
  return exchangeStationRoomKeyForViewer(accessKey, userId, true);
}

export async function playbackForRoomSession(roomSessionToken: string): Promise<RoomPlaybackResponse> {
  const tokenHash = hashToken(roomSessionToken);
  return transaction(async (client) => {
    const result = await client.query<RoomStationRow>(
      `${protectedRoomStationSelection}
        JOIN station_room_sessions session ON session.station_id = s.id
         AND session.access_generation = room.generation
       WHERE session.token_hash = $1 AND session.revoked_at IS NULL AND ${availableStation}
       FOR SHARE OF s, room`,
      [tokenHash],
    );
    const station = result.rows[0];
    if (!station) throw new HttpError(404, "This saved room is no longer available.", "ROOM_SESSION_INVALID");
    await client.query("UPDATE station_room_sessions SET last_used_at = now() WHERE token_hash = $1", [tokenHash]);
    return presentPlayback(station, roomSessionToken, false);
  });
}

export async function revokeRoomSession(roomSessionToken: string): Promise<void> {
  await query(
    "UPDATE station_room_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1",
    [hashToken(roomSessionToken)],
  );
}

export async function playbackForDeviceRoom(userId: string, stationId: string): Promise<RoomPlaybackResponse> {
  return transaction(async (client) => {
    const result = await client.query<RoomStationRow>(
      `${stationSelection}
        WHERE s.id = $1 AND ${availableStation}
          AND (s.owner_id = $2 OR EXISTS (
            SELECT 1 FROM station_room_memberships member
             WHERE member.station_id = s.id AND member.user_id = $2
               AND member.access_generation = room.generation
          ))
        FOR SHARE OF s`,
      [stationId, userId],
    );
    const station = result.rows[0];
    if (!station) throw new HttpError(404, "Private station not found.", "NOT_FOUND");
    return presentPlayback(station, null, station.owner_id !== userId);
  });
}

export async function leaveDeviceRoom(userId: string, stationId: string): Promise<boolean> {
  const removed = await query(
    "DELETE FROM station_room_memberships WHERE station_id = $1 AND user_id = $2 RETURNING station_id",
    [stationId, userId],
  );
  return Boolean(removed.rowCount);
}

export async function listDeviceRooms(userId: string, includeExplicit = false): Promise<DeviceRoomCatalogStation[]> {
  const result = await query<RoomStationRow>(
    `${stationSelection}
      WHERE ${availableStation}
        AND (s.owner_id = $1 OR EXISTS (
          SELECT 1 FROM station_room_memberships member
           WHERE member.station_id = s.id AND member.user_id = $1
             AND member.access_generation = room.generation
        ))
      ORDER BY s.name ASC`,
    [userId],
  );
  const origin = new URL(env().APP_URL).origin;
  return result.rows.filter((station) => includeExplicit || !station.effective_explicit).map((station) => {
    const token = decryptSecret(station.access_token_ciphertext);
    const issued = issueMobilePlaybackGrant(token, station.id, Date.now(), undefined, station.access_generation ?? "legacy");
    const root = `${origin}/api/public/stations/${encodeURIComponent(token)}`;
    const grantUrl = (url: string) => withMobilePlaybackGrant(url, issued.grant);
    return {
      id: station.id,
      stationKind: station.station_kind,
      playbackKind: station.station_kind === "RADIO" ? "CONTINUOUS_RADIO" : "SCHEDULED_TV",
      name: station.name,
      description: station.description,
      ownerName: station.owner_name,
      genreName: station.genre_name,
      online: station.broadcast_state === "RUNNING",
      explicit: station.effective_explicit,
      artworkUrl: station.logo_key ? grantUrl(`${root}/assets/logo`) : station.offline_slate_key ? grantUrl(`${root}/assets/slate`) : null,
      slateUrl: station.offline_slate_key ? grantUrl(`${root}/assets/slate`) : null,
      accessUrl: `${origin}/api/device/v1/rooms/${encodeURIComponent(station.id)}/playback`,
      relationship: station.owner_id === userId ? "OWNER" : "MEMBER",
    };
  });
}
