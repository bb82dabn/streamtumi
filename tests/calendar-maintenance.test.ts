import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  materializeCalendarReleaseThrough: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/calendar-radio-materialization", () => ({
  materializeCalendarReleaseThrough: mocks.materializeCalendarReleaseThrough,
}));

import { ensureCalendarReleaseMaterialized } from "@/lib/calendar-maintenance";

const ids = {
  release: "00000000-0000-4000-8000-000000000001",
  station: "00000000-0000-4000-8000-000000000002",
  profile: "00000000-0000-4000-8000-000000000003",
  releaseEvent: "00000000-0000-4000-8000-000000000004",
  sourceEvent: "00000000-0000-4000-8000-000000000005",
  cancel: "00000000-0000-4000-8000-000000000006",
  move: "00000000-0000-4000-8000-000000000007",
};

const now = new Date("2026-03-01T00:00:00.000Z");
const oldThrough = new Date("2026-03-07T00:00:00.000Z");
const targetThrough = new Date("2026-05-30T00:00:00.000Z");
const cancelKey = `${ids.sourceEvent}/2026-03-09T02:30:00.000000000[America/New_York]`;
const moveKey = `${ids.sourceEvent}/2026-03-10T02:30:00.000000000[America/New_York]`;

describe("Calendar release horizon maintenance", () => {
  let status: "READY" | "FAILED";
  let through: Date;
  let failNextInsert: boolean;
  let stationKind: "TV" | "RADIO";

  beforeEach(() => {
    vi.clearAllMocks();
    status = "READY";
    through = oldThrough;
    failNextInsert = false;
    stationKind = "RADIO";
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<unknown>) => work({ query: mocks.query } as unknown as PoolClient));
    mocks.materializeCalendarReleaseThrough.mockResolvedValue({ compiledItemCount: 4, insertedItemCount: 4 });
    mocks.query.mockImplementation(async (sqlValue: unknown, values?: unknown[]) => {
      const sql = String(sqlValue);
      if (sql.includes("FROM calendar_releases release")) return { rows: [{
        station_id: ids.station,
        station_kind: stationKind,
        profile_id: ids.profile,
        status,
        horizon_from: new Date("2026-02-28T00:00:00.000Z"),
        materialized_through: through,
        target_through: through,
        db_now: now,
      }], rowCount: 1 };
      if (sql.includes("FROM calendar_release_events")) return { rows: [{
        id: ids.releaseEvent,
        source_event_id: ids.sourceEvent,
        event_kind: "PROGRAM",
        local_start_date: "2026-03-07",
        local_start_time: "02:30:00",
        time_zone: "America/New_York",
        duration_ms: "3600000",
        recurrence_kind: "DAILY",
        recurrence_interval: 1,
        recurrence_count: null,
        recurrence_until_date: null,
        recurrence_weekdays: null,
        recurrence_month_days: null,
        dst_gap_policy: "SKIP",
        dst_fold_policy: "EARLIER",
      }], rowCount: 1 };
      if (sql.includes("FROM calendar_release_exceptions")) return { rows: [
        {
          id: ids.cancel,
          release_event_id: ids.releaseEvent,
          recurrence_key: cancelKey,
          exception_kind: "CANCEL",
          moved_local_start_date: null,
          moved_local_start_time: null,
          moved_time_zone: null,
        },
        {
          id: ids.move,
          release_event_id: ids.releaseEvent,
          recurrence_key: moveKey,
          exception_kind: "MOVE",
          moved_local_start_date: "2026-03-11",
          moved_local_start_time: "04:00:00",
          moved_time_zone: "America/New_York",
        },
      ], rowCount: 2 };
      if (sql.includes("INSERT INTO calendar_occurrences")) {
        if (failNextInsert) {
          failNextInsert = false;
          throw new Error("temporary occurrence insert failure");
        }
        return { rows: [], rowCount: Math.floor((values?.length ?? 0) / 13) };
      }
      if (sql.includes("count(*)::text AS occurrence_count")) return { rows: [{ occurrence_count: "80" }], rowCount: 1 };
      if (sql.includes("SET status = 'READY'")) {
        status = "READY";
        through = values?.[2] as Date;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SET status = 'FAILED'")) {
        status = "FAILED";
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
  });

  it("extends recurrence idempotently across DST and immutable exceptions, including Radio rows", async () => {
    await expect(ensureCalendarReleaseMaterialized(ids.release, now)).resolves.toMatchObject({
      releaseId: ids.release,
      materializedThrough: targetThrough,
      occurrenceCount: 80,
      idempotent: false,
    });

    const occurrenceInsert = mocks.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO calendar_occurrences"));
    expect(String(occurrenceInsert?.[0])).toContain("ON CONFLICT (release_event_id, recurrence_key) DO NOTHING");
    const values = occurrenceInsert?.[1] as unknown[];
    const tuples = Array.from({ length: values.length / 13 }, (_, index) => values.slice(index * 13, index * 13 + 13));
    const recurrenceKeys = tuples.map((tuple) => tuple[7]);
    expect(recurrenceKeys.every((key) => String(key).startsWith(`${ids.sourceEvent}/`))).toBe(true);
    expect(recurrenceKeys).not.toContain(cancelKey);
    expect(recurrenceKeys).not.toContain(`${ids.sourceEvent}/2026-03-08T02:30:00.000000000[America/New_York]`);
    expect(tuples.find((tuple) => tuple[7] === moveKey)).toMatchObject({ 5: ids.move, 12: true });
    expect(mocks.materializeCalendarReleaseThrough).toHaveBeenCalledWith(expect.anything(), ids.release, oldThrough, targetThrough);

    mocks.query.mockClear();
    mocks.materializeCalendarReleaseThrough.mockClear();
    await expect(ensureCalendarReleaseMaterialized(ids.release, now)).resolves.toMatchObject({ idempotent: true, insertedOccurrenceCount: 0 });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO calendar_occurrences"))).toBe(false);
    expect(mocks.materializeCalendarReleaseThrough).not.toHaveBeenCalled();
  });

  it("records a failed extension and retries it successfully", async () => {
    stationKind = "TV";
    failNextInsert = true;

    await expect(ensureCalendarReleaseMaterialized(ids.release, now)).rejects.toThrow("temporary occurrence insert failure");
    expect(status).toBe("FAILED");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'FAILED'"))).toBe(true);

    await expect(ensureCalendarReleaseMaterialized(ids.release, now)).resolves.toMatchObject({
      materializedThrough: targetThrough,
      idempotent: false,
    });
    expect(status).toBe("READY");
  });
});
