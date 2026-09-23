import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  publishStationEvent: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/chat-events", () => ({ publishStationEvent: mocks.publishStationEvent }));

import { publishClockRelease } from "@/lib/clock-publication";

const ids = {
  station: "00000000-0000-4000-8000-000000000001",
  owner: "00000000-0000-4000-8000-000000000002",
  rotation: "00000000-0000-4000-8000-000000000003",
  draftBlock: "00000000-0000-4000-8000-000000000004",
  track: "00000000-0000-4000-8000-000000000005",
  release: "00000000-0000-4000-8000-000000000006",
  releaseBlock: "00000000-0000-4000-8000-000000000007",
  releaseItem: "00000000-0000-4000-8000-000000000008",
};

let deliveryMode: "PLAYOUT" | "STATIC_HLS";

describe("clock publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliveryMode = "PLAYOUT";
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<unknown>) => work({ query: mocks.query } as unknown as PoolClient));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("active_source_draft_version")) return { rows: [{ id: ids.station, owner_id: ids.owner, programming_mode: "CLOCK", station_kind: "RADIO", time_zone: "UTC", clock_draft_version: 4, active_clock_release_id: null, active_source_draft_version: null, radio_delivery_mode: deliveryMode }], rowCount: 1 };
      if (sql.includes("FROM clock_draft_blocks")) return { rows: [{ id: ids.draftBlock, start_minute: 0, source_kind: "RADIO_ROTATION", radio_rotation_id: ids.rotation, source_name: "Default" }], rowCount: 1 };
      if (sql.includes("FROM radio_rotation_items")) return { rows: [{ rotation_id: ids.rotation, track_id: ids.track, position: 0, title: "Long track", artist: "Artist", album: "", status: "READY", duration_ms: "1209600000", mezzanine_key: "radio/mezzanine.flac", artwork_key: null, audio_hls_key: "radio/audio/index.m3u8" }], rowCount: 1 };
      if (sql.includes("max(release_number)")) return { rows: [{ release_number: 1 }], rowCount: 1 };
      if (sql.includes("INSERT INTO clock_releases")) return { rows: [{ id: ids.release }], rowCount: 1 };
      if (sql.includes("INSERT INTO clock_release_blocks")) return { rows: [{ id: ids.releaseBlock }], rowCount: 1 };
      if (sql.includes("INSERT INTO clock_release_items")) return { rows: [{ id: ids.releaseItem }], rowCount: 1 };
      if (sql.includes("LEFT JOIN radio_release_item_delivery")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT count(*)::text AS count FROM clock_timeline_items")) return { rows: [{ count: "1" }], rowCount: 1 };
      if (sql.includes("SELECT count(*)::text AS count FROM radio_timeline_delivery")) return { rows: [{ count: "0" }], rowCount: 1 };
      if (sql.includes("sequence_base")) return { rows: [{ sequence_base: "0" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
  });

  it("snapshots media, compiles two service weeks, and activates atomically", async () => {
    const result = await publishClockRelease(ids.station, ids.owner, 4, new Date("2026-08-17T12:00:00.000Z"));
    expect(result).toEqual({ releaseId: ids.release, releaseNumber: 1, sourceDraftVersion: 4, timeZone: "UTC", compiledWeeks: ["2026-08-17", "2026-08-24"] });
    expect(mocks.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO clock_timeline_items"))).toHaveLength(2);
    expect(mocks.query.mock.calls.some(([sql, values]) => String(sql).includes("INSERT INTO clock_release_items") && values.includes("radio/mezzanine.flac"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql, values]) => String(sql).includes("previous_clock_release_id = active_clock_release_id") && values[0] === ids.release)).toBe(true);
    expect(mocks.publishStationEvent).toHaveBeenCalledWith(ids.station, { type: "station.updated", data: { schedule: true } });
  });

  it("rejects stale draft publication before creating a release", async () => {
    await expect(publishClockRelease(ids.station, ids.owner, 3, new Date("2026-08-17T12:00:00.000Z"))).rejects.toMatchObject({ status: 409, code: "PROGRAMMING_CONFLICT" });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO clock_releases"))).toBe(false);
  });

  it("snapshots static HLS and assigns timeline delivery before activation", async () => {
    deliveryMode = "STATIC_HLS";
    await publishClockRelease(ids.station, ids.owner, 4, new Date("2026-08-17T12:00:00.000Z"));
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO radio_release_item_delivery"))).toBe(true);
    expect(mocks.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO radio_timeline_delivery"))).toHaveLength(2);
    const activation = mocks.query.mock.calls.findIndex(([sql]) => String(sql).includes("active_clock_release_id = $1"));
    let delivery = -1;
    mocks.query.mock.calls.forEach(([sql], index) => { if (String(sql).includes("INSERT INTO radio_timeline_delivery")) delivery = index; });
    expect(delivery).toBeLessThan(activation);
  });
});
