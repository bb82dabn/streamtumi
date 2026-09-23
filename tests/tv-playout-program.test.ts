import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

import { claimTvPlayoutState, loadTvAutomationSnapshot } from "@/lib/tv-playout-program";

const lease = { stationId: "station", holderId: "holder", fence: 8, leaseUntil: new Date() };

describe("TV automation playout state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims the state as automation", async () => {
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [{ station_id: "station" }] });
    await expect(claimTvPlayoutState(lease)).resolves.toBe(true);
    expect(mocks.query.mock.calls[0][0]).toContain("observed_source = 'AUTOMATION'");
  });

  it("loads only the active local schedule", async () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    mocks.query.mockResolvedValue({ rows: [{ station_id: "station", fallback_schedule_id: "schedule", database_now: now }] });
    await expect(loadTvAutomationSnapshot(lease)).resolves.toEqual({ stationId: "station", fallbackScheduleId: "schedule", databaseNow: now });
  });
});
