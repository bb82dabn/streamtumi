import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { insertRadioTimelineDelivery, snapshotRadioReleaseDelivery } from "@/lib/radio-delivery-publication";

describe("Radio delivery publication", () => {
  it("snapshots track artifacts without mutating immutable release items", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(snapshotRadioReleaseDelivery({ query } as unknown as PoolClient, "release-1")).resolves.toBe(true);
    expect(String(query.mock.calls[0][0])).toContain("INSERT INTO radio_release_item_delivery");
    expect(String(query.mock.calls[0][0])).not.toContain("UPDATE clock_release_items");
  });

  it("assigns deterministic contiguous sequence ranges for a service week", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ count: "2" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ sequence_base: "40", discontinuity_base: "7" }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2, rows: [] });
    await expect(insertRadioTimelineDelivery({ query } as unknown as PoolClient, "release-1", "2026-08-17")).resolves.toBe(true);
    const insertion = String(query.mock.calls[5][0]);
    expect(insertion).toContain("sum(segment_count) OVER");
    expect(query.mock.calls[5][1]).toEqual(["release-1", "2026-08-17", "40", "7"]);
  });
});
