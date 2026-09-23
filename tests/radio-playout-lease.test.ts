import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));

import { acquireRadioLease, renewRadioLease, touchRadioManifest } from "@/lib/radio-playout-lease";

describe("Radio playout leases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acquires a monotonically fenced lease through one atomic statement", async () => {
    mocks.query.mockResolvedValue({ rows: [{ station_id: "station", holder_id: "holder", fence: "7", lease_until: new Date("2026-08-17T12:00:20Z") }] });
    await expect(acquireRadioLease("station", "holder", 20)).resolves.toEqual({ stationId: "station", holderId: "holder", fence: 7, leaseUntil: new Date("2026-08-17T12:00:20Z") });
    expect(mocks.query.mock.calls[0][0]).toContain("fence = CASE WHEN");
    expect(mocks.query.mock.calls[0][0]).toContain("lease_until <= clock_timestamp()");
  });

  it("returns null when another unexpired holder owns the station", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(acquireRadioLease("station", "holder", 20)).resolves.toBeNull();
  });

  it("renews only the matching unexpired holder and fence", async () => {
    const lease = { stationId: "station", holderId: "holder", fence: 3, leaseUntil: new Date() };
    mocks.query.mockResolvedValueOnce({ rows: [{ lease_until: new Date("2026-08-17T12:00:20Z") }] }).mockResolvedValueOnce({ rows: [] });
    await expect(renewRadioLease(lease, 20)).resolves.toMatchObject({ fence: 3, leaseUntil: new Date("2026-08-17T12:00:20Z") });
    await expect(renewRadioLease(lease, 20)).resolves.toBeNull();
    expect(mocks.query.mock.calls[0][0]).toContain("holder_id = $2 AND fence = $3");
  });

  it("records media progress only through the active fenced lease", async () => {
    const lease = { stationId: "station", holderId: "holder", fence: 3, leaseUntil: new Date() };
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(touchRadioManifest(lease, "audio")).resolves.toBe(true);
    expect(mocks.query.mock.calls[0][0]).toContain("audio_manifest_at = CASE");
    expect(mocks.query.mock.calls[0][1]).toEqual(["station", "holder", 3, "audio"]);
  });
});
