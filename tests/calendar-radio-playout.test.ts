import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import type { CalendarRadioOccurrenceItem, CalendarRuntimeOccurrence, CalendarRuntimeResolution } from "@/lib/calendar-runtime";
import { calendarRadioPlaybackWindow, chooseCalendarRadioProgramSource, type RadioProgramSnapshot } from "@/lib/radio-playout-program";

const now = new Date("2026-08-21T12:00:10.000Z");
const snapshot: RadioProgramSnapshot = {
  activeClockReleaseId: "baseline-release",
  clockReady: true,
  databaseNow: now,
};

function item(): CalendarRadioOccurrenceItem {
  return {
    id: "calendar-item",
    clockReleaseId: "clock-release",
    clockBlockId: "clock-block",
    clockItemId: "clock-item",
    startsAt: new Date(now.getTime() - 10_000),
    endsAt: new Date(now.getTime() + 20_000),
    sourceOffsetMs: 1_250,
    playbackDurationMs: 30_000,
  };
}

function runtime(occurrence: CalendarRuntimeOccurrence | null): CalendarRuntimeResolution {
  const baseline = { kind: "RADIO_CLOCK_BLOCK" as const, clockReleaseId: "baseline-release", clockBlockId: null, anchorAt: null, item: null };
  const source = occurrence?.source ?? baseline;
  return {
    stationId: "station", stationKind: "RADIO", requestedAt: now, profileId: "profile",
    calendarReleaseId: "calendar-release", materializedThrough: new Date(now.getTime() + 86_400_000),
    occurrence, baselineSource: baseline, source, fallbackSource: occurrence?.fallbackSource ?? { kind: "NONE" },
    desiredSource: source, desiredSourceRole: occurrence ? "PRIMARY" : "BASELINE",
    plannedStatus: "PLAYING", actual: null, nextBoundaryAt: occurrence?.endsAt ?? null,
  };
}

describe("Calendar Radio automation", () => {
  it("chooses the exact materialized local clock item", () => {
    const currentItem = item();
    const occurrence: CalendarRuntimeOccurrence = {
      id: "occurrence", calendarReleaseId: "calendar-release", releaseEventId: "event",
      title: "Calendar program", eventKind: "PROGRAM", priority: 1,
      startsAt: currentItem.startsAt, endsAt: currentItem.endsAt,
      source: { kind: "RADIO_CLOCK_BLOCK", clockReleaseId: currentItem.clockReleaseId, clockBlockId: currentItem.clockBlockId, anchorAt: currentItem.startsAt, item: currentItem },
      fallbackSource: { kind: "NONE" },
    };
    expect(chooseCalendarRadioProgramSource(snapshot, runtime(occurrence))).toMatchObject({
      source: "CLOCK", releaseId: "clock-release", calendarItemId: "calendar-item", sourceRole: "PRIMARY",
    });
  });

  it("uses baseline automation outside an occurrence and silence for offline time", () => {
    expect(chooseCalendarRadioProgramSource(snapshot, runtime(null))).toMatchObject({ source: "CLOCK", releaseId: "baseline-release", sourceRole: "BASELINE" });
    const offline: CalendarRuntimeOccurrence = {
      id: "offline", calendarReleaseId: "calendar-release", releaseEventId: "event", title: "Offline",
      eventKind: "OFFLINE", priority: 1, startsAt: new Date(now.getTime() - 1_000), endsAt: new Date(now.getTime() + 1_000),
      source: { kind: "NONE" }, fallbackSource: { kind: "NONE" },
    };
    expect(chooseCalendarRadioProgramSource(snapshot, runtime(offline))).toMatchObject({ source: "SILENCE", occurrenceId: "offline" });
  });

  it("accounts for source elapsed time and preparation latency", () => {
    expect(calendarRadioPlaybackWindow({
      sourceOffsetMs: 1_000,
      startsAt: new Date(0),
      endsAt: new Date(10_000),
      databaseNow: new Date(4_000),
      preparedAt: new Date(4_500),
    })).toEqual({ sourcePositionMs: 5_500, remainingMs: 5_500 });
  });
});
