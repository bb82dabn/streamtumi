import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return {
    client,
    newAccessToken: vi.fn(() => ({ token: "token", hash: "hash", ciphertext: "ciphertext", hint: "hint" })),
    transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)),
  };
});

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/stations", () => ({ newAccessToken: mocks.newAccessToken }));

import { provisionWeatherChannel, weatherChannelOwnerEmail } from "@/lib/weather-channel-provisioning";

describe("weather channel provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (value: typeof mocks.client) => Promise<unknown>) => work(mocks.client));
  });

  it("requires an explicit argument or environment owner", () => {
    expect(weatherChannelOwnerEmail(["--owner-email", "OWNER@EXAMPLE.COM"], {})).toBe("owner@example.com");
    expect(weatherChannelOwnerEmail([], { WEATHER_CHANNEL_OWNER_EMAIL: "env@example.com" })).toBe("env@example.com");
    expect(() => weatherChannelOwnerEmail([], {})).toThrow(/Usage/);
    expect(() => weatherChannelOwnerEmail(["first@example.com", "second@example.com"], {})).toThrow(/Usage/);
  });

  it("creates the public running TV station with generated access credentials", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{ id: "owner-1", email: "owner@example.com" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "weather-genre" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "station-1", access_token_ciphertext: "ciphertext" }] });

    await expect(provisionWeatherChannel("owner@example.com")).resolves.toMatchObject({
      stationId: "station-1",
      ownerEmail: "owner@example.com",
      created: true,
    });
    expect(mocks.newAccessToken).toHaveBeenCalledOnce();
    const insert = mocks.client.query.mock.calls[4];
    expect(String(insert[0])).toContain("'TV', $4, 'PUBLIC', 'RUNNING', 'WEATHERSTAR_4000'");
    expect(insert[1]).toContain("weather-genre");
  });

  it("updates the existing TV station without rotating its token", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{ id: "owner-1", email: "owner@example.com" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "weather-genre" }] })
      .mockResolvedValueOnce({ rows: [{ id: "station-1", station_kind: "TV", access_token_ciphertext: "existing" }] })
      .mockResolvedValueOnce({ rows: [{ id: "station-1", access_token_ciphertext: "existing" }] });

    await expect(provisionWeatherChannel("owner@example.com")).resolves.toMatchObject({ created: false });
    expect(mocks.newAccessToken).not.toHaveBeenCalled();
    const update = mocks.client.query.mock.calls[4];
    expect(String(update[0])).toContain("playback_type = 'WEATHERSTAR_4000'");
    expect(String(update[0])).toContain("broadcast_state = 'RUNNING'");
  });
});
