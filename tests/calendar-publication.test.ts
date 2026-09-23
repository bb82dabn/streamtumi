import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  publishStationEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/chat-events", () => ({ publishStationEvent: mocks.publishStationEvent }));

import {
  activateCalendarRelease,
  compileCalendarPreview,
  promoteDueCalendarRelease,
  publishCalendarRelease,
  replaceCalendarDraft,
} from "@/lib/calendar-publication";
import { calendarDraftReplaceSchema, calendarEventSchema, type CalendarEventInput } from "@/lib/calendar-validation";

const ids = {
  station: "00000000-0000-4000-8000-000000000001",
  owner: "00000000-0000-4000-8000-000000000002",
  profile: "00000000-0000-4000-8000-000000000003",
  event: "00000000-0000-4000-8000-000000000004",
  secondEvent: "00000000-0000-4000-8000-000000000005",
  schedule: "00000000-0000-4000-8000-000000000006",
  clockRelease: "00000000-0000-4000-8000-000000000007",
  clockBlock: "00000000-0000-4000-8000-000000000008",
  project: "00000000-0000-4000-8000-000000000009",
  studioRelease: "00000000-0000-4000-8000-000000000010",
  release: "00000000-0000-4000-8000-000000000011",
  releaseEvent: "00000000-0000-4000-8000-000000000012",
  key: "00000000-0000-4000-8000-000000000013",
  previousProfile: "00000000-0000-4000-8000-000000000014",
  occurrence: "00000000-0000-4000-8000-000000000015",
  releaseItem: "00000000-0000-4000-8000-000000000016",
  previousRelease: "00000000-0000-4000-8000-000000000017",
};

function event(overrides: Partial<CalendarEventInput> = {}): CalendarEventInput {
  return calendarEventSchema.parse({
    id: ids.event,
    title: "Morning program",
    eventKind: "PROGRAM",
    source: { kind: "TV_SCHEDULE", scheduleId: ids.schedule },
    fallbackSource: { kind: "NONE" },
    localStartDate: "2026-01-01",
    localStartTime: "12:00",
    timeZone: "UTC",
    durationMs: 60_000,
    recurrenceKind: "NONE",
    ...overrides,
  });
}

function stationAndProfile(sql: string) {
  if (sql.includes("FROM stations")) return { rows: [{ id: ids.station, station_kind: "TV", active_programming_profile_id: ids.previousProfile, active_calendar_release_id: null }], rowCount: 1 };
  if (sql.includes("FROM station_programming_profiles") && sql.includes("strategy = 'CALENDAR_EVENTS'")) return { rows: [{ id: ids.profile, name: "Calendar", lifecycle: "DRAFT", strategy: "CALENDAR_EVENTS" }], rowCount: 1 };
  return null;
}

