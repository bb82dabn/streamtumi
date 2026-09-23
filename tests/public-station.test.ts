import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  rateLimit: vi.fn(),
  resolvePublicStation: vi.fn(),
  resolveCalendarRuntime: vi.fn(),
  resolvePublicTvChannelProgram: vi.fn(),
  resolvePublicTvChannelReadiness: vi.fn(),
  objectResponse: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_SECRET: "test-secret".repeat(4) }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/media", () => ({ objectResponse: mocks.objectResponse }));
vi.mock("@/lib/calendar-runtime", () => ({ resolveCalendarRuntime: mocks.resolveCalendarRuntime }));
vi.mock("@/lib/public-access", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/public-access")>(),
  resolvePublicStation: mocks.resolvePublicStation,
  resolvePublicTvChannelProgram: mocks.resolvePublicTvChannelProgram,
  resolvePublicTvChannelReadiness: mocks.resolvePublicTvChannelReadiness,
}));

import { GET } from "@/app/api/public/stations/[token]/route";
import { GET as radioArtwork } from "@/app/api/public/stations/[token]/radio/items/[timelineItemId]/artwork/route";
import { publicCalendarRadioItemRef } from "@/lib/public-access";

describe("public station clock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(15_000);
    mocks.resolveCalendarRuntime.mockResolvedValue(null);
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-1",
      station_kind: "TV",
      programming_mode: "LEGACY_LOOP",
      tv_delivery_mode: "LEGACY_VOD",
      tv_channel_rendition_mode: "DUAL",
      time_zone: "UTC",
      name: "Broadcast",
      description: "",
      mode: "ON_DEMAND",
      active_schedule_id: "schedule-1",
      schedule_started_at: new Date(0),
      broadcast_state: "RUNNING",
      logo_key: null,
      offline_slate_key: null,
      effective_explicit: false,
    });
    mocks.resolvePublicTvChannelProgram.mockResolvedValue(null);
    mocks.query.mockResolvedValue({
      rows: [{
        transition_ms: 0,
        items: [
          { video_id: "first", title: "First", duration_ms: "10000", position: 0, thumbnail_key: null, captions_key: null },
          { video_id: "second", title: "Second", duration_ms: "20000", position: 1, thumbnail_key: null, captions_key: null },
        ],
      }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns the station-wide live position even for a legacy on-demand row", async () => {
    const response = await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.station.mode).toBe("SYNCHRONIZED");
    expect(body.delivery).toEqual({ mode: "LEGACY_VOD" });
    expect(body.program).toBeUndefined();
    expect(body.serverTime).toBe("1970-01-01T00:00:15.000Z");
    expect(body.position).toMatchObject({ index: 1, itemId: "second", playbackOffsetMs: 5_000 });
  });

  it("keeps Weather state behavior unchanged", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({
      ...await mocks.resolvePublicStation(),
      playback_type: "WEATHERSTAR_4000",
    });

    const response = await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    });

    expect(await response.json()).toMatchObject({
      online: true,
      playlist: [],
      station: { playbackKind: "PERSONALIZED_WEATHER" },
    });
    expect(mocks.resolveCalendarRuntime).toHaveBeenCalledTimes(1);
  });

  it("returns an available channel delivery without removing legacy TV clock fields", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({
      ...await mocks.resolvePublicStation(),
      tv_delivery_mode: "CHANNEL_HLS",
      tv_channel_rendition_mode: "HD_ONLY",
    });
    mocks.resolvePublicTvChannelReadiness.mockResolvedValueOnce({
      status: "AVAILABLE",
      version: "schedule-1:8",
      renditionMode: "HD_ONLY",
      segments: [],
    });

    const response = await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    });
    const body = await response.json();

    expect(body.delivery).toEqual({
      mode: "CHANNEL_HLS",
      status: "AVAILABLE",
      version: "schedule-1:8",
      renditionMode: "HD_ONLY",
      hlsUrl: "/api/public/stations/token/tv/master.m3u8",
    });
    expect(body.playlist).toHaveLength(2);
    expect(body.position).toMatchObject({ itemId: "second", playbackOffsetMs: 5_000 });
  });

  it("returns a starting channel without publishing an HLS URL", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({
      ...await mocks.resolvePublicStation(),
      tv_delivery_mode: "CHANNEL_HLS",
      tv_channel_rendition_mode: "DUAL",
    });
    mocks.resolvePublicTvChannelReadiness.mockResolvedValueOnce({
      status: "STARTING",
      version: "schedule-1:pending",
      renditionMode: "DUAL",
      segments: [],
    });

    const body = await (await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    })).json();

    expect(body.delivery).toEqual({ mode: "CHANNEL_HLS", status: "STARTING", version: "schedule-1:pending", renditionMode: "DUAL" });
    expect(body.delivery).not.toHaveProperty("hlsUrl");
    expect(body.position.itemId).toBe("second");
    expect(mocks.resolvePublicTvChannelProgram).not.toHaveBeenCalled();
  });
