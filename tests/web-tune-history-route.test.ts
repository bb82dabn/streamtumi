import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const token = "A".repeat(43);
const tuneId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  assertCanRecordTune: vi.fn(),
  parseTune: vi.fn(),
  rateLimitByKey: vi.fn(),
  recordTune: vi.fn(),
  requireApiUser: vi.fn(),
  resolvePublicStation: vi.fn(),
  issueWeatherPlayback: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "https://streamtumi.test", APP_ALLOWED_ORIGINS: "" }),
}));
vi.mock("@/lib/public-access", () => ({ resolvePublicStation: mocks.resolvePublicStation }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/tune-history", () => ({
  assertCanRecordTune: mocks.assertCanRecordTune,
  mobileTuneSchema: { parse: mocks.parseTune },
  recordTune: mocks.recordTune,
}));
vi.mock("@/lib/weather-playback", () => ({ issueWeatherPlayback: mocks.issueWeatherPlayback }));

import { POST } from "@/app/api/client/v1/tunes/route";

const user = { id: "listener", emailVerified: true };
const station = { id: "station", owner_id: "owner", visibility: "PUBLIC", access_password_hash: null, playback_type: "conventional" };

function request(product: "MAIN" | "RADIO" = "MAIN", origin = product === "RADIO" ? "https://radio.streamtumi.test" : "https://streamtumi.test") {
  return new Request(`${origin}/api/client/v1/tunes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "x-streamtumi-product": product },
    body: JSON.stringify({ id: tuneId, stationToken: token }),
  });
}

describe("web tune-history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue(user);
    mocks.parseTune.mockReturnValue({ id: tuneId, stationToken: token });
    mocks.resolvePublicStation.mockResolvedValue(station);
    mocks.issueWeatherPlayback.mockResolvedValue({
      kind: "PERSONALIZED_HLS",
      provider: "WS4KP",
      sessionId: "00000000-0000-4000-8000-000000000002",
      hlsUrl: "https://streamtumi.test/weather.m3u8",
      expiresAt: "2026-08-18T14:00:00.000Z",
      displayMode: "WIDESCREEN_16_9",
    });
    mocks.recordTune.mockResolvedValue({
      id: tuneId,
      stationId: station.id,
      client: "WEB",
      tunedAt: "2026-08-18T12:00:00.000Z",
      created: true,
    });
  });

  it("uses the canonical MAIN cookie session and records a WEB tune", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.requireApiUser).toHaveBeenCalledTimes(1);
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("client-v1-tunes", user.id, 30, 60);
    expect(mocks.resolvePublicStation).toHaveBeenCalledWith(token);
    expect(mocks.assertCanRecordTune).toHaveBeenCalledWith(station, user.id);
    expect(mocks.recordTune).toHaveBeenCalledWith(tuneId, user.id, station.id, "WEB");
  });

  it("rejects mutations sent from the retired Radio origin", async () => {
    expect((await POST(request("RADIO"))).status).toBe(403);
    expect(mocks.requireApiUser).not.toHaveBeenCalled();
  });

  it("returns 200 for an idempotent retry", async () => {
    mocks.recordTune.mockResolvedValueOnce({
      id: tuneId,
      stationId: station.id,
      client: "WEB",
      tunedAt: "2026-08-18T12:00:00.000Z",
      created: false,
    });

    expect((await POST(request())).status).toBe(200);
  });

  it("requires cookie authentication and verification for ordinary tune history", async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new HttpError(401, "Sign in is required.", "UNAUTHENTICATED"));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.resolvePublicStation).not.toHaveBeenCalled();

    mocks.requireApiUser.mockResolvedValueOnce({ id: "listener", emailVerified: false });
    const unverified = await POST(request());
    expect(unverified.status).toBe(403);
    await expect(unverified.json()).resolves.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
    expect(mocks.resolvePublicStation).toHaveBeenCalledWith(token);
  });

  it("allows an unverified user to start weather without recording tune history", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({ id: "listener", emailVerified: false });
    const weatherStation = { ...station, playback_type: "WEATHERSTAR_4000" };
    mocks.resolvePublicStation.mockResolvedValueOnce(weatherStation);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tune: { id: tuneId, stationId: station.id, client: "WEB" },
      playback: { kind: "PERSONALIZED_HLS", provider: "WS4KP" },
    });
    expect(mocks.issueWeatherPlayback).toHaveBeenCalledWith(user.id, weatherStation, token, tuneId);
    expect(mocks.recordTune).not.toHaveBeenCalled();
  });

  it("rejects cross-product origins before authenticating", async () => {
    const response = await POST(request("MAIN", "https://radio.streamtumi.test"));
    expect(response.status).toBe(403);
    expect(mocks.requireApiUser).not.toHaveBeenCalled();
    expect(mocks.recordTune).not.toHaveBeenCalled();
  });

  it("does not record a private, password-protected, or owner station", async () => {
    mocks.assertCanRecordTune.mockImplementationOnce(() => {
      throw new HttpError(404, "Station not found.", "NOT_FOUND");
    });

    expect((await POST(request())).status).toBe(404);
    expect(mocks.recordTune).not.toHaveBeenCalled();
  });
});
