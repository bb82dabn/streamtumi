import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));

import {
  appendTvJournalSegments,
  loadTvJournalWindow,
  planTvJournalCatchUp,
  planTvJournalSegments,
  type TvAutomationSchedulePlan,
  type TvPlannedJournalSegment,
} from "@/lib/tv-segment-journal";

function schedule(): TvAutomationSchedulePlan {
  return {
    stationId: "station",
    scheduleId: "schedule",
    startedAt: new Date(0),
    databaseNow: new Date(0),
    totalDurationMs: 4000,
    transitionMs: 0,
    playbackOrder: "SEQUENTIAL",
    shuffleSeed: "9",
    items: [{
      id: "item",
      position: 0,
      durationMs: 4000,
      derivativeId: "derivative",
      transitionFillerId: null,
      content: {
        id: "descriptor",
        durationMs: 4000,
        segments: [
          { segmentIndex: 0, startOffsetMs: 0, durationMs: 2000 },
          { segmentIndex: 1, startOffsetMs: 2000, durationMs: 2000 },
        ],
      },
      transition: null,
    }],
  };
}

function segment(): TvPlannedJournalSegment {
  return {
    scheduleId: "schedule",
    scheduleItemId: "item",
    derivativeId: "derivative",
    transitionFillerId: null,
    part: "CONTENT",
    descriptorId: "descriptor",
    descriptorSegmentIndex: 0,
    startsAt: new Date("2026-08-19T12:00:00.000Z"),
    endsAt: new Date("2026-08-19T12:00:02.000Z"),
    durationMs: 2000,
    discontinuity: true,
  };
}

describe("TV automation segment journal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("plans exact local automation segments and bounded catch-up", () => {
    expect(planTvJournalSegments(schedule(), {
      from: new Date(0), through: new Date(4000), maxSegments: 4,
    }).map((item) => [item.descriptorSegmentIndex, item.startsAt.getTime(), item.endsAt.getTime()])).toEqual([
      [0, 0, 2000], [1, 2000, 4000],
    ]);
    const caughtUp = planTvJournalCatchUp(schedule(), {
      now: new Date(100_000), tailEndsAt: new Date(1000), maxCatchUpMs: 4000, aheadMs: 4000, maxSegments: 3,
    });
    expect(caughtUp[0].startsAt.getTime()).toBeGreaterThanOrEqual(96_000);
    expect(caughtUp[0].discontinuity).toBe(true);
  });

  it("loads only dual-rendition automation rows", async () => {
    mocks.query.mockResolvedValue({ rows: [{
      media_sequence: "9", discontinuity_sequence: "2", discontinuity: false,
      starts_at: new Date(0), ends_at: new Date(2000), duration_ms: 2000,
      automation_schedule_id: "schedule", source_kind: "AUTOMATION", playout_fence: "8",
      calendar_release_id: null, occurrence_id: null, calendar_source_role: null, automation_epoch_at: null,
      high_object_key: "automation/high.ts", low_object_key: "automation/low.ts",
    }] });
    await expect(loadTvJournalWindow("station")).resolves.toMatchObject([{
      sourceKind: "AUTOMATION", renditionMode: "DUAL", uris: { "720p": "automation/high.ts", "360p": "automation/low.ts" },
    }]);
  });

  it("rejects a stale lease before reading or writing the journal", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ active_schedule_id: "schedule" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) };
    mocks.transaction.mockImplementation((work) => work(client));
    const lease = { stationId: "station", holderId: "holder", fence: 8, leaseUntil: new Date() };
    await expect(appendTvJournalSegments(lease, [segment()])).rejects.toThrow(/stale lease/);
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
