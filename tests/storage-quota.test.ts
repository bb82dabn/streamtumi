import { describe, expect, it, vi } from "vitest";

import {
  assertStationStorageAvailable,
  stationRetainedSourceBytes,
  STATION_STORAGE_LIMIT_BYTES,
} from "@/lib/storage-quota";

describe("station storage quota", () => {
  it("uses a fixed ten GiB ceiling", () => {
    expect(STATION_STORAGE_LIMIT_BYTES).toBe(10 * 1024 * 1024 * 1024);
  });

  it("reads only the requested station usage", async () => {
    const query = vi.fn(async (...args: [string, unknown[]?]) => {
      void args;
      return { rows: [{ bytes: "42" }], rowCount: 1 };
    });
    await expect(stationRetainedSourceBytes({ query } as never, "station-1")).resolves.toBe(42n);
    expect(query.mock.calls[0][0]).toContain("station_media_storage_usage_v WHERE station_id = $1");
    expect(query.mock.calls[0][1]).toEqual(["station-1"]);
  });

  it("allows the exact boundary and rejects one byte over it", async () => {
    const exact = vi.fn(async () => ({ rows: [{ bytes: String(STATION_STORAGE_LIMIT_BYTES - 100) }], rowCount: 1 }));
    await expect(assertStationStorageAvailable({ query: exact } as never, "station-1", 100n)).resolves.toBeUndefined();

    const over = vi.fn(async () => ({ rows: [{ bytes: String(STATION_STORAGE_LIMIT_BYTES - 100) }], rowCount: 1 }));
    await expect(assertStationStorageAvailable({ query: over } as never, "station-1", 101n))
      .rejects.toMatchObject({ status: 413, code: "STATION_STORAGE_LIMIT" });
  });
});
