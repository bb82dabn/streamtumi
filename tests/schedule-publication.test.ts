import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ transaction: vi.fn() }));
vi.mock("@/lib/chat-events", () => ({ publishStationEvent: vi.fn() }));

import {
  lockPublicationStation,
  promotePendingLocked,
  publishAfterScheduleMutation,
  publishEditableSchedule,
  type PublicationStation,
} from "@/lib/schedule-publication";

type PublicationClientOptions = {
  ready?: boolean;
  videoDurations?: string[];
  derivative?: "ready" | "missing" | "duration-mismatch";
  fillerReady?: boolean;
};

function publicationClient(overrides: Partial<PublicationStation> = {}, options: PublicationClientOptions = {}) {
  const state: PublicationStation = {
    id: "00000000-0000-4000-8000-000000000001",
    broadcast_state: "RUNNING",
    active_schedule_id: "00000000-0000-4000-8000-000000000010",
    pending_schedule_id: null,
    pending_activation_at: null,
    schedule_started_at: new Date(0),
    playlist_version: 4,
    transition_ms: 0,
    playback_order: "SHUFFLE",
    auto_publish_next_loop: true,
    tv_delivery_mode: "LEGACY_VOD",
    active_total_duration_ms: "10000",
    ...overrides,
  };
  let scheduleNumber = 20;
  let scheduleItemNumber = 500;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("SELECT s.id") && sql.includes("active_total_duration_ms")) return { rows: [{ ...state }], rowCount: 1 };
    if (sql.startsWith("SELECT playlist_version")) {
      return { rows: [{ playlist_version: state.playlist_version, transition_ms: state.transition_ms, playback_order: state.playback_order }], rowCount: 1 };
    }
    if (sql.includes("SELECT p.video_id")) {
      if (options.ready === false) return { rows: [], rowCount: 0 };
      const rows = (options.videoDurations ?? ["10000"]).map((duration_ms, index) => ({
        video_id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
        title: `Program ${index + 1}`,
        duration_ms,
        hls_key: `video-${index + 1}/master.m3u8`,
        thumbnail_key: null,
        captions_key: null,
        media_asset_id: `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`,
        derivative_id: options.derivative === "missing"
          ? null
          : `00000000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`,
        delivery_duration_ms: options.derivative === "missing"
          ? null
          : options.derivative === "duration-mismatch" ? String(Number(duration_ms) - 1) : duration_ms,
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM tv_channel_transition_fillers")) {
      return options.fillerReady === false
        ? { rows: [], rowCount: 0 }
        : { rows: [{ id: "00000000-0000-4000-8000-000000000400" }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO schedules")) {
      scheduleNumber += 1;
      return { rows: [{ id: `00000000-0000-4000-8000-${String(scheduleNumber).padStart(12, "0")}` }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO schedule_items") && sql.includes("RETURNING id")) {
      scheduleItemNumber += 1;
      return { rows: [{ id: `00000000-0000-4000-8000-${String(scheduleItemNumber).padStart(12, "0")}` }], rowCount: 1 };
    }
    if (sql.includes("SET pending_schedule_id = $1")) {
      state.pending_schedule_id = values?.[0] as string;
      state.pending_activation_at = values?.[1] as Date | null;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SET active_schedule_id = $1")) {
      state.active_schedule_id = values?.[0] as string;
      state.schedule_started_at = values?.[1] as Date | null;
      state.pending_schedule_id = null;
      state.pending_activation_at = null;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("pending_schedule_id = NULL")) {
      state.pending_schedule_id = null;
      state.pending_activation_at = null;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  return { state, client: { query } as unknown as PoolClient, query };
}

describe("immutable schedule publication", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("replaces auto-published snapshots without moving the active loop boundary", async () => {
    const fake = publicationClient();
    const first = await publishAfterScheduleMutation(fake.client, fake.state.id, new Date(2_000));
    const firstSchedule = fake.state.pending_schedule_id;
    const second = await publishAfterScheduleMutation(fake.client, fake.state.id, new Date(7_000));
    expect(first).toMatchObject({ timing: "next-loop", activationAt: new Date(10_000), activeChanged: false });
    expect(second).toMatchObject({ timing: "next-loop", activationAt: new Date(10_000), activeChanged: false });
    expect(fake.state.pending_schedule_id).not.toBe(firstSchedule);
  });

  it("preserves an existing pending boundary instead of recomputing it", async () => {
    const boundary = new Date(9_000);
    const fake = publicationClient({
      pending_schedule_id: "00000000-0000-4000-8000-000000000099",
      pending_activation_at: boundary,
    });
    const result = await publishAfterScheduleMutation(fake.client, fake.state.id, new Date(7_000));
    expect(result.activationAt).toEqual(boundary);
    expect(fake.state.pending_activation_at).toEqual(boundary);
  });

  it("establishes first eligible content while a new station stays stopped", async () => {
    const fake = publicationClient({ broadcast_state: "STOPPED", active_schedule_id: null, schedule_started_at: null, active_total_duration_ms: null });
    const result = await publishAfterScheduleMutation(fake.client, fake.state.id, new Date(5_000));
    expect(result).toMatchObject({ timing: "immediate", activeChanged: true, activationAt: null });
    expect(fake.state.active_schedule_id).toBe(result.scheduleId);
    expect(fake.state.schedule_started_at).toBeNull();
  });

  it("preserves active playback but cancels stale pending state when the editable playlist becomes empty", async () => {
    const pendingId = "00000000-0000-4000-8000-000000000099";
    const fake = publicationClient({ pending_schedule_id: pendingId, pending_activation_at: new Date(10_000) }, { ready: false });
    const result = await publishAfterScheduleMutation(fake.client, fake.state.id, new Date(3_000));
    expect(result).toMatchObject({ activeChanged: false, pendingChanged: true });
    expect(fake.state.active_schedule_id).not.toBeNull();
    expect(fake.state.pending_schedule_id).toBeNull();
    expect(fake.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO schedules"))).toBe(false);
  });

  it("does not cancel a manually queued schedule when auto-publication is disabled", async () => {
    const pendingId = "00000000-0000-4000-8000-000000000099";
    const boundary = new Date(10_000);
    const fake = publicationClient({
      auto_publish_next_loop: false,
      pending_schedule_id: pendingId,
      pending_activation_at: boundary,
    }, { ready: false });
    const result = await publishAfterScheduleMutation(fake.client, fake.state.id, new Date(3_000));
    expect(result).toEqual({ activeChanged: false, pendingChanged: false, promoted: false });
    expect(fake.state.pending_schedule_id).toBe(pendingId);
    expect(fake.state.pending_activation_at).toEqual(boundary);
  });

  it("pins exact derivatives and transition filler for every CHANNEL_HLS item", async () => {
    const fake = publicationClient({
      tv_delivery_mode: "CHANNEL_HLS",
      transition_ms: 1500,
    }, { videoDurations: ["10000", "6000"] });
    const result = await publishEditableSchedule(fake.client, fake.state.id, "immediate", new Date(2_000));
    const playlistQuery = fake.query.mock.calls.find(([sql]) => String(sql).includes("SELECT p.video_id"));
    const scheduleInsert = fake.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO schedules"));
    const itemInserts = fake.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO schedule_items"));
    const pins = fake.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO tv_schedule_item_delivery"));

    expect(result).toMatchObject({ timing: "immediate", activeChanged: true });
    expect(String(playlistQuery?.[0])).toContain("descriptor.duration_ms = v.duration_ms");
    expect(String(playlistQuery?.[0])).toContain("variant.status = 'READY'");
    expect(scheduleInsert?.[1]?.[3]).toBe(19_000);
    expect(itemInserts).toHaveLength(2);
    expect(itemInserts.every(([sql]) => String(sql).includes("RETURNING id"))).toBe(true);
    expect(pins.map(([, values]) => values?.slice(1))).toEqual([
      ["00000000-0000-4000-8000-000000000300", "00000000-0000-4000-8000-000000000400"],
      ["00000000-0000-4000-8000-000000000301", "00000000-0000-4000-8000-000000000400"],
    ]);
  });

  it("rejects explicit CHANNEL_HLS publication when a derivative is missing", async () => {
    const fake = publicationClient({ tv_delivery_mode: "CHANNEL_HLS" }, { derivative: "missing" });
    await expect(publishEditableSchedule(fake.client, fake.state.id, "immediate", new Date(2_000))).rejects.toMatchObject({
      status: 409,
      code: "TV_DELIVERY_NOT_READY",
    });
    expect(fake.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO schedules"))).toBe(false);
  });

  it("rejects explicit CHANNEL_HLS publication when derivative duration differs", async () => {
    const fake = publicationClient({ tv_delivery_mode: "CHANNEL_HLS" }, { derivative: "duration-mismatch" });
    await expect(publishEditableSchedule(fake.client, fake.state.id, "immediate", new Date(2_000))).rejects.toMatchObject({
      status: 409,
      code: "TV_DELIVERY_NOT_READY",
      message: expect.stringContaining("exact matching duration"),
    });
  });

  it("rejects explicit CHANNEL_HLS publication when its exact transition filler is missing", async () => {
    const fake = publicationClient({
      tv_delivery_mode: "CHANNEL_HLS",
      transition_ms: 1500,
    }, { fillerReady: false });
    await expect(publishEditableSchedule(fake.client, fake.state.id, "immediate", new Date(2_000))).rejects.toMatchObject({
      status: 409,
      code: "TV_DELIVERY_NOT_READY",
      message: expect.stringContaining("transition filler"),
    });
    expect(fake.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO schedules"))).toBe(false);
  });

  it("preserves active and pending schedules when automatic CHANNEL_HLS publication is not ready", async () => {
    const pendingId = "00000000-0000-4000-8000-000000000099";
    const boundary = new Date(10_000);
    const fake = publicationClient({
      tv_delivery_mode: "CHANNEL_HLS",
      pending_schedule_id: pendingId,
      pending_activation_at: boundary,
    }, { derivative: "missing" });
    const activeId = fake.state.active_schedule_id;
    await expect(publishAfterScheduleMutation(fake.client, fake.state.id, new Date(3_000))).resolves.toEqual({
      activeChanged: false,
      pendingChanged: false,
      promoted: false,
    });
    expect(fake.state.active_schedule_id).toBe(activeId);
    expect(fake.state.pending_schedule_id).toBe(pendingId);
    expect(fake.state.pending_activation_at).toEqual(boundary);
    expect(fake.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO schedules"))).toBe(false);
  });

  it("keeps LEGACY_VOD snapshot publication unchanged and creates no delivery pins", async () => {
    const fake = publicationClient({ transition_ms: 500 });
    await publishEditableSchedule(fake.client, fake.state.id, "immediate", new Date(2_000));
    const stationSelect = fake.query.mock.calls.find(([sql]) => String(sql).includes("SELECT s.id"));
    const playlistQuery = fake.query.mock.calls.find(([sql]) => String(sql).includes("SELECT p.video_id"));
    const scheduleInsert = fake.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO schedules"));
    const itemInsert = fake.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO schedule_items"));

    expect(String(stationSelect?.[0])).toContain("s.tv_delivery_mode");
    expect(String(playlistQuery?.[0])).not.toContain("tv_channel_derivatives");
    expect(scheduleInsert?.[1]?.[3]).toBe(10_500);
    expect(String(itemInsert?.[0])).not.toContain("RETURNING id");
    expect(fake.query.mock.calls.some(([sql]) => String(sql).includes("tv_schedule_item_delivery"))).toBe(false);
  });
});

describe("due publication promotion", () => {
  it("uses locked current-row conditions and never applies a stale pending pointer", async () => {
    const stale = {
      id: "00000000-0000-4000-8000-000000000001",
      broadcast_state: "RUNNING" as const,
      active_schedule_id: "active-old",
      pending_schedule_id: "pending-old",
      pending_activation_at: new Date(1_000),
      schedule_started_at: new Date(0),
    };
    const winner = { ...stale, active_schedule_id: "pending-new", pending_schedule_id: null, pending_activation_at: null, schedule_started_at: new Date(1_000) };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [winner], rowCount: 1 });
    const result = await promotePendingLocked({ query } as unknown as PoolClient, stale, new Date(2_000));
    expect(result).toEqual({ station: winner, promoted: false });
    expect(query.mock.calls[0][0]).toContain("active_schedule_id IS NOT DISTINCT FROM $2");
    expect(query.mock.calls[0][0]).toContain("pending_schedule_id = $3");
    expect(query.mock.calls[0][1]).toEqual([stale.id, "active-old", "pending-old", stale.pending_activation_at, new Date(2_000)]);
  });

  it("does not promote while stopped even after the old wall-clock boundary", async () => {
    const station = {
      id: "station",
      broadcast_state: "STOPPED" as const,
      active_schedule_id: "active",
      pending_schedule_id: "pending",
      pending_activation_at: new Date(1_000),
      schedule_started_at: new Date(0),
    };
    const query = vi.fn();
    await expect(promotePendingLocked({ query } as unknown as PoolClient, station, new Date(20_000))).resolves.toEqual({ station, promoted: false });
    expect(query).not.toHaveBeenCalled();
  });

  it("reads the clock only after acquiring the station row lock", async () => {
    const station = publicationClient({
      pending_schedule_id: "00000000-0000-4000-8000-000000000099",
      pending_activation_at: new Date(1_000),
    }).state;
    const promoted = { ...station, active_schedule_id: station.pending_schedule_id, pending_schedule_id: null, pending_activation_at: null, schedule_started_at: new Date(1_000) };
    const order: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF s")) {
        order.push("lock");
        return { rows: [station], rowCount: 1 };
      }
      if (sql.includes("clock_timestamp")) {
        order.push("clock");
        return { rows: [{ now: new Date(2_000) }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE stations")) return { rows: [promoted], rowCount: 1 };
      if (sql.includes("SELECT s.id")) return { rows: [promoted], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const result = await lockPublicationStation({ query } as unknown as PoolClient, station.id);
    expect(order).toEqual(["lock", "clock"]);
    expect(result).toMatchObject({ promoted: true, now: new Date(2_000) });
  });
});
