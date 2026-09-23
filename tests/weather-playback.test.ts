import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicStation } from "@/lib/public-access";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
  query: vi.fn(),
  redisExists: vi.fn(),
  redisHmget: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/env", () => ({ env: () => ({
  APP_SECRET: "weather-playback-test-secret-at-least-32-characters",
  APP_URL: "https://streamtumi.test",
  WEATHER_RENDER_IDLE_SECONDS: 300,
}) }));
vi.mock("@/lib/queue", () => ({ getWeatherRenderQueue: () => ({ add: mocks.add, getJob: mocks.getJob }) }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ exists: mocks.redisExists, hmget: mocks.redisHmget, set: mocks.redisSet }) }));

import { assertWeatherStationRunning, demandWeatherFeed, issueWeatherPlayback, requireWeatherPlaybackSession } from "@/lib/weather-playback";

const station = {
  id: "00000000-0000-4000-8000-000000000001",
  playback_type: "WEATHERSTAR_4000",
  broadcast_state: "RUNNING",
} as PublicStation;

describe("personalized Weather playback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"));
    mocks.getJob.mockResolvedValue(undefined);
    mocks.redisExists.mockResolvedValue(1);
    mocks.redisSet.mockResolvedValue("OK");
  });

  it("refuses to issue playback while the Weather station is stopped", async () => {
    const stopped = { ...station, broadcast_state: "STOPPED" } as PublicStation;

    expect(() => assertWeatherStationRunning(stopped)).toThrowError(expect.objectContaining({
      status: 409,
      code: "WEATHER_STATION_OFFLINE",
    }));
    await expect(issueWeatherPlayback("user-id", stopped, "S".repeat(43), "tune-id"))
      .rejects.toMatchObject({ status: 409, code: "WEATHER_STATION_OFFLINE" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("requires a configured ZIP before creating a renderer session", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ weather_zip_code: null }], rowCount: 1 });

    await expect(issueWeatherPlayback("user-id", station, "S".repeat(43), "tune-id"))
      .rejects.toMatchObject({ status: 409, code: "WEATHER_LOCATION_REQUIRED" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("renews an expired idempotent session while preserving an unexpired grant", async () => {
    const expiresAt = new Date("2026-08-21T14:00:00.000Z");
    mocks.query
      .mockResolvedValueOnce({ rows: [{ weather_zip_code: "02139" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{
        id: "00000000-0000-4000-8000-000000000002",
        station_id: station.id,
        feed_key: "feed-key",
        zip_code: "02139",
        expires_at: expiresAt,
      }], rowCount: 1 });

    const playback = await issueWeatherPlayback("user-id", station, "S".repeat(43), "tune-id");

    const [sql, values] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("token_hash = EXCLUDED.token_hash");
    expect(sql).toContain("WHEN weather_playback_sessions.expires_at > now()");
    expect(sql).toContain("ELSE EXCLUDED.expires_at");
    expect(values[6]).toEqual(expiresAt);
    expect(playback).toMatchObject({
      kind: "PERSONALIZED_HLS",
      expiresAt: expiresAt.toISOString(),
    });
    expect(mocks.redisSet).toHaveBeenCalledWith("weather:demand:feed-key", expect.any(String), "EX", 300);
    expect(mocks.add).toHaveBeenCalledWith("render-weather", { feedKey: "feed-key", zipCode: "02139" }, { jobId: "feed-key" });
  });

  it("fails fast when no renderer heartbeat is available", async () => {
    mocks.redisExists.mockResolvedValueOnce(0);

    await expect(demandWeatherFeed("feed-key", "02139"))
      .rejects.toMatchObject({ status: 503, code: "WEATHER_RENDERER_UNAVAILABLE" });
    expect(mocks.getJob).not.toHaveBeenCalled();
  });

  it("coalesces queue inspection while still refreshing viewer demand", async () => {
    mocks.redisSet
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce(null);

    await demandWeatherFeed("feed-key", "02139");

    expect(mocks.redisSet).toHaveBeenCalledWith("weather:demand:feed-key", expect.any(String), "EX", 300);
    expect(mocks.redisSet).toHaveBeenCalledWith("weather:enqueue:feed-key", "1", "EX", 5, "NX");
    expect(mocks.getJob).not.toHaveBeenCalled();
  });

  it("revalidates active account state and current ZIP for every HLS session", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: "session-id",
      user_id: "user-id",
      station_id: station.id,
      feed_key: "feed-key",
      zip_code: "02139",
      expires_at: new Date("2026-08-21T14:00:00.000Z"),
    }], rowCount: 1 });

    await requireWeatherPlaybackSession(station.id, "W".repeat(43));

    const sql = String(mocks.query.mock.calls[0]?.[0]);
    expect(sql).toContain("JOIN users u ON u.id = session.user_id");
    expect(sql).toContain("u.disabled_at IS NULL");
    expect(sql).toContain("u.weather_zip_code = session.zip_code");
  });
});