it("returns to journal-backed automation metadata after acknowledged release", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({
      ...await mocks.resolvePublicStation(),
      tv_delivery_mode: "CHANNEL_HLS",
      tv_channel_rendition_mode: "DUAL",
    });
    mocks.resolvePublicTvChannelReadiness.mockResolvedValueOnce({
      status: "AVAILABLE",
      version: "fallback-generation",
      renditionMode: "DUAL",
      segments: [],
    });
    mocks.resolvePublicTvChannelProgram.mockResolvedValueOnce({
      kind: "TV_AUTOMATION",
      itemId: "second",
      title: "Second",
    });

    const body = await (await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    })).json();

    expect(body.program).toEqual({ kind: "TV_AUTOMATION", itemId: "second", title: "Second" });
  });

  it("returns the current shuffled playlist in the same order used by position.index", async () => {
    mocks.query.mockResolvedValue({
      rows: [{
        transition_ms: 0,
        playback_order: "SHUFFLE",
        shuffle_seed: "7727",
        items: [
          { video_id: "first", title: "First", duration_ms: "10000", position: 0, thumbnail_key: null, captions_key: null },
          { video_id: "second", title: "Second", duration_ms: "20000", position: 1, thumbnail_key: null, captions_key: null },
          { video_id: "third", title: "Third", duration_ms: "5000", position: 2, thumbnail_key: null, captions_key: null },
        ],
      }],
    });
    const response = await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    });
    const body = await response.json();
    expect(body.playbackOrder).toBe("SHUFFLE");
    expect(body.playlist[body.position.index].id).toBe(body.position.itemId);
    expect(body.playlist.map((item: { schedulePosition: number }) => item.schedulePosition).sort()).toEqual([0, 1, 2]);
  });

  it("returns a discriminated setup state for Radio without querying TV schedules", async () => {
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-radio",
      name: "Radio Test",
      description: "",
      station_kind: "RADIO",
      programming_mode: "CLOCK",
      time_zone: "America/Chicago",
      broadcast_state: "STOPPED",
      effective_explicit: false,
      logo_key: null,
      offline_slate_key: null,
    });
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      station: { stationKind: "RADIO", timeZone: "America/Chicago" },
      online: false,
      playback: { kind: "RADIO_CLOCK", status: "SETUP" },
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("returns current and next metadata for a running published Radio clock", async () => {
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-radio",
      name: "Radio Test",
      description: "",
      station_kind: "RADIO",
      programming_mode: "CLOCK",
      time_zone: "UTC",
      active_clock_release_id: "release-1",
      broadcast_state: "RUNNING",
      effective_explicit: false,
      logo_key: null,
      offline_slate_key: null,
    });
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [
      { id: "current", starts_at: new Date(10_000), ends_at: new Date(20_000), source_offset_ms: "0", title: "Current", artist: "Artist", album: "", artwork_key: null },
      { id: "next", starts_at: new Date(20_000), ends_at: new Date(30_000), source_offset_ms: "0", title: "Next", artist: "Artist 2", album: "", artwork_key: null },
    ] }).mockResolvedValueOnce({ rows: [{ status: "RUNNING", active_session_id: "00000000-0000-4000-8000-000000000015" }] });
    const response = await GET(new Request("http://localhost/api/public/stations/token"), { params: Promise.resolve({ token: "token" }) });
    const body = await response.json();
    expect(body).toMatchObject({
      online: true,
      releaseId: "release-1",
      playback: { kind: "RADIO_CLOCK", status: "ON_AIR", timelineItemId: "current", title: "Current", playbackOffsetMs: 5_000 },
      next: { title: "Next", artist: "Artist 2" },
      stream: { status: "AVAILABLE", sessionId: "00000000-0000-4000-8000-000000000015" },
    });
  });

  it("serves a static Radio release without consulting playout state", async () => {
    const releaseId = "00000000-0000-4000-8000-000000000029";
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-radio",
      name: "Static Radio",
      description: "",
      station_kind: "RADIO",
      programming_mode: "CLOCK",
      radio_delivery_mode: "STATIC_HLS",
      time_zone: "UTC",
      active_clock_release_id: releaseId,
      broadcast_state: "RUNNING",
      effective_explicit: false,
      logo_key: null,
      offline_slate_key: null,
    });
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [
      { id: "00000000-0000-4000-8000-000000000030", starts_at: new Date(10_000), ends_at: new Date(20_000), source_offset_ms: "0", title: "Current", artist: "Artist", album: "", artwork_key: "art.jpg", delivery_ready: true },
      { id: "00000000-0000-4000-8000-000000000031", starts_at: new Date(20_000), ends_at: new Date(30_000), source_offset_ms: "0", title: "Next", artist: "Artist 2", album: "", artwork_key: null, delivery_ready: true },
    ] });
    const response = await GET(new Request("http://localhost/api/public/stations/token"), { params: Promise.resolve({ token: "token" }) });
    const body = await response.json();
    expect(body).toMatchObject({
      online: true,
      releaseId,
      stream: { status: "AVAILABLE", sessionId: releaseId, audioHlsUrl: "/api/public/stations/token/radio/audio/master.m3u8" },
      playback: { artworkUrl: "/api/public/stations/token/radio/items/00000000-0000-4000-8000-000000000030/artwork" },
    });
    expect(body.stream.visualHlsUrl).toBeUndefined();
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("radio_playout_state"))).toBe(false);
  });
