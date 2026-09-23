import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceIdentity } from "@/lib/device-auth";

const roomSessionToken = "R".repeat(43);
const stationId = "00000000-0000-4000-8000-000000000020";
const ownerId = "00000000-0000-4000-8000-000000000021";
const userId = "00000000-0000-4000-8000-000000000022";
const generation = "00000000-0000-4000-8000-000000000023";
const appSecret = "station-room-test-secret-at-least-32-characters";
const grantExpiresAt = new Date("2026-08-21T14:00:00.000Z");

const mocks = vi.hoisted(() => ({
  decryptSecret: vi.fn(),
  issueMobilePlaybackGrant: vi.fn(),
  query: vi.fn(),
  randomToken: vi.fn(),
  transaction: vi.fn(),
  withMobilePlaybackGrant: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: mocks.decryptSecret,
  hashToken: (value: string) => `sha256:${value.length}:${value.charCodeAt(0)}`,
  randomToken: mocks.randomToken,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({
  APP_SECRET: appSecret,
  APP_URL: "https://streamtumi.test",
}) }));
vi.mock("@/lib/mobile-playback-grant", () => ({
  issueMobilePlaybackGrant: mocks.issueMobilePlaybackGrant,
  withMobilePlaybackGrant: mocks.withMobilePlaybackGrant,
}));

import {
  exchangeMobileStationRoomKey,
  exchangeStationRoomKey,
  playbackForRoomSession,
  roomKeyLookupHash,
  rotateStationRoomKey,
} from "@/lib/station-rooms";

function result(rows: unknown[] = [], rowCount = rows.length) {
  return { rows, rowCount };
}

function roomStation(overrides: Record<string, unknown> = {}) {
  return {
    id: stationId,
    owner_id: ownerId,
    access_token_ciphertext: "encrypted-station-token",
    access_generation: generation,
    station_kind: "TV",
    name: "Invite-only TV",
    description: "Private programming",
    broadcast_state: "RUNNING",
    logo_key: "logo.png",
    offline_slate_key: "slate.png",
    effective_explicit: false,
    owner_name: "Owner",
    genre_name: "Culture",
    ...overrides,
  };
}

const linkedDevice: DeviceIdentity = {
  sessionId: "00000000-0000-4000-8000-000000000024",
  deviceType: "ROKU",
  scopes: ["catalog:read", "tunes:write", "rooms:join"],
  user: {
    id: userId,
    email: "viewer@example.test",
    displayName: "Viewer",
    role: "USER",
    mustChangePassword: false,
    emailVerified: true,
    showExplicitContent: false,
    explicitAgeAttestedAt: null,
  },
};

