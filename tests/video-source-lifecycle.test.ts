import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  removePrefix: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/storage", () => ({ removePrefix: mocks.removePrefix }));

import { releaseInactiveVideoSource } from "@/lib/video-source-lifecycle";

describe("inactive source lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }));
  });

  it("removes only original source objects and releases retained-byte quota", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "video", station_id: "station" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(releaseInactiveVideoSource("video")).resolves.toBe(true);
    expect(mocks.removePrefix).toHaveBeenNthCalledWith(1, "stations/station/sources/video/");
    expect(mocks.removePrefix).toHaveBeenNthCalledWith(2, "stations/station/chunked-sources/video/");
    expect(String(mocks.query.mock.calls[0][0])).toMatch(/legal_hold_at IS NULL/);
    expect(String(mocks.query.mock.calls[1][0])).toMatch(/SET size_bytes = 0/);
  });

  it("keeps source data when the row is active or legally held", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(releaseInactiveVideoSource("video")).resolves.toBe(false);
    expect(mocks.removePrefix).not.toHaveBeenCalled();
  });
});