it("uses the selected Calendar TV schedule and epoch without exposing internal ids", async () => {
    const calendarScheduleId = "calendar-schedule-internal";
    const occurrenceId = "calendar-occurrence-internal";
    mocks.resolveCalendarRuntime.mockResolvedValueOnce({
      stationId: "station-1",
      stationKind: "TV",
      occurrence: {
        id: occurrenceId,
        title: "Pinned Feature",
        eventKind: "PROGRAM",
        startsAt: new Date(10_000),
        endsAt: new Date(30_000),
      },
      desiredSource: { kind: "TV_SCHEDULE", scheduleId: calendarScheduleId, epochAt: new Date(10_000) },
      desiredSourceRole: "PRIMARY",
      fallbackSource: { kind: "NONE" },
      plannedStatus: "PLAYING",
      actual: {
        status: "PLAYING",
        sourceRole: "PRIMARY",
        source: { kind: "TV_SCHEDULE", scheduleId: calendarScheduleId, epochAt: new Date(10_000) },
        observedAt: new Date(14_000),
      },
      nextBoundaryAt: new Date(30_000),
    });

    const body = await (await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    })).json();

    expect(mocks.query.mock.calls[0][1]).toEqual([calendarScheduleId]);
    expect(body.position).toMatchObject({ itemId: "first", playbackOffsetMs: 5_000 });
    expect(body.calendarRuntime).toMatchObject({
      occurrenceRef: expect.stringMatching(/^cal_[A-Za-z0-9_-]{24}$/),
      planned: { title: "Pinned Feature", kind: "PROGRAM" },
      actual: { status: "PLAYING", sourceRole: "PRIMARY" },
    });
    expect(body).not.toHaveProperty("scheduleId");
    expect(JSON.stringify(body)).not.toContain(calendarScheduleId);
    expect(JSON.stringify(body)).not.toContain(occurrenceId);
    expect(mocks.resolveCalendarRuntime).toHaveBeenCalledTimes(1);
  });