function mockRadioPublication(failAudioInsert = false): Date {
  const publishedAt = new Date("2026-01-01T00:00:00.000Z");
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM stations") && !sql.includes("JOIN stations")) {
      return { rows: [{ id: ids.station, station_kind: "RADIO", active_programming_profile_id: ids.previousProfile, active_calendar_release_id: null }], rowCount: 1 };
    }
    if (sql.includes("FROM station_programming_profiles") && sql.includes("strategy = 'CALENDAR_EVENTS'")) {
      return { rows: [{ id: ids.profile, name: "Radio calendar", lifecycle: "DRAFT", strategy: "CALENDAR_EVENTS" }], rowCount: 1 };
    }
    if (sql.includes("calendar_releases release") && sql.includes("idempotency_key")) return { rows: [], rowCount: 0 };
    if (sql.includes("calendar_releases release") && sql.includes("release.source_draft_version = $2")) return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT draft_version")) return { rows: [{ draft_version: 5, updated_at: publishedAt }], rowCount: 1 };
    if (sql.includes("FROM calendar_draft_events")) return { rows: [{
      id: ids.event, title: "Radio program", event_kind: "PROGRAM", source_kind: "RADIO_CLOCK_BLOCK",
      source_tv_schedule_id: null, source_clock_release_id: ids.clockRelease, source_clock_block_id: ids.clockBlock,
      fallback_source_kind: "NONE",
      fallback_tv_schedule_id: null, fallback_clock_release_id: null, fallback_clock_block_id: null,
      local_start_date: "2026-01-01", local_start_time: "01:00:00", time_zone: "UTC",
      duration_ms: "2500", recurrence_kind: "NONE", recurrence_interval: 1,
      recurrence_count: null, recurrence_until_date: null, recurrence_weekdays: null,
      recurrence_month_days: null, dst_gap_policy: "SKIP", dst_fold_policy: "EARLIER",
      priority: 0, late_join_policy: "JOIN_IN_PROGRESS", live_end_policy: "SCHEDULED_END",
    }], rowCount: 1 };
    if (sql.includes("FROM calendar_draft_exceptions")) return { rows: [], rowCount: 0 };
    if (sql.includes("(SELECT sum(item.duration_ms)::text")) {
      return { rows: [{ release_id: ids.clockRelease, block_id: ids.clockBlock, source_duration_ms: "1000", has_items: true, ready: true }], rowCount: 1 };
    }
    if (sql.includes("MAX(release_number)")) return { rows: [{ release_number: 1 }], rowCount: 1 };
    if (sql.includes("INSERT INTO calendar_releases")) return { rows: [{ id: ids.release, published_at: publishedAt }], rowCount: 1 };
    if (sql.includes("INSERT INTO calendar_release_events")) return { rows: [{ id: ids.releaseEvent }], rowCount: 1 };
    if (sql.includes("SELECT release.station_id, station.station_kind")) {
      return { rows: [{ station_id: ids.station, station_kind: "RADIO" }], rowCount: 1 };
    }
    if (sql.includes("SELECT id, event_kind, duration_ms::text")) return { rows: [{
      id: ids.releaseEvent, event_kind: "PROGRAM", duration_ms: "2500", source_kind: "RADIO_CLOCK_BLOCK",
      source_clock_release_id: ids.clockRelease, source_clock_block_id: ids.clockBlock,
      fallback_source_kind: "NONE", fallback_clock_release_id: null, fallback_clock_block_id: null,
    }], rowCount: 1 };
    if (sql.includes("SELECT release.id AS release_id, block.id AS block_id")) {
      return { rows: [{ release_id: ids.clockRelease, block_id: ids.clockBlock }], rowCount: 1 };
    }
    if (sql.includes("FROM clock_release_items") && sql.includes("ORDER BY release_block_id")) {
      return { rows: [{ id: ids.releaseItem, release_block_id: ids.clockBlock, position: 0, duration_ms: "1000", media_key: "radio/item.flac" }], rowCount: 1 };
    }
    if (sql.includes("SELECT id, release_event_id, starts_at, ends_at")) {
      return { rows: [{ id: ids.occurrence, release_event_id: ids.releaseEvent, starts_at: new Date("2026-01-01T01:00:00.000Z"), ends_at: new Date("2026-01-01T01:00:02.500Z") }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO calendar_radio_occurrence_items")) {
      if (failAudioInsert) throw new Error("audio insert failed");
      return { rows: [], rowCount: 3 };
    }
    return { rows: [], rowCount: 1 };
  });
  return publishedAt;
}

