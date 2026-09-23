import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CalendarRuntimeOccurrence,
  CalendarRuntimeSelectionInput,
  CalendarRuntimeSource,
} from "@/lib/calendar-runtime";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

import {
  resolveCalendarRuntime,
  resolveCalendarRuntimes,
  selectAndNormalizeCalendarRuntime,
} from "@/lib/calendar-runtime";

const ids = {
  station: "00000000-0000-4000-8000-000000000001",
  profile: "00000000-0000-4000-8000-000000000002",
  release: "00000000-0000-4000-8000-000000000003",
  event: "00000000-0000-4000-8000-000000000004",
  occurrence: "00000000-0000-4000-8000-000000000005",
  schedule: "00000000-0000-4000-8000-000000000006",
};
const requestedAt = new Date("2026-08-21T12:00:00.000Z");
const baseline: CalendarRuntimeSource = {
  kind: "TV_SCHEDULE",
  scheduleId: ids.schedule,
  epochAt: new Date("2026-08-20T00:00:00.000Z"),
};

function occurrence(
  overrides: Partial<CalendarRuntimeOccurrence> = {},
): CalendarRuntimeOccurrence {
  return {
    id: ids.occurrence,
    calendarReleaseId: ids.release,
    releaseEventId: ids.event,
    title: "Program",
    eventKind: "PROGRAM",
    priority: 1,
    startsAt: new Date("2026-08-21T11:30:00.000Z"),
    endsAt: new Date("2026-08-21T12:30:00.000Z"),
    source: {
      kind: "TV_SCHEDULE",
      scheduleId: "00000000-0000-4000-8000-000000000007",
      epochAt: new Date("2026-08-21T11:30:00.000Z"),
    },
    fallbackSource: { kind: "NONE" },
    ...overrides,
  };
}

function input(overrides: Partial<CalendarRuntimeSelectionInput> = {}): CalendarRuntimeSelectionInput {
  return {
    stationId: ids.station,
    stationKind: "TV",
    requestedAt,
    activeProfileId: ids.profile,
    profileStrategy: "CALENDAR_EVENTS",
    profileLifecycle: "ACTIVE",
    activeCalendarReleaseId: ids.release,
    releaseId: ids.release,
    releaseProfileId: ids.profile,
    materialization: {
      releaseId: ids.release,
      status: "READY",
      horizonFrom: new Date("2026-08-20T12:00:00.000Z"),
      materializedThrough: new Date("2026-08-22T12:00:00.000Z"),
    },
    pendingCalendarReleaseId: null,
    pendingCalendarActivationAt: null,
    baselineSource: baseline,
    occurrences: [],
    nextOccurrenceAt: null,
    playoutState: null,
    ...overrides,
  };
}

describe("calendar runtime pure selection", () => {
  it("uses half-open intervals and priority, then start and id tie-breakers", () => {
    const ended = occurrence({ id: "a", priority: 100, endsAt: requestedAt });
    const lower = occurrence({ id: "b", priority: 4 });
    const older = occurrence({ id: "c", priority: 5, startsAt: new Date("2026-08-21T11:00:00.000Z") });
    const winner = occurrence({ id: "d", priority: 5, startsAt: requestedAt });
    const selected = selectAndNormalizeCalendarRuntime(input({ occurrences: [ended, lower, older, winner] }));
    expect(selected?.occurrence?.id).toBe("d");
  });

  it("normalizes offline occurrences to no desired source", () => {
    const selected = selectAndNormalizeCalendarRuntime(input({
      occurrences: [occurrence({ eventKind: "OFFLINE", source: { kind: "NONE" }, fallbackSource: { kind: "NONE" } })],
    }));
    expect(selected).toMatchObject({
      plannedStatus: "OFFLINE",
      source: { kind: "NONE" },
      fallbackSource: { kind: "NONE" },
      desiredSource: { kind: "NONE" },
      desiredSourceRole: null,
    });
  });

  it("chooses the earliest occurrence, activation, or materialization boundary", () => {
    const selected = selectAndNormalizeCalendarRuntime(input({
      occurrences: [occurrence({ endsAt: new Date("2026-08-21T12:20:00.000Z") })],
      nextOccurrenceAt: new Date("2026-08-21T12:15:00.000Z"),
      pendingCalendarReleaseId: "pending",
      pendingCalendarActivationAt: new Date("2026-08-21T12:10:00.000Z"),
      materialization: {
        releaseId: ids.release,
        status: "READY",
        horizonFrom: new Date("2026-08-20T12:00:00.000Z"),
        materializedThrough: new Date("2026-08-21T12:05:00.000Z"),
      },
    }));
    expect(selected?.nextBoundaryAt).toEqual(new Date("2026-08-21T12:05:00.000Z"));
  });

  it("fails closed unless READY materialization covers the requested instant", () => {
    expect(selectAndNormalizeCalendarRuntime(input({
      materialization: {
        releaseId: ids.release,
        status: "RUNNING",
        horizonFrom: new Date("2026-08-20T12:00:00.000Z"),
        materializedThrough: new Date("2026-08-22T12:00:00.000Z"),
      },
    }))).toBeNull();
    expect(selectAndNormalizeCalendarRuntime(input({
      materialization: {
        releaseId: ids.release,
        status: "READY",
        horizonFrom: new Date("2026-08-20T12:00:00.000Z"),
        materializedThrough: requestedAt,
      },
    }))).toBeNull();
  });
});

function dbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    station_id: ids.station,
    station_kind: "TV",
    active_programming_profile_id: ids.profile,
    profile_strategy: "CALENDAR_EVENTS",
    profile_lifecycle: "ACTIVE",
    active_calendar_release_id: ids.release,
    release_id: ids.release,
    release_profile_id: ids.profile,
    materialization_release_id: ids.release,
    materialization_status: "READY",
    horizon_from: new Date("2026-08-20T12:00:00.000Z"),
    materialized_through: new Date("2026-08-22T12:00:00.000Z"),
    pending_calendar_release_id: null,
    pending_calendar_activation_at: null,
    active_schedule_id: ids.schedule,
    schedule_started_at: new Date("2026-08-20T00:00:00.000Z"),
    active_clock_release_id: null,
    radio_release_changed_at: null,
    occurrence_id: null,
    occurrence_release_id: null,
    release_event_id: null,
    event_title: null,
    event_kind: null,
    priority: null,
    starts_at: null,
    ends_at: null,
    source_kind: null,
    source_tv_schedule_id: null,
    source_clock_release_id: null,
    source_clock_block_id: null,
    fallback_source_kind: null,
    fallback_tv_schedule_id: null,
    fallback_clock_release_id: null,
    fallback_clock_block_id: null,
    primary_item_id: null,
    primary_item_clock_release_id: null,
    primary_item_clock_block_id: null,
    primary_item_clock_item_id: null,
    primary_item_starts_at: null,
    primary_item_ends_at: null,
    primary_item_source_offset_ms: null,
    primary_item_playback_duration_ms: null,
    fallback_item_id: null,
    fallback_item_clock_release_id: null,
    fallback_item_clock_block_id: null,
    fallback_item_clock_item_id: null,
    fallback_item_starts_at: null,
    fallback_item_ends_at: null,
    fallback_item_source_offset_ms: null,
    fallback_item_playback_duration_ms: null,
    next_occurrence_at: null,
    actual_observed_source: null,
    actual_calendar_release_id: null,
    actual_occurrence_id: null,
    actual_source_role: null,
    actual_fresh_at: null,
    ...overrides,
  };
}

describe("calendar runtime database service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("batches station reads and requires exact SQL coherence", async () => {
    mocks.query.mockResolvedValue({ rows: [dbRow()] });
    await expect(resolveCalendarRuntimes([ids.station, ids.station], requestedAt)).resolves.toHaveLength(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, values] = mocks.query.mock.calls[0];
    expect(sql).toContain("profile.id = station.active_programming_profile_id");
    expect(sql).toContain("release.profile_id = profile.id");
    expect(sql).toContain("materialization.status = 'READY'");
    expect(sql).toContain("materialization.horizon_from <= $2::timestamptz");
    expect(sql).toContain("materialization.materialized_through > $2::timestamptz");
    expect(values).toEqual([[ids.station], requestedAt]);
  });

  it("rejects incoherent mocked rows even if the database mock returns them", async () => {
    mocks.query.mockResolvedValue({ rows: [dbRow({ release_profile_id: "different-profile" })] });
    await expect(resolveCalendarRuntime(ids.station, requestedAt)).resolves.toBeNull();
  });
});
