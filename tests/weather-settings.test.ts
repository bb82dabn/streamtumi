import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

import { getWeatherLocation, updateWeatherLocation } from "@/lib/weather-settings";

describe("private account weather settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only the active user's stored ZIP", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ weather_zip_code: "02139" }] });
    await expect(getWeatherLocation("user-1")).resolves.toEqual({ weatherZipCode: "02139" });
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain("deletion_requested_at IS NULL");
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["user-1"]);
  });

  it("updates or clears only the ZIP field", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ weather_zip_code: null }] });
    await expect(updateWeatherLocation("user-1", null)).resolves.toEqual({ weatherZipCode: null });
    const sql = String(mocks.query.mock.calls[0]?.[0]);
    expect(sql).toContain("SET weather_zip_code = $2");
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["user-1", null]);
  });
});
