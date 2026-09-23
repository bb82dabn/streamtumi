import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

import {
  acquireTvPlayoutLease,
  releaseTvPlayoutLease,
  renewTvPlayoutLease,
} from "@/lib/tv-playout-lease";

describe("TV playout lease", () => {
  beforeEach(() => vi.clearAllMocks());

  it("atomically increments the fence when an expired lease is taken over", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ station_id: "station", holder_id: "holder-a", fence: "4", lease_until: new Date("2026-08-19T12:00:20Z") }] })
      .mockResolvedValueOnce({ rows: [{ station_id: "station", holder_id: "holder-b", fence: "5", lease_until: new Date("2026-08-19T12:00:41Z") }] });

    await expect(acquireTvPlayoutLease("station", "holder-a", 20)).resolves.toMatchObject({ holderId: "holder-a", fence: 4 });
    await expect(acquireTvPlayoutLease("station", "holder-b", 20)).resolves.toMatchObject({ holderId: "holder-b", fence: 5 });

    const statement = mocks.query.mock.calls[0][0] as string;
    expect(statement).toContain("tv_playout_leases.fence + 1");
    expect(statement).toContain("tv_playout_leases.lease_until <= clock_timestamp()");
    expect(statement).toContain("tv_playout_leases.holder_id = EXCLUDED.holder_id");
    expect(statement).toContain("station.tv_delivery_mode = 'CHANNEL_HLS'");
  });

  it("cannot renew a stale holder or fence", async () => {
    const lease = { stationId: "station", holderId: "holder-a", fence: 4, leaseUntil: new Date() };
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(renewTvPlayoutLease(lease, 20)).resolves.toBeNull();
    expect(mocks.query.mock.calls[0][0]).toContain("holder_id = $2");
    expect(mocks.query.mock.calls[0][0]).toContain("fence = $3");
    expect(mocks.query.mock.calls[0][0]).toContain("lease_until > clock_timestamp()");
  });

  it("releases only the matching holder and fence", async () => {
    const lease = { stationId: "station", holderId: "holder-a", fence: 4, leaseUntil: new Date() };
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(releaseTvPlayoutLease(lease)).resolves.toBe(true);
    expect(mocks.query.mock.calls[0][1]).toEqual(["station", "holder-a", 4]);
  });
});
