import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  station: "00000000-0000-4000-8000-000000000001",
  first: "00000000-0000-4000-8000-000000000010",
  second: "00000000-0000-4000-8000-000000000011",
  video: "00000000-0000-4000-8000-000000000020",
};

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  requireApiUser: vi.fn(),
  assertStationOwner: vi.fn(),
  assertStationOwnerKind: vi.fn(),
  assertVideoOwner: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
  lockPublicationStation: vi.fn(),
  publishAfterScheduleMutation: vi.fn(),
  publishScheduleRefresh: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
  assertStationOwner: mocks.assertStationOwner,
  assertStationOwnerKind: mocks.assertStationOwnerKind,
  assertVideoOwner: mocks.assertVideoOwner,
}));
vi.mock("@/lib/db", () => ({
  transaction: mocks.transaction,
}));
vi.mock("@/lib/schedule-publication", () => ({
  lockPublicationStation: mocks.lockPublicationStation,
  publishAfterScheduleMutation: mocks.publishAfterScheduleMutation,
  publishScheduleRefresh: mocks.publishScheduleRefresh,
}));

import { PUT as reorderPlaylist } from "@/app/api/stations/[id]/playlist/reorder/route";
import { PATCH as updateRundownItem } from "@/app/api/stations/[id]/playlist/items/[itemId]/route";
import { PATCH as updateVideo } from "@/app/api/videos/[id]/route";

describe("schedule-visible mutation publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    mocks.requireApiUser.mockResolvedValue({ id: "owner" });
    mocks.assertStationOwnerKind.mockResolvedValue(undefined);
    mocks.assertVideoOwner.mockResolvedValue({ stationId: ids.station });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.lockPublicationStation.mockImplementation(async () => {
      mocks.order.push("station-lock");
      return { station: { id: ids.station }, promoted: false };
    });
    mocks.publishAfterScheduleMutation.mockResolvedValue({ activeChanged: false });
  });

  it("locks the station first and auto-publishes an actual reorder", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM playlist_items")) {
        mocks.order.push("playlist-lock");
        return { rows: [{ id: ids.first }, { id: ids.second }], rowCount: 2 };
      }
      return { rows: [], rowCount: 1 };
    });
    const response = await reorderPlaylist(new Request(`http://localhost/api/stations/${ids.station}/playlist/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [ids.second, ids.first] }),
    }), { params: Promise.resolve({ id: ids.station }) });
    expect(response.status).toBe(200);
    expect(mocks.order.slice(0, 2)).toEqual(["station-lock", "playlist-lock"]);
    expect(mocks.publishAfterScheduleMutation).toHaveBeenCalledWith(expect.anything(), ids.station);
  });

  it("does not create a snapshot for a reorder no-op", async () => {
    mocks.clientQuery.mockResolvedValue({ rows: [{ id: ids.first }, { id: ids.second }], rowCount: 2 });
    const response = await reorderPlaylist(new Request(`http://localhost/api/stations/${ids.station}/playlist/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [ids.first, ids.second] }),
    }), { params: Promise.resolve({ id: ids.station }) });
    expect(response.status).toBe(200);
    expect(mocks.publishAfterScheduleMutation).not.toHaveBeenCalled();
  });

  it("publishes title changes for ready playlist items but not description-only edits", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT v.title")) return { rows: [{ title: "Old", description: "Old description", status: "READY", in_playlist: true }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const titleResponse = await updateVideo(new Request(`http://localhost/api/videos/${ids.video}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New" }),
    }), { params: Promise.resolve({ id: ids.video }) });
    expect(titleResponse.status).toBe(200);
    expect(mocks.publishAfterScheduleMutation).toHaveBeenCalledTimes(1);

    mocks.publishAfterScheduleMutation.mockClear();
    const descriptionResponse = await updateVideo(new Request(`http://localhost/api/videos/${ids.video}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "New description" }),
    }), { params: Promise.resolve({ id: ids.video }) });
    expect(descriptionResponse.status).toBe(200);
    expect(mocks.publishAfterScheduleMutation).not.toHaveBeenCalled();
  });

  it("locks, versions, and publishes canonical ENPS rundown metadata", async () => {
    mocks.lockPublicationStation.mockResolvedValue({
      station: { id: ids.station, playlist_version: 3 },
      promoted: false,
    });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE playlist_items")) return { rows: [{ id: ids.first }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const response = await updateRundownItem(new Request(`http://localhost/api/stations/${ids.station}/playlist/items/${ids.first}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedPlaylistVersion: 3,
        page: 1,
        storySlug: "Opening headlines",
        segmentType: "STORY",
        plannedDurationMs: 90_000,
        timingMode: "HARD",
        hardStartOffsetMs: 300_000,
        editorialStatus: "APPROVED",
        technicalStatus: "READY",
        talent: "Anchor",
        cameraSourceNote: "Camera one",
        script: "Good evening.",
        notes: "Open clean.",
      }),
    }), { params: Promise.resolve({ id: ids.station, itemId: ids.first }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, playlistVersion: 4 });
    expect(mocks.publishAfterScheduleMutation).toHaveBeenCalledWith(expect.anything(), ids.station);
  });
});
