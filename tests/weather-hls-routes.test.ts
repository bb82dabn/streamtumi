import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  resolveStation: vi.fn(),
  waitForFeed: vi.fn(),
}));

vi.mock("@/lib/public-access", () => ({ resolvePublicStation: mocks.resolveStation }));
vi.mock("@/lib/weather-playback", () => ({
  assertWeatherStationRunning: (station: { broadcast_state: string }) => {
    if (station.broadcast_state !== "RUNNING") {
      throw Object.assign(new Error("StreamTumi Weather is currently off air."), {
        status: 409,
        code: "WEATHER_STATION_OFFLINE",
      });
    }
  },
  requireWeatherPlaybackSession: mocks.requireSession,
  waitForWeatherFeed: mocks.waitForFeed,
  weatherFeedObjectKey: (feedKey: string, filename: string) => `weather/feeds/${feedKey}/${filename}`,
}));
vi.mock("@/lib/storage", () => ({ bucket: "test", storage: { getObject: vi.fn() } }));

import { GET } from "@/app/api/public/stations/[token]/weather/[session]/index.m3u8/route";

const context = { params: Promise.resolve({ token: "station-token", session: "weather-session" }) };

describe("Weather HLS startup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveStation.mockResolvedValue({
      id: "station-id",
      playback_type: "WEATHERSTAR_4000",
      broadcast_state: "RUNNING",
    });
    mocks.requireSession.mockResolvedValue({ feed_key: "feed-key" });
    mocks.waitForFeed.mockResolvedValue(false);
  });

  it("returns a short retryable response while a cold renderer starts", async () => {
    const response = await GET(new Request("https://streamtumi.test/weather"), context);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(await response.json()).toMatchObject({ code: "WEATHER_STREAM_STARTING" });
    expect(mocks.waitForFeed).toHaveBeenCalledWith("feed-key", 8_000);
  });
});
