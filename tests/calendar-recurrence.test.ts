import { describe, expect, it } from "vitest";
import {
  calendarRecurrenceKey,
  expandCalendarOccurrences,
  type CalendarEventDefinition,
} from "@/lib/calendar-recurrence";

const HOUR = 60 * 60 * 1000;

function definition(overrides: Partial<CalendarEventDefinition> = {}): CalendarEventDefinition {
  return Object.freeze({
    id: "event-1",
    eventKind: "PROGRAM",
    localStartDate: "2026-01-01",
    localStartTime: "12:00",
    timeZone: "UTC",
    durationMs: HOUR,
    recurrenceKind: "NONE",
    recurrenceInterval: 1,
    recurrenceCount: null,
    recurrenceUntilDate: null,
    recurrenceWeekdays: null,
    recurrenceMonthDays: null,
    dstGapPolicy: "SKIP",
    dstFoldPolicy: "EARLIER",
    exceptions: Object.freeze([]),
    ...overrides,
  });
}

function isoStarts(event: CalendarEventDefinition, from: string, to: string): string[] {
  return expandCalendarOccurrences(event, { from: new Date(from), to: new Date(to) })
    .map((occurrence) => occurrence.startsAt.toISOString());
}

describe("calendar recurrence expansion", () => {
  it("skips or shifts a local start in the spring DST gap", () => {
    const base = definition({
      localStartDate: "2026-03-08",
      localStartTime: "02:30",
      timeZone: "America/New_York",
    });
    const horizon = { from: new Date("2026-03-08T00:00:00Z"), to: new Date("2026-03-09T00:00:00Z") };

    expect(expandCalendarOccurrences(base, horizon)).toEqual([]);
    expect(expandCalendarOccurrences(definition({ ...base, dstGapPolicy: "SHIFT_FORWARD" }), horizon)[0])
      .toMatchObject({
        startsAt: new Date("2026-03-08T07:30:00.000Z"),
        endsAt: new Date("2026-03-08T08:30:00.000Z"),
      });
  });

  it("selects the earlier or later instant in the fall DST fold", () => {
    const base = definition({
      localStartDate: "2026-11-01",
      localStartTime: "01:30",
      timeZone: "America/New_York",
    });

    expect(isoStarts(base, "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"))
      .toEqual(["2026-11-01T05:30:00.000Z"]);
    expect(isoStarts(definition({ ...base, dstFoldPolicy: "LATER" }), "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"))
      .toEqual(["2026-11-01T06:30:00.000Z"]);
  });

  it("uses elapsed duration across DST and includes programs crossing a horizon boundary", () => {
    const dst = definition({
      localStartDate: "2026-03-08",
      localStartTime: "01:30",
      timeZone: "America/New_York",
      durationMs: 2 * HOUR,
    });
    const [dstOccurrence] = expandCalendarOccurrences(dst, {
      from: new Date("2026-03-08T00:00:00Z"),
      to: new Date("2026-03-09T00:00:00Z"),
    });
    expect(dstOccurrence.startsAt).toEqual(new Date("2026-03-08T06:30:00.000Z"));
    expect(dstOccurrence.endsAt).toEqual(new Date("2026-03-08T08:30:00.000Z"));

    const crossing = definition({ localStartTime: "23:30", durationMs: 2 * HOUR });
    const rows = expandCalendarOccurrences(crossing, {
      from: new Date("2026-01-02T00:00:00Z"),
      to: new Date("2026-01-02T01:00:00Z"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].endsAt).toEqual(new Date("2026-01-02T01:30:00.000Z"));
  });

  it("expands one-time, daily intervals, and daily weekday filters", () => {
    expect(isoStarts(definition(), "2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"))
      .toEqual(["2026-01-01T12:00:00.000Z"]);

    const daily = definition({
      recurrenceKind: "DAILY",
      recurrenceInterval: 2,
      recurrenceWeekdays: Object.freeze([1, 5]),
    });
    expect(isoStarts(daily, "2026-01-01T00:00:00Z", "2026-01-12T00:00:00Z"))
      .toEqual(["2026-01-05T12:00:00.000Z", "2026-01-09T12:00:00.000Z"]);
  });

  it("expands weekly recurrences on sorted ISO weekdays", () => {
    const weekly = definition({
      localStartDate: "2026-01-06",
      recurrenceKind: "WEEKLY",
      recurrenceWeekdays: Object.freeze([5, 1]),
    });
    expect(isoStarts(weekly, "2026-01-01T00:00:00Z", "2026-01-20T00:00:00Z"))
      .toEqual([
        "2026-01-09T12:00:00.000Z",
        "2026-01-12T12:00:00.000Z",
        "2026-01-16T12:00:00.000Z",
        "2026-01-19T12:00:00.000Z",
      ]);
  });

  it("skips missing monthly days and includes leap day", () => {
    const monthEnd = definition({
      localStartDate: "2026-01-31",
      recurrenceKind: "MONTHLY",
      recurrenceMonthDays: Object.freeze([31]),
    });
    expect(isoStarts(monthEnd, "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z"))
      .toEqual([
        "2026-01-31T12:00:00.000Z",
        "2026-03-31T12:00:00.000Z",
      ]);

    const leapDay = definition({
      localStartDate: "2024-01-01",
      recurrenceKind: "MONTHLY",
      recurrenceMonthDays: Object.freeze([29]),
    });
    expect(isoStarts(leapDay, "2024-02-01T00:00:00Z", "2024-03-01T00:00:00Z"))
      .toEqual(["2024-02-29T12:00:00.000Z"]);
  });

  it("applies count and inclusive local until limits to nominal instances", () => {
    const counted = definition({ recurrenceKind: "DAILY", recurrenceCount: 3 });
    expect(isoStarts(counted, "2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"))
      .toHaveLength(3);

    const until = definition({ recurrenceKind: "DAILY", recurrenceUntilDate: "2026-01-03" });
    expect(isoStarts(until, "2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"))
      .toEqual([
        "2026-01-01T12:00:00.000Z",
        "2026-01-02T12:00:00.000Z",
        "2026-01-03T12:00:00.000Z",
      ]);
  });

  it("cancels and moves nominal instances without changing their stable keys", () => {
    const cancellationKey = calendarRecurrenceKey("event-1", "2026-01-02", "12:00", "UTC");
    const moveKey = calendarRecurrenceKey("event-1", "2026-01-03", "12:00", "UTC");
    const recurring = definition({
      recurrenceKind: "DAILY",
      recurrenceCount: 3,
      exceptions: Object.freeze([
        Object.freeze({ kind: "CANCEL" as const, recurrenceKey: cancellationKey }),
        Object.freeze({
          kind: "MOVE" as const,
          recurrenceKey: moveKey,
          movedLocalStartDate: "2026-01-04",
          movedLocalStartTime: "16:00",
        }),
      ]),
    });
    const rows = expandCalendarOccurrences(recurring, {
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-05T00:00:00Z"),
    });

    expect(rows.map((row) => [row.startsAt.toISOString(), row.recurrenceKey, row.isMoved])).toEqual([
      ["2026-01-01T12:00:00.000Z", calendarRecurrenceKey("event-1", "2026-01-01", "12:00", "UTC"), false],
      ["2026-01-04T16:00:00.000Z", moveKey, true],
    ]);
  });

  it("is idempotent for deeply frozen definitions and enforces the output cap", () => {
    const frozen = definition({ recurrenceKind: "DAILY", recurrenceCount: 4 });
    const horizon = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-10T00:00:00Z") };
    const summarize = () => expandCalendarOccurrences(frozen, horizon).map((row) => ({
      key: row.recurrenceKey,
      start: row.startsAt.toISOString(),
      end: row.endsAt?.toISOString(),
    }));

    expect(summarize()).toEqual(summarize());
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(() => expandCalendarOccurrences(frozen, horizon, { maxRows: 2 })).toThrow(/2 row limit/);
  });
});
