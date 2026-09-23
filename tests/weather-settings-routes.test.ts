import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWeatherLocation: vi.fn(),
  mobileAccountSettings: vi.fn(),
  rateLimitByKey: vi.fn(),
  requireApiUser: vi.fn(),
  requireMobileAuth: vi.fn(),
  updateWeatherLocation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/mobile-auth", () => ({ requireMobileAuth: mocks.requireMobileAuth }));
vi.mock("@/lib/mobile-account", () => ({ mobileAccountSettings: mocks.mobileAccountSettings }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/weather-settings", () => ({
  getWeatherLocation: mocks.getWeatherLocation,
  updateWeatherLocation: mocks.updateWeatherLocation,
}));

import { GET, PATCH as webPatch } from "@/app/api/account/weather-location/route";
import { PATCH as mobilePatch } from "@/app/api/mobile/v1/account/weather-location/route";
import { GET as mobileSettingsGet } from "@/app/api/mobile/v1/account/settings/route";

function patchRequest(path: string, weatherZipCode: unknown) {
  return new Request(`https://example.test${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weatherZipCode }),
  });
}

describe("weather settings routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "web-user" });
    mocks.requireMobileAuth.mockResolvedValue({ user: { id: "mobile-user" } });
  });

  it("returns the private web account location without caching", async () => {
    mocks.getWeatherLocation.mockResolvedValue({ weatherZipCode: "02139" });
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getWeatherLocation).toHaveBeenCalledWith("web-user");
    await expect(response.json()).resolves.toEqual({ weatherZipCode: "02139" });
  });

  it("validates and updates the web ZIP", async () => {
    mocks.updateWeatherLocation.mockResolvedValue({ weatherZipCode: "90210" });
    const response = await webPatch(patchRequest("/api/account/weather-location", "90210"));
    expect(response.status).toBe(200);
    expect(mocks.updateWeatherLocation).toHaveBeenCalledWith("web-user", "90210");
  });

  it("rejects non-ASCII or non-five-digit ZIP values", async () => {
    const response = await webPatch(patchRequest("/api/account/weather-location", "１２３４５"));
    expect(response.status).toBe(400);
    expect(mocks.updateWeatherLocation).not.toHaveBeenCalled();
  });

  it("authenticates and rate limits mobile updates", async () => {
    mocks.updateWeatherLocation.mockResolvedValue({ weatherZipCode: null });
    const request = patchRequest("/api/mobile/v1/account/weather-location", null);
    const response = await mobilePatch(request);
    expect(response.status).toBe(200);
    expect(mocks.requireMobileAuth).toHaveBeenCalledWith(request);
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("mobile-account-weather-location", "mobile-user", 30, 60);
    expect(mocks.updateWeatherLocation).toHaveBeenCalledWith("mobile-user", null);
  });

  it("includes the ZIP in the existing mobile settings GET", async () => {
    mocks.mobileAccountSettings.mockResolvedValue({
      email: "listener@example.com",
      showExplicitContent: false,
      explicitAgeAttestedAt: null,
      weatherZipCode: "02139",
    });
    const request = new Request("https://example.test/api/mobile/v1/account/settings");
    const response = await mobileSettingsGet(request);
    await expect(response.json()).resolves.toMatchObject({ account: { weatherZipCode: "02139" } });
    expect(mocks.mobileAccountSettings).toHaveBeenCalledWith("mobile-user");
  });
});