it("publishes exact Calendar Radio item metadata and an opaque artwork reference", async () => {
    const occurrenceId = "radio-occurrence-internal";
    const itemId = "radio-calendar-item-internal";
    const releaseId = "radio-calendar-release-internal";
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-radio",
      name: "Calendar Radio",
      description: "",
      station_kind: "RADIO",
      programming_mode: "CALENDAR_EVENTS",
      radio_delivery_mode: "PLAYOUT",
      time_zone: "UTC",
      active_clock_release_id: "weekly-release",
      broadcast_state: "RUNNING",
      effective_explicit: false,
      logo_key: null,
      offline_slate_key: null,
    });
    mocks.resolveCalendarRuntime.mockResolvedValueOnce({
      stationId: "station-radio",
      stationKind: "RADIO",
      occurrence: {
        id: occurrenceId,
        title: "Calendar Block",
        eventKind: "PROGRAM",
        startsAt: new Date(10_000),
        endsAt: new Date(20_000),
      },
      desiredSource: { kind: "RADIO_CLOCK_BLOCK" },
      desiredSourceRole: "FALLBACK",
      fallbackSource: { kind: "RADIO_CLOCK_BLOCK" },
      plannedStatus: "PLAYING",
      actual: {
        status: "FALLBACK",
        sourceRole: "FALLBACK",
        source: { kind: "RADIO_CLOCK_BLOCK" },
        observedAt: new Date(14_000),
      },
      nextBoundaryAt: new Date(20_000),
      calendarReleaseId: releaseId,
    });
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        program_source: "CLOCK",
        active_session_id: "output-session",
        status: "RUNNING",
        calendar_item_id: itemId,
        calendar_item_starts_at: new Date(10_000),
        calendar_item_ends_at: new Date(20_000),
        calendar_item_source_offset_ms: "2000",
        calendar_item_title: "Exact Song",
        calendar_item_artist: "Exact Artist",
        calendar_item_album: "Exact Album",
        calendar_item_artwork_key: "private/artwork.jpg",
      }] });

    const body = await (await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    })).json();

    expect(body).toMatchObject({
      online: true,
      playback: {
        kind: "RADIO_CLOCK",
        title: "Exact Song",
        artist: "Exact Artist",
        playbackOffsetMs: 7_000,
        timelineItemId: expect.stringMatching(/^cal_[A-Za-z0-9_-]{24}$/),
      },
      calendarRuntime: { actual: { status: "FALLBACK" }, fallbackStatus: "ACTIVE" },
    });
    expect(body.playback.artworkUrl).toContain(body.playback.timelineItemId);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(itemId);
    expect(serialized).not.toContain(occurrenceId);
    expect(serialized).not.toContain(releaseId);
  });

  it("marks a Calendar Radio offline occurrence offline while retaining the drainable stream", async () => {
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-radio",
      name: "Calendar Radio",
      description: "",
      station_kind: "RADIO",
      programming_mode: "CALENDAR_EVENTS",
      radio_delivery_mode: "PLAYOUT",
      time_zone: "UTC",
      active_clock_release_id: "weekly-release",
      broadcast_state: "RUNNING",
      effective_explicit: false,
      logo_key: null,
      offline_slate_key: null,
    });
    mocks.resolveCalendarRuntime.mockResolvedValueOnce({
      stationId: "station-radio",
      stationKind: "RADIO",
      occurrence: {
        id: "offline-occurrence-internal",
        title: "Maintenance",
        eventKind: "OFFLINE",
        startsAt: new Date(10_000),
        endsAt: new Date(20_000),
      },
      desiredSource: { kind: "NONE" },
      desiredSourceRole: null,
      fallbackSource: { kind: "NONE" },
      plannedStatus: "OFFLINE",
      actual: null,
      nextBoundaryAt: new Date(20_000),
    });
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        program_source: "CLOCK",
        active_session_id: "draining-output",
        status: "RUNNING",
      }] });

    const body = await (await GET(new Request("http://localhost/api/public/stations/token"), {
      params: Promise.resolve({ token: "token" }),
    })).json();

    expect(body).toMatchObject({
      online: false,
      stream: { status: "AVAILABLE", sessionId: "draining-output" },
      playback: { kind: "RADIO_CLOCK", status: "STOPPED" },
      calendarRuntime: { planned: { kind: "OFFLINE" } },
    });
  });

  it("resolves opaque Calendar Radio artwork only through the current playout item", async () => {
    const itemId = "00000000-0000-4000-8000-000000000040";
    const itemRef = publicCalendarRadioItemRef("station-radio", itemId);
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-radio",
      station_kind: "RADIO",
      access_password_hash: null,
      room_access_generation: null,
    });
    mocks.query.mockResolvedValueOnce({ rows: [{ id: itemId, artwork_key: "private/calendar-art.jpg" }] });
    mocks.objectResponse.mockResolvedValueOnce(new Response("artwork"));
    const request = new Request(`http://localhost/api/public/stations/token/radio/items/${itemRef}/artwork`);

    const response = await radioArtwork(request, {
      params: Promise.resolve({ token: "token", timelineItemId: itemRef }),
    });

    expect(response.status).toBe(200);
    const [sql, values] = mocks.query.mock.calls[0];
    expect(String(sql)).toContain("calendar_item.id = state.current_calendar_item_id");
    expect(String(sql)).toContain("calendar_item.release_id = state.calendar_release_id");
    expect(String(sql)).toContain("calendar_item.occurrence_id = state.occurrence_id");
    expect(values).toEqual(["station-radio"]);
    expect(mocks.objectResponse).toHaveBeenCalledWith(
      "private/calendar-art.jpg",
      request,
      "public, max-age=86400, s-maxage=86400",
    );
  });
});
