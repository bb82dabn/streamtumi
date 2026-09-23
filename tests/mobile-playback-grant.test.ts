import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  jar: {
    get: vi.fn((name: string) => {
      const value = mocks.cookieValues.get(name);
      return value ? { value } : undefined;
    }),
    set: vi.fn((name: string, value: string) => { mocks.cookieValues.set(name, value); }),
  },
  query: vi.fn(),
  storage: {
    getObject: vi.fn(),
    statObject: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.jar }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({
  APP_SECRET: "mobile-playback-grant-test-secret-32-chars",
}) }));
vi.mock("@/lib/storage", () => ({ bucket: "test-bucket", storage: mocks.storage }));
vi.mock("@/lib/schedule-publication", () => ({
  promotePendingLocked: vi.fn(),
  publishScheduleRefresh: vi.fn(),
}));

import { objectResponse, rewriteHlsPlaylist } from "@/lib/media";
import {
  issueMobilePlaybackGrant,
  mobilePlaybackGrantFromRequest,
  validateMobilePlaybackGrant,
  withMobilePlaybackGrant,
} from "@/lib/mobile-playback-grant";
import { grantPublicAccess, grantStationRoomLinkAccess, stationByToken } from "@/lib/public-access";

const token = "station-token";
const stationId = "00000000-0000-4000-8000-000000000001";
const now = Date.UTC(2026, 7, 18, 12);
const protectedStation = {
  id: stationId,
  access_password_hash: "password-hash",
  broadcast_state: "RUNNING",
};

describe("mobile playback grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValues.clear();
    mocks.query.mockResolvedValue({ rows: [protectedStation] });
  });

  it("issues URL-safe opaque grants capped at two hours", () => {
    const issued = issueMobilePlaybackGrant(token, stationId, now, 24 * 60 * 60);

    expect(issued.grant).toMatch(/^\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(issued.expiresAt.getTime() - now).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
    expect(issued.grant).not.toContain(token);
    expect(issued.grant).not.toContain(stationId);
    expect(validateMobilePlaybackGrant(issued.grant, token, stationId, now)).toBe(true);
  });

  it("rejects signature and expiry tampering", () => {
    const { grant } = issueMobilePlaybackGrant(token, stationId, now, 60);
    const [expiresAt, nonce, signature] = grant.split(".");
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    expect(validateMobilePlaybackGrant(`${expiresAt}.${nonce}.${changedSignature}`, token, stationId, now)).toBe(false);
    expect(validateMobilePlaybackGrant(`${Number(expiresAt) + 60}.${nonce}.${signature}`, token, stationId, now)).toBe(false);
    expect(validateMobilePlaybackGrant("not-a-grant", token, stationId, now)).toBe(false);
  });

  it("rejects expired grants and binds them to both token hash and station identity", () => {
    const { grant } = issueMobilePlaybackGrant(token, stationId, now, 10);

    expect(validateMobilePlaybackGrant(grant, token, stationId, now + 9_000)).toBe(true);
    expect(validateMobilePlaybackGrant(grant, token, stationId, now + 10_000)).toBe(false);
    expect(validateMobilePlaybackGrant(grant, "different-token", stationId, now)).toBe(false);
    expect(validateMobilePlaybackGrant(grant, token, "00000000-0000-4000-8000-000000000002", now)).toBe(false);
  });

  it("binds private-room grants to the current access generation", () => {
    const { grant } = issueMobilePlaybackGrant(token, stationId, now, 60, "room-generation-a");

    expect(validateMobilePlaybackGrant(grant, token, stationId, now, "room-generation-a")).toBe(true);
    expect(validateMobilePlaybackGrant(grant, token, stationId, now, "room-generation-b")).toBe(false);
    expect(validateMobilePlaybackGrant(grant, token, stationId, now)).toBe(false);
  });

  it("reads exactly one grant query parameter", () => {
    const { grant } = issueMobilePlaybackGrant(token, stationId, now);

    expect(mobilePlaybackGrantFromRequest(new Request(`https://example.test/state?grant=${grant}`), token, stationId, now)).toBe(grant);
    expect(mobilePlaybackGrantFromRequest(new Request("https://example.test/state"), token, stationId, now)).toBeNull();
    expect(mobilePlaybackGrantFromRequest(new Request(`https://example.test/state?grant=${grant}&grant=${grant}`), token, stationId, now)).toBeNull();
  });

  it("authorizes protected station lookup with a valid query grant", async () => {
    const { grant } = issueMobilePlaybackGrant(token, stationId);
    const request = new Request(`https://example.test/api/public/stations/${token}?grant=${grant}`);

    await expect(stationByToken(token, true, request)).resolves.toBe(protectedStation);
  });

  it("rejects missing or token-mismatched grants for protected stations", async () => {
    const { grant } = issueMobilePlaybackGrant("other-token", stationId);

    await expect(stationByToken(token, true, new Request(`https://example.test/state?grant=${grant}`)))
      .rejects.toMatchObject({ status: 401, code: "PASSWORD_REQUIRED" });
    await expect(stationByToken(token, true, new Request("https://example.test/state")))
      .rejects.toMatchObject({ status: 401, code: "PASSWORD_REQUIRED" });
  });

  it("rejects an expired grant during protected station authorization", async () => {
    const { grant } = issueMobilePlaybackGrant(token, stationId, Date.now() - 5_000, 1);

    await expect(stationByToken(token, true, new Request(`https://example.test/state?grant=${grant}`)))
      .rejects.toMatchObject({ status: 401, code: "PASSWORD_REQUIRED" });
  });

  it("keeps the existing browser cookie grant compatible", async () => {
    await grantPublicAccess(token);

    await expect(stationByToken(token)).resolves.toBe(protectedStation);
    expect(mocks.jar.set).toHaveBeenCalledWith(
      expect.stringMatching(/^cl_access_/),
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: `/api/public/stations/${token}` }),
    );
  });

  it("exchanges a private-room share link for a generation-bound browser cookie", async () => {
    const roomStation = { ...protectedStation, access_password_hash: null, room_access_generation: "room-generation" };
    mocks.query.mockResolvedValue({ rows: [roomStation] });

    await grantStationRoomLinkAccess(token);

    await expect(stationByToken(token)).resolves.toBe(roomStation);
    expect(mocks.jar.set).toHaveBeenCalledWith(
      expect.stringMatching(/^cl_access_/),
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: `/api/public/stations/${token}` }),
    );
  });

  it("does not let share-link bootstrap bypass a legacy station password", async () => {
    await grantStationRoomLinkAccess(token);

    expect(mocks.jar.set).not.toHaveBeenCalled();
    await expect(stationByToken(token)).rejects.toMatchObject({ status: 401, code: "PASSWORD_REQUIRED" });
  });

  it("does not require or append grants for passwordless stations", async () => {
    const publicStation = { ...protectedStation, access_password_hash: null };
    mocks.query.mockResolvedValueOnce({ rows: [publicStation] });

    await expect(stationByToken(token, true, new Request("https://example.test/state?grant=invalid")))
      .resolves.toBe(publicStation);
    expect(withMobilePlaybackGrant("segment.ts?part=1#time", "safe_grant"))
      .toBe("segment.ts?part=1&grant=safe_grant#time");
  });

});

