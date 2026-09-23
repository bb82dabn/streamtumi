import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

import {
  acknowledgeRadioProgramSource,
  chooseRadioProgramSource,
  type RadioProgramSnapshot,
} from "@/lib/radio-playout-program";

const snapshot: RadioProgramSnapshot = {
  activeClockReleaseId: "release",
  clockReady: true,
  databaseNow: new Date("2026-08-18T12:00:00.000Z"),
};

describe("Radio automation source selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects only the published clock or silence", () => {
    expect(chooseRadioProgramSource(snapshot)).toMatchObject({ source: "CLOCK", releaseId: "release" });
    expect(chooseRadioProgramSource({ ...snapshot, activeClockReleaseId: null })).toMatchObject({ source: "SILENCE", releaseId: null });
  });

  it("acknowledges automation through the current playout lease and session", async () => {
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [] });
    const lease = { stationId: "station", holderId: "holder", fence: 8, leaseUntil: new Date() };
    const output = { id: "output", stationId: "station", fence: 8, objectPrefix: "prefix", audioManifestKey: "audio", waveformManifestKey: "wave" };

    await expect(acknowledgeRadioProgramSource(lease, output, "CLOCK", {
      calendarReleaseId: "00000000-0000-4000-8000-000000000001",
      occurrenceId: "00000000-0000-4000-8000-000000000002",
      sourceRole: "PRIMARY",
      calendarItemId: "00000000-0000-4000-8000-000000000003",
    })).resolves.toBe(true);
    expect(mocks.query.mock.calls[0][0]).toContain("program_source = $5");
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "station", "holder", 8, "output", "CLOCK",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "PRIMARY",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });
});
