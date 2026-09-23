import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadTvJournalWindow: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_SECRET: "test-secret".repeat(4) }) }));
vi.mock("@/lib/tv-segment-journal", () => ({ loadTvJournalWindow: mocks.loadTvJournalWindow }));

import { resolvePublicTvChannelProgram, resolvePublicTvChannelReadiness, type PublicStation } from "@/lib/public-access";
import type { TvLoadedJournalWindowSegment } from "@/lib/tv-segment-journal";

function station(): PublicStation {
  return {
    id: "station-1", playback_type: "conventional", station_kind: "TV", programming_mode: "LEGACY_LOOP",
    time_zone: "UTC", active_clock_release_id: null, previous_clock_release_id: null,
    radio_release_changed_at: null, radio_delivery_mode: "PLAYOUT", tv_delivery_mode: "CHANNEL_HLS",
    tv_channel_rendition_mode: "DUAL", name: "Channel", description: "", mode: "SYNCHRONIZED",
    transition_ms: 0, playback_order: "SEQUENTIAL", auto_publish_next_loop: false,
    access_password_hash: null, room_access_generation: null, active_schedule_id: "schedule-1",
    pending_schedule_id: null, pending_activation_at: null, schedule_started_at: new Date(0),
    logo_key: null, offline_slate_key: null, owner_id: "owner-1", broadcast_state: "RUNNING",
    deleted_at: null, moderation_status: "ACTIVE", visibility: "PUBLIC", genre_id: "genre-1",
    owner_declared_explicit: false, explicit_enforced_at: null, genre_is_explicit: false, effective_explicit: false,
  };
}

function segment(mediaSequence: number, startsAt: number): TvLoadedJournalWindowSegment {
  return {
    mediaSequence,
    discontinuitySequence: mediaSequence === 41 ? 2 : 3,
    discontinuity: mediaSequence === 41,
    startsAt: new Date(startsAt),
    endsAt: new Date(startsAt + 2000),
    durationMs: 2000,
    scheduleId: "schedule-1",
    playoutFence: 8,
    sourceKind: "AUTOMATION",
    sourceGeneration: "automation:schedule-1:legacy:none:none:none",
    calendarReleaseId: null,
    occurrenceId: null,
    sourceRole: null,
    automationEpochAt: null,
    renditionMode: "DUAL",
    availableRenditions: ["720p", "360p"],
    uris: { "720p": `private/720p/${mediaSequence}.ts`, "360p": `private/360p/${mediaSequence}.ts` },
  };
}

describe("public TV automation delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a fresh contiguous automation window", async () => {
    const active = [segment(41, 10_000), segment(42, 12_000)];
    mocks.loadTvJournalWindow.mockResolvedValue(active);
    await expect(resolvePublicTvChannelReadiness(station(), new Date(12_500))).resolves.toMatchObject({
      status: "AVAILABLE", renditionMode: "DUAL", segments: active,
    });
  });

  it("fails when the automation window is stale", async () => {
    mocks.loadTvJournalWindow.mockResolvedValue([segment(41, 10_000)]);
    await expect(resolvePublicTvChannelReadiness(station(), new Date(20_000))).resolves.toMatchObject({ status: "FAILED", segments: [] });
  });

  it("presents the current local schedule item", async () => {
    mocks.query.mockResolvedValue({ rows: [{ video_id: "video", automation_title: "Feature" }] });
    await expect(resolvePublicTvChannelProgram("station-1")).resolves.toEqual({ kind: "TV_AUTOMATION", itemId: "video", title: "Feature" });
    expect(mocks.query.mock.calls[0][0]).toContain("journal.source_kind = 'AUTOMATION'");
  });
});
