import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demandWeatherFeed: vi.fn(),
  query: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  weatherFeedKey: vi.fn(() => "feed-hmac"),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ get: mocks.redisGet, set: mocks.redisSet }) }));
vi.mock("@/lib/weather-playback", () => ({
  demandWeatherFeed: mocks.demandWeatherFeed,
  weatherFeedKey: mocks.weatherFeedKey,
}));

import {
  cacheGuideWeatherSummary,
  extractGuideWeatherSummary,
  getGuideWeatherSummaryForOwner,
  normalizeGuideWeatherSummary,
} from "@/lib/weather-summary";

const now = new Date("2026-08-21T12:00:00.000Z");
const validSummary = {
  temperature: 72,
  condition: "Partly Cloudy",
  high: 81,
  low: 63,
  shortForecast: "Scattered showers, then clearing",
  severe: false,
  observedAt: "2026-08-21T11:35:00.000Z",
};

describe("Guide weather summary sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.demandWeatherFeed.mockResolvedValue(undefined);
    mocks.redisSet.mockResolvedValue("OK");
  });

  it("normalizes rendered values and drops all location identifiers", () => {
    const summary = extractGuideWeatherSummary({
      temperature: " 72\u00b0 F ",
      condition: " Partly\n Cloudy ",
      high: "81",
      low: "63\u00b0",
      shortForecast: " Scattered showers,   then clearing ",
      severe: true,
      observedAt: validSummary.observedAt,
      location: "Cambridge",
      zipCode: "02139",
      latitude: 42.36,
      longitude: -71.1,
    }, now.getTime());

    expect(summary).toEqual({ ...validSummary, severe: true });
    expect(Object.keys(summary ?? {})).toEqual([
      "temperature", "condition", "high", "low", "shortForecast", "severe", "observedAt",
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/02139|Cambridge|42\.36|-71\.1/);
  });

  it("rejects malformed, unbounded, identifying, and non-strict cached values", () => {
    const malformed = [
      null,
      { ...validSummary, temperature: "72" },
      { ...validSummary, temperature: 151 },
      { ...validSummary, low: 90 },
      { ...validSummary, severe: "true" },
      { ...validSummary, condition: "" },
      { ...validSummary, shortForecast: "Forecast for ZIP 02139" },
      { ...validSummary, location: "Cambridge" },
      { ...validSummary, observedAt: "not-a-date" },
      { ...validSummary, observedAt: "2026-08-21" },
    ];

    for (const candidate of malformed) {
      expect(normalizeGuideWeatherSummary(candidate, now.getTime())).toBeNull();
    }
  });

  it("preserves a strict severe boolean", () => {
    expect(normalizeGuideWeatherSummary({ ...validSummary, severe: true }, now.getTime())?.severe).toBe(true);
    expect(normalizeGuideWeatherSummary(validSummary, now.getTime())?.severe).toBe(false);
  });

  it("rejects stale observations and implausible future timestamps", () => {
    expect(normalizeGuideWeatherSummary({
      ...validSummary,
      observedAt: "2026-08-21T09:59:59.999Z",
    }, now.getTime())).toBeNull();
    expect(normalizeGuideWeatherSummary({
      ...validSummary,
      observedAt: "2026-08-21T12:05:00.001Z",
    }, now.getTime())).toBeNull();
  });

  it("caches only valid JSON for fifteen minutes under the feed HMAC", async () => {
    await expect(cacheGuideWeatherSummary("feed-hmac", validSummary, now.getTime())).resolves.toBe(true);
    expect(mocks.redisSet).toHaveBeenCalledWith(
      "weather:summary:feed-hmac",
      JSON.stringify(validSummary),
      "EX",
      900,
    );

    await expect(cacheGuideWeatherSummary("feed-hmac", { ...validSummary, zipCode: "02139" }, now.getTime())).resolves.toBe(false);
    expect(mocks.redisSet).toHaveBeenCalledTimes(1);
  });
});

describe("owner Guide weather summary demand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.demandWeatherFeed.mockResolvedValue(undefined);
  });

  it("privately derives and demands the existing feed before returning safe cache data", async () => {
    mocks.query.mockResolvedValue({ rows: [{ weather_zip_code: "02139" }] });
    mocks.redisGet.mockResolvedValue(JSON.stringify(validSummary));

    await expect(getGuideWeatherSummaryForOwner("owner-id")).resolves.toEqual(validSummary);

    expect(mocks.weatherFeedKey).toHaveBeenCalledWith("02139");
    expect(mocks.demandWeatherFeed).toHaveBeenCalledWith("feed-hmac", "02139");
    expect(mocks.redisGet).toHaveBeenCalledWith("weather:summary:feed-hmac");
    const sql = String(mocks.query.mock.calls[0]?.[0]);
    expect(sql).toContain("disabled_at IS NULL");
    expect(sql).toContain("deletion_requested_at IS NULL");
    expect(sql).toContain("anonymized_at IS NULL");
  });

  it("returns null for an unconfigured owner without deriving a feed", async () => {
    mocks.query.mockResolvedValue({ rows: [{ weather_zip_code: null }] });

    await expect(getGuideWeatherSummaryForOwner("owner-id")).resolves.toBeNull();
    expect(mocks.weatherFeedKey).not.toHaveBeenCalled();
    expect(mocks.redisGet).not.toHaveBeenCalled();
  });

  it("never exposes malformed cache data or infrastructure errors", async () => {
    mocks.query.mockResolvedValue({ rows: [{ weather_zip_code: "02139" }] });
    mocks.demandWeatherFeed.mockRejectedValue(new Error("renderer failed for 02139"));
    mocks.redisGet.mockResolvedValue("{bad-json");
    await expect(getGuideWeatherSummaryForOwner("owner-id")).resolves.toBeNull();

    mocks.query.mockRejectedValue(new Error("database exposed 02139"));
    await expect(getGuideWeatherSummaryForOwner("owner-id")).resolves.toBeNull();
  });
});
