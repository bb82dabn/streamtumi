import { describe, expect, it } from "vitest";
import {
  compileWeeklyClock,
  localServiceWeekMonday,
  MAX_WEEKLY_CLOCK_ROWS,
  type WeeklyClockBlock,
} from "@/lib/weekly-clock";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function totalPlayback(rows: ReturnType<typeof compileWeeklyClock>): number {
  return rows.reduce((total, row) => total + row.playbackDurationMs, 0);
}

describe("weekly clock compiler", () => {
  it("sequences rotations in UTC and clips carry-in, block, and week boundaries", () => {
    const rows = compileWeeklyClock({
      timeZone: "UTC",
      serviceWeek: "2026-08-17",
      blocks: [
        { id: "late", startMinute: 180, items: [{ id: "feature", durationMs: 3 * DAY }] },
        {
          id: "morning",
          startMinute: 60,
          items: [
            { id: "first", durationMs: 50 * MINUTE },
            { id: "second", durationMs: 50 * MINUTE },
          ],
        },
      ],
    });

    expect(rows.slice(0, 4).map((row) => ({
      blockId: row.blockId,
      itemId: row.itemId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      sourceOffsetMs: row.sourceOffsetMs,
      playbackDurationMs: row.playbackDurationMs,
    }))).toEqual([
      {
        blockId: "late",
        itemId: "feature",
        startsAt: "2026-08-17T00:00:00.000Z",
        endsAt: "2026-08-17T01:00:00.000Z",
        sourceOffsetMs: 21 * HOUR,
        playbackDurationMs: HOUR,
      },
      {
        blockId: "morning",
        itemId: "first",
        startsAt: "2026-08-17T01:00:00.000Z",
        endsAt: "2026-08-17T01:50:00.000Z",
        sourceOffsetMs: 0,
        playbackDurationMs: 50 * MINUTE,
      },
      {
        blockId: "morning",
        itemId: "second",
        startsAt: "2026-08-17T01:50:00.000Z",
        endsAt: "2026-08-17T02:40:00.000Z",
        sourceOffsetMs: 0,
        playbackDurationMs: 50 * MINUTE,
      },
      {
        blockId: "morning",
        itemId: "first",
        startsAt: "2026-08-17T02:40:00.000Z",
        endsAt: "2026-08-17T03:00:00.000Z",
        sourceOffsetMs: 0,
        playbackDurationMs: 20 * MINUTE,
      },
    ]);
    expect(rows.at(-1)).toMatchObject({
      blockId: "late",
      itemId: "feature",
      endsAt: new Date("2026-08-24T00:00:00.000Z"),
      playbackDurationMs: 21 * HOUR,
    });
    expect(totalPlayback(rows)).toBe(7 * DAY);
    for (let index = 1; index < rows.length; index += 1) expect(rows[index].startsAt).toEqual(rows[index - 1].endsAt);
  });

  it("does not mutate or depend on block input order", () => {
    const sorted: readonly WeeklyClockBlock[] = [
      { id: "monday", startMinute: 0, items: [{ id: "a", durationMs: 2 * DAY }] },
      { id: "friday", startMinute: 4 * 24 * 60, items: [{ id: "b", durationMs: 2 * DAY }] },
    ];
    const unsorted = [sorted[1], sorted[0]] as const;
    const before = unsorted.map((block) => block.id);
    const summarize = (blocks: readonly WeeklyClockBlock[]) => compileWeeklyClock({
      timeZone: "UTC",
      serviceWeek: "2026-08-17",
      blocks,
    }).map((row) => [row.blockId, row.itemId, row.startsAt.toISOString(), row.endsAt.toISOString()]);

    expect(summarize(unsorted)).toEqual(summarize(sorted));
    expect(unsorted.map((block) => block.id)).toEqual(before);
  });

  it("compiles the 167-hour New York spring week and skips a nonexistent 02:30 start", () => {
    const rows = compileWeeklyClock({
      timeZone: "America/New_York",
      serviceWeek: "2026-03-02",
      blocks: [
        { id: "base", startMinute: 0, items: [{ id: "base-item", durationMs: 14 * DAY }] },
        { id: "spring-gap", startMinute: 6 * 24 * 60 + 150, items: [{ id: "gap-item", durationMs: DAY }] },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      blockId: "base",
      startsAt: new Date("2026-03-02T05:00:00.000Z"),
      endsAt: new Date("2026-03-09T04:00:00.000Z"),
      playbackDurationMs: 167 * HOUR,
    });
    expect(rows.some((row) => row.blockId === "spring-gap")).toBe(false);
  });

  it("compiles the 169-hour New York fall week using the earlier 01:30 instant", () => {
    const rows = compileWeeklyClock({
      timeZone: "America/New_York",
      serviceWeek: "2026-10-26",
      blocks: [
        { id: "base", startMinute: 0, items: [{ id: "base-item", durationMs: 14 * DAY }] },
        { id: "fall-overlap", startMinute: 6 * 24 * 60 + 90, items: [{ id: "half-hour", durationMs: 30 * MINUTE }] },
      ],
    });
    const overlapIndex = rows.findIndex((row) => row.blockId === "fall-overlap");

    expect(totalPlayback(rows)).toBe(169 * HOUR);
    expect(rows[overlapIndex]).toMatchObject({
      startsAt: new Date("2026-11-01T05:30:00.000Z"),
      endsAt: new Date("2026-11-01T06:00:00.000Z"),
      sourceOffsetMs: 0,
    });
    expect(rows[overlapIndex + 1]).toMatchObject({
      startsAt: new Date("2026-11-01T06:00:00.000Z"),
      endsAt: new Date("2026-11-01T06:30:00.000Z"),
    });
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index].startsAt.getTime()).toBe(rows[index - 1].endsAt.getTime());
      expect(rows[index].endsAt.getTime()).toBeGreaterThan(rows[index].startsAt.getTime());
    }
  });

  it("carries the prior block rotation into Monday without resetting its source offset", () => {
    const rows = compileWeeklyClock({
      timeZone: "UTC",
      serviceWeek: "2026-08-17",
      blocks: [{
        id: "wednesday",
        startMinute: 2 * 24 * 60,
        items: [
          { id: "long", durationMs: 11 * HOUR },
          { id: "short", durationMs: 7 * HOUR },
        ],
      }],
    });

    expect(rows[0]).toMatchObject({
      blockId: "wednesday",
      itemId: "short",
      startsAt: new Date("2026-08-17T00:00:00.000Z"),
      endsAt: new Date("2026-08-17T06:00:00.000Z"),
      sourceOffsetMs: HOUR,
      playbackDurationMs: 6 * HOUR,
    });
    expect(rows.find((row) => row.startsAt.toISOString() === "2026-08-19T00:00:00.000Z")).toMatchObject({
      itemId: "long",
      sourceOffsetMs: 0,
    });
  });

  it("returns the local ISO service-week Monday for an instant", () => {
    expect(localServiceWeekMonday(new Date("2026-03-09T03:30:00.000Z"), "America/New_York")).toBe("2026-03-02");
    expect(localServiceWeekMonday(new Date("2026-03-09T04:30:00.000Z"), "America/New_York")).toBe("2026-03-09");
  });

  it("rejects invalid clocks", () => {
    const valid = {
      timeZone: "UTC",
      serviceWeek: "2026-08-17",
      blocks: [{ id: "block", startMinute: 0, items: [{ id: "item", durationMs: HOUR }] }],
    } as const;

    expect(() => compileWeeklyClock({ ...valid, timeZone: "Not/A_Zone" })).toThrow(/time zone/i);
    expect(() => compileWeeklyClock({ ...valid, serviceWeek: "2026-08-18" })).toThrow(/Monday/);
    expect(() => compileWeeklyClock({ ...valid, serviceWeek: "08-17-2026" })).toThrow(/YYYY-MM-DD/);
    expect(() => compileWeeklyClock({ ...valid, blocks: [] })).toThrow(/at least one block/);
    expect(() => compileWeeklyClock({ ...valid, blocks: [{ id: "empty", startMinute: 0, items: [] }] })).toThrow(/at least one item/);
    expect(() => compileWeeklyClock({ ...valid, blocks: [{ id: "bad", startMinute: 10_080, items: valid.blocks[0].items }] })).toThrow(/startMinute/);
    expect(() => compileWeeklyClock({ ...valid, blocks: [{ id: "bad", startMinute: 0, items: [{ id: "item", durationMs: 0 }] }] })).toThrow(/positive/);
    expect(() => compileWeeklyClock({ ...valid, blocks: [{ id: "bad", startMinute: 0, items: [{ id: "item", durationMs: Number.POSITIVE_INFINITY }] }] })).toThrow(/positive/);
  });

  it("enforces configured and hard output row caps", () => {
    const input = {
      timeZone: "UTC",
      serviceWeek: "2026-08-17",
      blocks: [{ id: "dense", startMinute: 0, items: [{ id: "millisecond", durationMs: 1 }] }],
    } as const;

    expect(() => compileWeeklyClock(input, { maxRows: 10 })).toThrow(/10 row limit/);
    expect(() => compileWeeklyClock(input, { maxRows: MAX_WEEKLY_CLOCK_ROWS + 1 })).toThrow(/maxRows/);
  });

  it("rejects a default clock dense enough to overload persisted timelines", () => {
    expect(() => compileWeeklyClock({
      timeZone: "UTC",
      serviceWeek: "2026-08-17",
      blocks: [{ id: "dense", startMinute: 0, items: [{ id: "short", durationMs: 12_000 }] }],
    })).toThrow(/20000 row limit/);
  });
});
