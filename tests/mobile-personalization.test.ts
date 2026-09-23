import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicStation } from "@/lib/public-access";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: mocks.query }));

import {
  assertCanRecordTune,
  clearTuneHistory,
  mobileTuneSchema,
  recentTuneStationIds,
  recordTune,
} from "@/lib/tune-history";

const tuneId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const stationId = "00000000-0000-4000-8000-000000000003";
const tunedAt = new Date("2026-08-18T12:00:00.000Z");

describe("mobile tune history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only a client UUID and exact public station token", () => {
    const stationToken = "A".repeat(43);
    expect(mobileTuneSchema.parse({ id: tuneId, stationToken })).toEqual({ id: tuneId, stationToken });
    expect(() => mobileTuneSchema.parse({ id: "not-a-uuid", stationToken })).toThrow();
    expect(() => mobileTuneSchema.parse({ id: tuneId, stationToken: "short" })).toThrow();
    expect(() => mobileTuneSchema.parse({ id: tuneId, stationToken, client: "WEB" })).toThrow();
    expect(() => mobileTuneSchema.parse({ id: tuneId, stationToken, tunedAt: tunedAt.toISOString() })).toThrow();
  });

  it("records a server-timestamped tune with the client id as idempotency key", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ id: tuneId, station_id: stationId, client: "MOBILE", tuned_at: tunedAt }],
      rowCount: 1,
    });

    await expect(recordTune(tuneId, userId, stationId, "MOBILE")).resolves.toEqual({
      id: tuneId,
      stationId,
      client: "MOBILE",
      tunedAt: tunedAt.toISOString(),
      created: true,
    });
    expect(String(mocks.query.mock.calls[0][0])).toContain("ON CONFLICT (id) DO NOTHING");
    expect(String(mocks.query.mock.calls[0][0])).not.toContain("tuned_at)");
    expect(mocks.query.mock.calls[0][1]).toEqual([tuneId, userId, stationId, "MOBILE"]);
  });

  it("returns the original event for an exact retry without moving tuned_at", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: tuneId, station_id: stationId, client: "MOBILE", tuned_at: tunedAt }],
        rowCount: 1,
      });

    await expect(recordTune(tuneId, userId, stationId, "MOBILE")).resolves.toMatchObject({
      tunedAt: tunedAt.toISOString(),
      created: false,
    });
    expect(String(mocks.query.mock.calls[1][0])).toContain("user_id = $2 AND station_id = $3 AND client = $4");
  });

  it("rejects reuse of an id for a different tune", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(recordTune(tuneId, userId, stationId, "MOBILE")).rejects.toMatchObject({
      status: 409,
      code: "TUNE_ID_CONFLICT",
    });
  });

  it("deduplicates recent stations inside the retention window and clears only one user", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ station_id: "new" }, { station_id: "old" }], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await expect(recentTuneStationIds(userId, 500)).resolves.toEqual(["new", "old"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("GROUP BY station_id");
    expect(String(mocks.query.mock.calls[0][0])).toContain("ORDER BY max(tuned_at) DESC");
    expect(mocks.query.mock.calls[0][1]).toEqual([userId, 50, 90]);
    await expect(clearTuneHistory(userId)).resolves.toBe(2);
    expect(mocks.query.mock.calls[1]).toEqual(["DELETE FROM station_tunes WHERE user_id = $1", [userId]]);
  });

  it("allows only public, passwordless, non-owner stations", () => {
    const station = {
      id: stationId,
      owner_id: "owner",
      visibility: "PUBLIC",
      access_password_hash: null,
    } as PublicStation;

    expect(() => assertCanRecordTune(station, userId)).not.toThrow();
    expect(() => assertCanRecordTune({ ...station, visibility: "PRIVATE" }, userId)).toThrowError("Station not found.");
    expect(() => assertCanRecordTune({ ...station, access_password_hash: "hash" }, userId)).toThrowError("Station not found.");
    expect(() => assertCanRecordTune({ ...station, owner_id: userId }, userId)).toThrowError(
      "Station owners cannot record tune history for their own station.",
    );
  });
});