describe("protected HLS manifest rewriting", () => {
  it("propagates the grant to every non-comment URI in master and media playlists", () => {
    const playlist = [
      "#EXTM3U\r",
      "#EXT-X-STREAM-INF:BANDWIDTH=1000\r",
      " variants/main.m3u8?quality=high \r",
      "#EXTINF:4,\r",
      "segment_0000000001.ts\r",
      "../segment_0000000002.ts#start\r",
      "\r",
    ].join("\n");

    const rewritten = rewriteHlsPlaylist(playlist, "grant_value");
    expect(rewritten).toContain("#EXT-X-STREAM-INF:BANDWIDTH=1000\r\n");
    expect(rewritten).toContain(" variants/main.m3u8?quality=high&grant=grant_value \r\n");
    expect(rewritten).toContain("segment_0000000001.ts?grant=grant_value\r\n");
    expect(rewritten).toContain("../segment_0000000002.ts?grant=grant_value#start\r\n");
    expect(rewritten.match(/grant=grant_value/g)).toHaveLength(3);
  });

  it("rewrites stored protected manifests and reports the transformed byte length", async () => {
    const playlist = "#EXTM3U\nvariant/index.m3u8\n";
    mocks.storage.statObject.mockResolvedValueOnce({ size: Buffer.byteLength(playlist) });
    mocks.storage.getObject.mockResolvedValueOnce(Readable.from([Buffer.from(playlist)]));

    const response = await objectResponse("tv/master.m3u8", new Request("https://example.test/master.m3u8"), "private, no-store", "grant_value");
    const rewritten = await response.text();
    expect(rewritten).toBe("#EXTM3U\nvariant/index.m3u8?grant=grant_value\n");
    expect(response.headers.get("Content-Length")).toBe(String(Buffer.byteLength(rewritten)));
  });

  it("leaves stored public manifests byte-for-byte unchanged when no grant is supplied", async () => {
    const playlist = "#EXTM3U\nvariant/index.m3u8\n";
    mocks.storage.statObject.mockResolvedValueOnce({ size: Buffer.byteLength(playlist) });
    mocks.storage.getObject.mockResolvedValueOnce(Readable.from([Buffer.from(playlist)]));

    const response = await objectResponse("tv/master.m3u8", new Request("https://example.test/master.m3u8"));
    expect(await response.text()).toBe(playlist);
  });
});
