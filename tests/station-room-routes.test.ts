import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const stationId = "00000000-0000-4000-8000-000000000030";
const roomSessionToken = "R".repeat(43);
const deviceToken = "D".repeat(43);

const mocks = vi.hoisted(() => ({
  disableStationRoomKey: vi.fn(),
  exchangeStationRoomKey: vi.fn(),
  exchangeMobileStationRoomKey: vi.fn(),
  leaveDeviceRoom: vi.fn(),
  loginDeviceWithPassword: vi.fn(),
  optionalDeviceAuth: vi.fn(),
  optionalMobileAuth: vi.fn(),
  playbackForDeviceRoom: vi.fn(),
  playbackForRoomSession: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitByKey: vi.fn(),
  requireApiUser: vi.fn(),
  requireDeviceAuth: vi.fn(),
  revokeRoomSession: vi.fn(),
  rotateStationRoomKey: vi.fn(),
  stationRoomAccessState: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/crypto", () => ({ hashToken: (value: string) => `hashed:${value}` }));
vi.mock("@/lib/device-auth", () => ({
  loginDeviceWithPassword: mocks.loginDeviceWithPassword,
  optionalDeviceAuth: mocks.optionalDeviceAuth,
  requireDeviceAuth: mocks.requireDeviceAuth,
}));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://streamtumi.test" }) }));
vi.mock("@/lib/mobile-auth", () => ({ optionalMobileAuth: mocks.optionalMobileAuth }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  rateLimitByKey: mocks.rateLimitByKey,
}));
vi.mock("@/lib/station-rooms", () => ({
  disableStationRoomKey: mocks.disableStationRoomKey,
  exchangeMobileStationRoomKey: mocks.exchangeMobileStationRoomKey,
  exchangeStationRoomKey: mocks.exchangeStationRoomKey,
  leaveDeviceRoom: mocks.leaveDeviceRoom,
  playbackForDeviceRoom: mocks.playbackForDeviceRoom,
  playbackForRoomSession: mocks.playbackForRoomSession,
  revokeRoomSession: mocks.revokeRoomSession,
  rotateStationRoomKey: mocks.rotateStationRoomKey,
  stationRoomAccessState: mocks.stationRoomAccessState,
}));

import { POST as loginDevice } from "@/app/api/device/v1/login/route";
import { POST as leaveRoom } from "@/app/api/device/v1/rooms/[stationId]/leave/route";
import { GET as deviceRoomPlayback } from "@/app/api/device/v1/rooms/[stationId]/playback/route";
import { POST as accessRoom } from "@/app/api/roku/v2/rooms/access/route";
import { POST as accessMobileRoom } from "@/app/api/mobile/v1/rooms/access/route";
import { POST as renewMobileRoomSession } from "@/app/api/mobile/v1/rooms/session/route";
import { POST as renewRoomSession } from "@/app/api/roku/v2/rooms/session/route";
import { POST as rotateRoomKey } from "@/app/api/stations/[id]/room-key/route";

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://streamtumi.test${path}`, {
    method: "POST",
    headers: { Origin: "https://streamtumi.test", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const roomPlayback = {
  station: { id: stationId, name: "Private room" },
  roomSessionToken: null,
  membershipSaved: true,
};

describe("direct device login and room routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loginDeviceWithPassword.mockResolvedValue({
      deviceToken,
      expiresAt: "2027-02-17T12:00:00.000Z",
      scopes: ["catalog:read", "tunes:write", "rooms:join"],
      account: { displayName: "Viewer", email: "viewer@example.test" },
    });
    mocks.optionalDeviceAuth.mockResolvedValue(null);
    mocks.optionalMobileAuth.mockResolvedValue(null);
    mocks.requireDeviceAuth.mockResolvedValue({
      sessionId: "device-session",
      scopes: ["catalog:read", "tunes:write", "rooms:join"],
      user: { id: "viewer-id" },
    });
    mocks.requireApiUser.mockResolvedValue({ id: "owner-id" });
    mocks.exchangeStationRoomKey.mockResolvedValue(roomPlayback);
    mocks.exchangeMobileStationRoomKey.mockResolvedValue({ ...roomPlayback, roomSessionToken });
    mocks.playbackForDeviceRoom.mockResolvedValue(roomPlayback);
    mocks.playbackForRoomSession.mockResolvedValue({
      ...roomPlayback,
      roomSessionToken,
      membershipSaved: false,
    });
    mocks.leaveDeviceRoom.mockResolvedValue(true);
    mocks.rotateStationRoomKey.mockResolvedValue("123456");
  });

  it("rate-limits direct login by normalized account hash and never caches its token", async () => {
    const request = jsonRequest("/api/device/v1/login", {
      email: " VIEWER@EXAMPLE.TEST ",
      password: "password",
      deviceType: "ROKU",
      displayName: "Den Roku",
    });

    const response = await loginDevice(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      deviceToken,
      tokenType: "Device",
      scopes: ["catalog:read", "tunes:write", "rooms:join"],
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith(request, "device-v1-login", 20, 900);
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith(
      "password-login-account", "hashed:password-login:viewer@example.test", 10, 900,
    );
    expect(mocks.loginDeviceWithPassword).toHaveBeenCalledWith({
      email: "viewer@example.test",
      password: "password",
      deviceType: "ROKU",
      displayName: "Den Roku",
    });
  });

  it("rejects a cross-origin direct login before rate limits or credential checks", async () => {
    const response = await loginDevice(jsonRequest("/api/device/v1/login", {
      email: "viewer@example.test",
      password: "password",
      deviceType: "ROKU",
      displayName: "Den Roku",
    }, { Origin: "https://hostile.example" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BAD_ORIGIN" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.loginDeviceWithPassword).not.toHaveBeenCalled();
  });

  it("accepts a room key with optional device identity and marks the response private", async () => {
    const device = await mocks.requireDeviceAuth();
    mocks.optionalDeviceAuth.mockResolvedValueOnce(device);
    const request = jsonRequest("/api/roku/v2/rooms/access", { accessKey: "012345" }, {
      Authorization: `Device ${deviceToken}`,
    });

    const response = await accessRoom(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.optionalDeviceAuth).toHaveBeenCalledWith(request);
    expect(mocks.exchangeStationRoomKey).toHaveBeenCalledWith("012345", device);
    expect(mocks.rateLimit).toHaveBeenCalledWith(request, "roku-v2-room-access", 12, 900);
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("roku-v2-room-access-global", "all", 120, 60);
  });

  it("accepts a standalone mobile room key and saves membership for an authenticated user", async () => {
    mocks.optionalMobileAuth.mockResolvedValueOnce({ user: { id: "mobile-viewer-id" } });
    const request = jsonRequest("/api/mobile/v1/rooms/access", { accessKey: "012345" }, {
      Authorization: `Bearer ${"M".repeat(43)}`,
    });

    const response = await accessMobileRoom(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.exchangeMobileStationRoomKey).toHaveBeenCalledWith("012345", "mobile-viewer-id");
    expect(mocks.rateLimit).toHaveBeenCalledWith(request, "mobile-v1-room-access", 12, 900);
  });

  it("renews an opaque mobile room session without retaining the room key", async () => {
    const request = jsonRequest("/api/mobile/v1/rooms/session", { roomSessionToken });

    const response = await renewMobileRoomSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.playbackForRoomSession).toHaveBeenCalledWith(roomSessionToken);
  });

  it("requires catalog scope for linked room playback and does not cache its grant", async () => {
    const request = new Request(`https://streamtumi.test/api/device/v1/rooms/${stationId}/playback`, {
      headers: { Authorization: `Device ${deviceToken}` },
    });

    const response = await deviceRoomPlayback(request, { params: Promise.resolve({ stationId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.requireDeviceAuth).toHaveBeenCalledWith(request, "catalog:read");
    expect(mocks.playbackForDeviceRoom).toHaveBeenCalledWith("viewer-id", stationId);
  });

  it("does not resolve linked room playback when device authentication fails", async () => {
    mocks.requireDeviceAuth.mockRejectedValueOnce(
      new HttpError(401, "A valid device token is required.", "DEVICE_UNAUTHENTICATED"),
    );
    const request = new Request(`https://streamtumi.test/api/device/v1/rooms/${stationId}/playback`);

    const response = await deviceRoomPlayback(request, { params: Promise.resolve({ stationId }) });

    expect(response.status).toBe(401);
    expect(mocks.playbackForDeviceRoom).not.toHaveBeenCalled();
  });

  it("renews guest sessions without device auth and never caches the replacement grant", async () => {
    const request = jsonRequest("/api/roku/v2/rooms/session", { roomSessionToken });

    const response = await renewRoomSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.playbackForRoomSession).toHaveBeenCalledWith(roomSessionToken);
    expect(mocks.requireDeviceAuth).not.toHaveBeenCalled();
  });

  it("requires room scope to leave a linked membership", async () => {
    const request = jsonRequest(`/api/device/v1/rooms/${stationId}/leave`, {});

    const response = await leaveRoom(request, { params: Promise.resolve({ stationId }) });

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.requireDeviceAuth).toHaveBeenCalledWith(request, "rooms:join");
    expect(mocks.leaveDeviceRoom).toHaveBeenCalledWith("viewer-id", stationId);
  });

  it("requires the station owner to rotate a key and returns it only in a no-store response", async () => {
    const request = jsonRequest(`/api/stations/${stationId}/room-key`, {});

    const response = await rotateRoomKey(request, { params: Promise.resolve({ id: stationId }) });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ enabled: true, accessKey: "123456" });
    expect(mocks.requireApiUser).toHaveBeenCalledOnce();
    expect(mocks.rotateStationRoomKey).toHaveBeenCalledWith(stationId, "owner-id");
  });
});
