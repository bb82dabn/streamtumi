import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return {
    client,
    publishEditableSchedule: vi.fn(),
    transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)),
  };
});

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/schedule-publication", () => ({ publishEditableSchedule: mocks.publishEditableSchedule }));

import { parseTvChannelActivationArguments, setTvChannelActivation } from "@/lib/tv-channel-activation";

const stationId = "00000000-0000-4000-8000-000000000001";

function station(overrides: Record<string, unknown> = {}) {
  return {
    name: "TEST3",
      visibility: "PRIVATE",
      tv_delivery_mode: "CHANNEL_HLS",
      tv_channel_rendition_mode: "DUAL",
      has_ready_playlist: true,
    ...overrides,
  };
}

describe("TV channel activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (value: typeof mocks.client) => Promise<unknown>) => work(mocks.client));
    mocks.publishEditableSchedule.mockResolvedValue({ scheduleId: "schedule-1" });
  });

  it("parses only explicit DUAL and HD_ONLY policy flags", () => {
    expect(parseTvChannelActivationArguments([stationId])).toEqual({ stationId, disable: false });
    expect(parseTvChannelActivationArguments(["--rendition-mode", "HD_ONLY", stationId])).toEqual({
      stationId,
      disable: false,
      renditionMode: "HD_ONLY",
    });
    expect(() => parseTvChannelActivationArguments([stationId, "--rendition-mode", "AUTO"])).toThrow(/Usage/);
    expect(() => parseTvChannelActivationArguments([stationId, "--disable", "--rendition-mode", "DUAL"])).toThrow(/Usage/);
  });

  it("leaves an enabled station DUAL when no mode was explicitly requested", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [station()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(setTvChannelActivation({ stationId, disable: false })).resolves.toMatchObject({
      renditionMode: "DUAL",
      modeChanged: false,
    });

    expect(mocks.client.query).toHaveBeenCalledTimes(2);
    expect(mocks.client.query.mock.calls[1][1]).toEqual([stationId, "DUAL"]);
    expect(mocks.client.query.mock.calls.some(([sql]) => String(sql).includes("fence = fence + 1"))).toBe(false);
  });

  it("changes an enabled mode only explicitly and fences its stable playout generation", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [station()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(setTvChannelActivation({ stationId, disable: false, renditionMode: "HD_ONLY" })).resolves.toEqual({
      name: "TEST3",
      disabled: false,
      renditionMode: "HD_ONLY",
      modeChanged: true,
      scheduleId: "schedule-1",
    });

    expect(mocks.client.query.mock.calls[1][1]).toEqual([stationId, "HD_ONLY"]);
    expect(mocks.client.query.mock.calls[2][0]).toContain("fence = fence + 1");
    expect(mocks.publishEditableSchedule).toHaveBeenCalledWith(mocks.client, stationId, "immediate");
  });

  it("activates an empty stopped station without manufacturing a schedule", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [station({ tv_delivery_mode: "LEGACY_VOD", has_ready_playlist: false })], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(setTvChannelActivation({ stationId, disable: false })).resolves.toEqual({
      name: "TEST3",
      disabled: false,
      renditionMode: "DUAL",
      modeChanged: false,
    });
    expect(mocks.publishEditableSchedule).not.toHaveBeenCalled();
    expect(mocks.client.query.mock.calls[0][0]).toContain("EXISTS");
  });
});