describe("calendar publication service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<unknown>) => work({ query: mocks.query } as unknown as PoolClient));
  });

  it("strictly accepts fixed, premiere, and offline source shapes", () => {
    const draft = calendarDraftReplaceSchema.parse({
      profileId: ids.profile,
      expectedDraftVersion: 0,
      events: [
        event(),
        event({ id: ids.secondEvent, eventKind: "PREMIERE", title: "Premiere" }),
        event({ id: ids.studioRelease, eventKind: "OFFLINE", title: "Off air", source: { kind: "NONE" }, durationMs: 60_000 }),
      ],
      exceptions: [],
    });
    expect(draft.events.map((item) => item.eventKind)).toEqual(["PROGRAM", "PREMIERE", "OFFLINE"]);
    expect(calendarEventSchema.safeParse({ ...event(), durationMs: null }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...event(), ownerId: ids.owner }).success).toBe(false);
  });

  it("materializes recurrence and exposes DST decisions through the service compiler", () => {
    const recurring = event({ recurrenceKind: "DAILY", recurrenceCount: 3 });
    const dst = event({
      id: ids.secondEvent,
      localStartDate: "2026-03-08",
      localStartTime: "02:30",
      timeZone: "America/New_York",
      dstGapPolicy: "SHIFT_FORWARD",
    });
    const preview = compileCalendarPreview([recurring], [], { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-05T00:00:00Z") });
    expect(preview.occurrences).toHaveLength(3);
    const dstPreview = compileCalendarPreview([dst], [], { from: new Date("2026-03-08T00:00:00Z"), to: new Date("2026-03-09T00:00:00Z") });
    expect(dstPreview.occurrences[0].startsAt).toBe("2026-03-08T07:30:00.000Z");
    expect(dstPreview.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CALENDAR_DST_GAP_SHIFTED" })]));
  });

  it("reports same-priority overlap as blocking and priority overlap as deterministic", () => {
    const samePriority = compileCalendarPreview([
      event({ durationMs: 120_000 }),
      event({ id: ids.secondEvent, localStartTime: "12:01", durationMs: 120_000 }),
    ], [], { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-02T00:00:00Z") });
    expect(samePriority.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CALENDAR_OVERLAP" })]));
    const prioritized = compileCalendarPreview([
      event({ durationMs: 120_000 }),
      event({ id: ids.secondEvent, localStartTime: "12:01", durationMs: 120_000, priority: 1 }),
    ], [], { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-02T00:00:00Z") });
    expect(prioritized.valid).toBe(true);
    expect(prioritized.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CALENDAR_PRIORITY_OVERLAP" })]));
  });

  it("rejects unauthorized stations before inspecting or replacing a draft", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const input = calendarDraftReplaceSchema.parse({ profileId: ids.profile, expectedDraftVersion: 0, events: [event()], exceptions: [] });
    await expect(replaceCalendarDraft(ids.station, ids.owner, input)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM calendar_draft_events"))).toBe(false);
  });

  it("rejects a cross-station immutable source before changing existing rows", async () => {
    mocks.query.mockImplementation(async (sql: string) => stationAndProfile(sql)
      ?? (sql.includes("FROM schedules schedule") ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 0 }));
    const input = calendarDraftReplaceSchema.parse({ profileId: ids.profile, expectedDraftVersion: 0, events: [event()], exceptions: [] });
    await expect(replaceCalendarDraft(ids.station, ids.owner, input)).rejects.toMatchObject({ status: 409, code: "CALENDAR_SOURCE_NOT_FOUND" });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM calendar_draft_events"))).toBe(false);
  });

  it("detects expected-version conflicts while holding profile and draft locks", async () => {
    mocks.query.mockImplementation(async (sql: string) => stationAndProfile(sql)
      ?? (sql.includes("FROM schedules schedule") ? { rows: [{ id: ids.schedule, source_duration_ms: "60000", has_items: true, ready: true }], rowCount: 1 }
        : sql.includes("SELECT draft_version") ? { rows: [{ draft_version: 3, updated_at: new Date() }], rowCount: 1 }
          : { rows: [], rowCount: 0 }));
    const input = calendarDraftReplaceSchema.parse({ profileId: ids.profile, expectedDraftVersion: 2, events: [event()], exceptions: [] });
    await expect(replaceCalendarDraft(ids.station, ids.owner, input)).rejects.toMatchObject({ status: 409, code: "CALENDAR_DRAFT_CONFLICT" });
  });

  it("snapshots a recurring draft into append-only release and occurrence inserts", async () => {
    const publishedAt = new Date("2026-01-01T00:00:00.000Z");
    mocks.query.mockImplementation(async (sql: string) => {
      const context = stationAndProfile(sql);
      if (context) return context;
      if (sql.includes("calendar_releases release") && sql.includes("idempotency_key")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT draft_version")) return { rows: [{ draft_version: 4, updated_at: publishedAt }], rowCount: 1 };
      if (sql.includes("FROM calendar_draft_events")) return { rows: [{
        id: ids.event, title: "Off air", event_kind: "OFFLINE", source_kind: "NONE",
        source_tv_schedule_id: null, source_clock_release_id: null, source_clock_block_id: null,
        fallback_source_kind: "NONE",
        fallback_tv_schedule_id: null, fallback_clock_release_id: null, fallback_clock_block_id: null,
        local_start_date: "2026-01-01", local_start_time: "01:00:00", time_zone: "UTC",
        duration_ms: "60000", recurrence_kind: "DAILY", recurrence_interval: 1,
        recurrence_count: 3, recurrence_until_date: null, recurrence_weekdays: null,
        recurrence_month_days: null, dst_gap_policy: "SKIP", dst_fold_policy: "EARLIER",
        priority: 0, late_join_policy: "JOIN_IN_PROGRESS", live_end_policy: "SCHEDULED_END",
      }], rowCount: 1 };
      if (sql.includes("FROM calendar_draft_exceptions")) return { rows: [], rowCount: 0 };
      if (sql.includes("calendar_releases release") && sql.includes("source_draft_version")) return { rows: [], rowCount: 0 };
      if (sql.includes("MAX(release_number)")) return { rows: [{ release_number: 1 }], rowCount: 1 };
      if (sql.includes("INSERT INTO calendar_releases")) return { rows: [{ id: ids.release, published_at: publishedAt }], rowCount: 1 };
      if (sql.includes("INSERT INTO calendar_release_events")) return { rows: [{ id: ids.releaseEvent }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const release = await publishCalendarRelease(ids.station, ids.owner, ids.profile, 4, ids.key, publishedAt);
    expect(release).toMatchObject({ releaseId: ids.release, occurrenceCount: 3, sourceDraftVersion: 4, idempotent: false });
    const occurrenceInsert = mocks.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO calendar_occurrences"));
    expect(occurrenceInsert?.[1]).toHaveLength(39);
    expect(mocks.query.mock.calls.some(([sql]) => /(?:UPDATE|DELETE) calendar_release(?:s|_events|_exceptions)/.test(String(sql)))).toBe(false);
  });

  it("returns the immutable release idempotently by source draft version", async () => {
    const publishedAt = new Date("2026-01-01T00:00:00.000Z");
    mocks.query.mockImplementation(async (sql: string) => {
      const context = stationAndProfile(sql);
      if (context) return context;
      if (sql.includes("calendar_releases release") && sql.includes("idempotency_key")) return { rows: [], rowCount: 0 };
      if (sql.includes("calendar_releases release") && sql.includes("release.source_draft_version = $2")) return { rows: [{
        id: ids.release,
        profile_id: ids.profile,
        release_number: 2,
        source_draft_version: 4,
        published_at: publishedAt,
        occurrence_count: "3",
        horizon_from: new Date("2025-12-31T00:00:00.000Z"),
        materialized_through: new Date("2026-04-01T00:00:00.000Z"),
      }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(publishCalendarRelease(ids.station, ids.owner, ids.profile, 4, ids.key, publishedAt)).resolves.toMatchObject({
      releaseId: ids.release,
      sourceDraftVersion: 4,
      occurrenceCount: 3,
      idempotent: true,
    });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("FROM calendar_draft_events"))).toBe(false);
  });

  it("materializes Radio audio after occurrences and before marking the release ready", async () => {
    const publishedAt = mockRadioPublication();

    await expect(publishCalendarRelease(ids.station, ids.owner, ids.profile, 5, ids.key, publishedAt)).resolves.toMatchObject({
      releaseId: ids.release,
      occurrenceCount: 1,
    });

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    const occurrences = statements.findIndex((sql) => sql.includes("INSERT INTO calendar_occurrences"));
    const audio = statements.findIndex((sql) => sql.includes("INSERT INTO calendar_radio_occurrence_items"));
    const ready = statements.findIndex((sql) => sql.includes("INSERT INTO calendar_release_materialization_state"));
    expect(occurrences).toBeGreaterThan(-1);
    expect(audio).toBeGreaterThan(occurrences);
    expect(ready).toBeGreaterThan(audio);
    expect(statements[audio]).toContain("ON CONFLICT (occurrence_id, source_role, position) DO NOTHING");
    const audioValues = mocks.query.mock.calls[audio][1] as unknown[];
    expect(audioValues.filter((value) => value === "PRIMARY")).toHaveLength(3);
  });

  it("does not mark a Radio release ready when audio materialization fails", async () => {
    const publishedAt = mockRadioPublication(true);

    await expect(publishCalendarRelease(ids.station, ids.owner, ids.profile, 5, ids.key, publishedAt)).rejects.toThrow("audio insert failed");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO calendar_occurrences"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO calendar_release_materialization_state"))).toBe(false);
  });

  it("activates immediately with a coherent runtime transition and emits one update", async () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations")) return { rows: [{
        id: ids.station, station_kind: "TV", broadcast_state: "STOPPED",
        active_programming_profile_id: ids.previousProfile, active_calendar_release_id: null,
        pending_calendar_release_id: ids.previousRelease, pending_calendar_activation_at: new Date("2026-01-11T00:00:00Z"),
        active_schedule_id: ids.schedule, schedule_started_at: null,
        active_clock_release_id: null, radio_delivery_mode: "PLAYOUT",
      }], rowCount: 1 };
      if (sql.includes("FROM calendar_releases release")) return { rows: [{
        profile_id: ids.profile, lifecycle: "DRAFT", status: "READY",
        horizon_from: new Date("2026-01-01T00:00:00Z"),
        materialized_through: new Date("2026-04-01T00:00:00Z"), db_now: now,
      }], rowCount: 1 };
      if (sql.includes("FROM schedules schedule")) return { rows: [{ usable: true }], rowCount: 1 };
      if (sql.includes("FROM calendar_runtime_state")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
    await expect(activateCalendarRelease(ids.station, ids.owner, ids.release, "IMMEDIATE")).resolves.toEqual({ releaseId: ids.release, profileId: ids.profile, activated: true });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("lifecycle = 'ARCHIVED'"))).toBe(true);
    const stationUpdate = mocks.query.mock.calls.find(([sql]) => String(sql).includes("active_programming_profile_id = $1"));
    expect(String(stationUpdate?.[0])).not.toContain("programming_mode");
    expect(String(stationUpdate?.[0])).toContain("pending_calendar_activation_at = NULL");
    expect(mocks.query.mock.calls.filter(([sql]) => String(sql).includes("'RELEASE_ACTIVATED'"))).toHaveLength(1);
    expect(mocks.publishStationEvent).toHaveBeenCalledWith(ids.station, { type: "station.updated", data: { schedule: true } });
  });

  it("queues the next occurrence boundary without changing active pointers, then promotes it once", async () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const boundary = new Date("2026-01-10T12:30:00.000Z");
    let pending = false;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations")) return { rows: [{
        id: ids.station, station_kind: "TV", broadcast_state: "RUNNING",
        active_programming_profile_id: ids.previousProfile, active_calendar_release_id: ids.previousRelease,
        pending_calendar_release_id: pending ? ids.release : null,
        pending_calendar_activation_at: pending ? boundary : null,
        active_schedule_id: ids.schedule, schedule_started_at: new Date("2026-01-10T00:00:00Z"),
        active_clock_release_id: null, radio_delivery_mode: "PLAYOUT",
      }], rowCount: 1 };
      if (sql.includes("FROM calendar_releases release")) return { rows: [{
        profile_id: ids.profile, lifecycle: "DRAFT", status: "READY",
        horizon_from: new Date("2026-01-01T00:00:00Z"),
        materialized_through: new Date("2026-04-01T00:00:00Z"), db_now: pending ? boundary : now,
      }], rowCount: 1 };
      if (sql.includes("FROM schedules schedule")) return { rows: [{ usable: true }], rowCount: 1 };
      if (sql.includes("SELECT occurrence.ends_at")) return { rows: [{ ends_at: boundary }], rowCount: 1 };
      if (sql.includes("SET pending_calendar_release_id = $1")) {
        pending = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM calendar_runtime_state")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });

    await expect(activateCalendarRelease(ids.station, ids.owner, ids.release, "NEXT_BOUNDARY")).resolves.toEqual({ releaseId: ids.release, profileId: ids.profile, activated: false });
    const queued = mocks.query.mock.calls.find(([sql]) => String(sql).includes("SET pending_calendar_release_id = $1"));
    expect(queued?.[1]).toEqual([ids.release, boundary, ids.station, ids.previousRelease, null]);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("active_programming_profile_id = $1"))).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("'RELEASE_ACTIVATED'"))).toBe(false);

    vi.clearAllMocks();
    await expect(promoteDueCalendarRelease(ids.station, boundary)).resolves.toBe(true);
    const promoted = mocks.query.mock.calls.find(([sql]) => String(sql).includes("active_programming_profile_id = $1"));
    expect(String(promoted?.[0])).toContain("pending_calendar_release_id = $6");
    expect(mocks.query.mock.calls.filter(([sql]) => String(sql).includes("'RELEASE_ACTIVATED'"))).toHaveLength(1);
    expect(mocks.publishStationEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects running STATIC_HLS Radio activation and converts a stopped station atomically", async () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    let broadcastState: "RUNNING" | "STOPPED" = "RUNNING";
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations")) return { rows: [{
        id: ids.station, station_kind: "RADIO", broadcast_state: broadcastState,
        active_programming_profile_id: ids.previousProfile, active_calendar_release_id: null,
        pending_calendar_release_id: null, pending_calendar_activation_at: null,
        active_schedule_id: null, schedule_started_at: null,
        active_clock_release_id: ids.clockRelease, radio_delivery_mode: "STATIC_HLS",
      }], rowCount: 1 };
      if (sql.includes("FROM calendar_releases release")) return { rows: [{
        profile_id: ids.profile, lifecycle: "DRAFT", status: "READY",
        horizon_from: new Date("2026-01-01T00:00:00Z"),
        materialized_through: new Date("2026-04-01T00:00:00Z"), db_now: now,
      }], rowCount: 1 };
      if (sql.includes("FROM clock_releases release")) return { rows: [{ usable: true }], rowCount: 1 };
      if (sql.includes("FROM calendar_runtime_state")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });

    await expect(activateCalendarRelease(ids.station, ids.owner, ids.release, "IMMEDIATE")).rejects.toMatchObject({ status: 409, code: "CALENDAR_STATIC_HLS_RUNNING" });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("radio_delivery_mode = 'PLAYOUT'"))).toBe(false);

    vi.clearAllMocks();
    broadcastState = "STOPPED";
    await expect(activateCalendarRelease(ids.station, ids.owner, ids.release, "IMMEDIATE")).resolves.toMatchObject({ activated: true });
    const conversion = mocks.query.mock.calls.find(([sql]) => String(sql).includes("radio_delivery_mode = 'PLAYOUT'"));
    const activationUpdate = mocks.query.mock.calls.find(([sql]) => String(sql).includes("active_programming_profile_id = $1"));
    expect(conversion).toBeDefined();
    expect(activationUpdate).toBeDefined();
  });
});