describe("station private rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptSecret.mockReturnValue("station-access-token");
    mocks.issueMobilePlaybackGrant.mockReturnValue({ grant: "generation-bound-grant", expiresAt: grantExpiresAt });
    mocks.randomToken.mockReturnValue(roomSessionToken);
    mocks.withMobilePlaybackGrant.mockImplementation((url: string, grant: string) => `${url}?grant=${grant}`);
  });

  it("uses a domain-separated HMAC for six-digit room-key lookup", () => {
    const accessKey = "004271";
    const expected = createHmac("sha256", appSecret)
      .update(`station-room-access:v1:${accessKey}`)
      .digest("hex");

    expect(roomKeyLookupHash(accessKey)).toBe(expected);
    expect(roomKeyLookupHash(accessKey)).toMatch(/^[a-f0-9]{64}$/);
    expect(roomKeyLookupHash(accessKey)).not.toContain(accessKey);
    expect(roomKeyLookupHash("004272")).not.toBe(expected);
  });

  it("rotates a private station to a newly generated six-digit HMAC lookup", async () => {
    const client = { query: vi.fn(async (...args: [string, unknown[]?]) => {
      const sql = args[0];
      if (sql.includes("SELECT visibility")) return result([{ visibility: "PRIVATE" }]);
      if (sql.includes("INSERT INTO station_room_access")) return result([{ generation }]);
      return result();
    }) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    const accessKey = await rotateStationRoomKey(stationId, ownerId);

    expect(accessKey).toMatch(/^\d{6}$/);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining("SELECT visibility"),
      "DELETE FROM station_room_access WHERE station_id = $1",
      expect.stringContaining("INSERT INTO station_room_access"),
      "UPDATE stations SET access_password_hash = NULL, updated_at = now() WHERE id = $1",
    ]);
    const insertValues = client.query.mock.calls[2][1] as unknown[];
    expect(insertValues).toEqual([stationId, roomKeyLookupHash(accessKey)]);
    expect(insertValues).not.toContain(accessKey);
  });

  it("returns the same unavailable error for unknown or inaccessible room keys", async () => {
    for (const accessKey of ["000000", "999999"]) {
      const client = { query: vi.fn().mockResolvedValueOnce(result()) };
      mocks.transaction.mockImplementationOnce((work) => work(client));

      await expect(exchangeStationRoomKey(accessKey, null)).rejects.toMatchObject({
        status: 404,
        code: "ROOM_UNAVAILABLE",
        message: "That room key is invalid or unavailable.",
      });
      expect(client.query.mock.calls[0][1]).toEqual([roomKeyLookupHash(accessKey)]);
      expect(client.query.mock.calls[0][1]).not.toContain(accessKey);
    }
  });

  it("saves a linked account membership at the current generation without issuing a guest session", async () => {
    const station = roomStation();
    const client = { query: vi.fn()
      .mockResolvedValueOnce(result([station]))
      .mockResolvedValueOnce(result()) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    const playback = await exchangeStationRoomKey("123456", linkedDevice);

    expect(playback).toMatchObject({ roomSessionToken: null, membershipSaved: true });
    const [membershipSql, membershipValues] = client.query.mock.calls[1] as [string, unknown[]];
    expect(membershipSql).toContain("INSERT INTO station_room_memberships");
    expect(membershipSql).toContain("SET access_generation = EXCLUDED.access_generation");
    expect(membershipValues).toEqual([stationId, userId, generation]);
    expect(mocks.randomToken).not.toHaveBeenCalled();
    expect(mocks.issueMobilePlaybackGrant).toHaveBeenCalledWith(
      "station-access-token", stationId, expect.any(Number), undefined, generation,
    );
  });

  it("gives a signed-in mobile member an opaque renewable session", async () => {
    const station = roomStation();
    const client = { query: vi.fn()
      .mockResolvedValueOnce(result([station]))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result([{ id: "room-session" }])) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    const playback = await exchangeMobileStationRoomKey("123456", userId);

    expect(playback).toMatchObject({ roomSessionToken, membershipSaved: true });
    expect(client.query.mock.calls[1][0]).toContain("INSERT INTO station_room_memberships");
    expect(client.query.mock.calls[2][0]).toContain("INSERT INTO station_room_sessions");
  });

  it("issues an anonymous opaque session while storing only its hash and access generation", async () => {
    const station = roomStation();
    const client = { query: vi.fn()
      .mockResolvedValueOnce(result([station]))
      .mockResolvedValueOnce(result([{ id: "room-session" }])) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    const playback = await exchangeStationRoomKey("123456", null);

    expect(playback).toMatchObject({ roomSessionToken, membershipSaved: false });
    const [sessionSql, sessionValues] = client.query.mock.calls[1] as [string, unknown[]];
    expect(sessionSql).toContain("station_room_sessions (station_id, access_generation, token_hash)");
    expect(sessionValues).toEqual([stationId, generation, "sha256:43:82"]);
    expect(sessionValues).not.toContain(roomSessionToken);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("station_room_memberships"))).toBe(false);
  });

  it("renews a saved room only when its session and playback grant match the active generation", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce(result([roomStation()]))
      .mockResolvedValueOnce(result()) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    const playback = await playbackForRoomSession(roomSessionToken);

    expect(playback).toMatchObject({ roomSessionToken, membershipSaved: false });
    const [lookupSql, lookupValues] = client.query.mock.calls[0] as [string, unknown[]];
    expect(lookupSql).toContain("session.access_generation = room.generation");
    expect(lookupSql).toContain("session.revoked_at IS NULL");
    expect(lookupValues).toEqual(["sha256:43:82"]);
    expect(mocks.issueMobilePlaybackGrant).toHaveBeenCalledWith(
      "station-access-token", stationId, expect.any(Number), undefined, generation,
    );
    expect(client.query).toHaveBeenLastCalledWith(
      "UPDATE station_room_sessions SET last_used_at = now() WHERE token_hash = $1",
      ["sha256:43:82"],
    );
  });
});
