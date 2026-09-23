import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  envValue: { GUIDE_CATALOG_CACHE_SECONDS: 5, APP_URL: "https://stream.example" },
  promoteAllDueStations: vi.fn(),
  query: vi.fn(),
  resolveGuidePreview: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/env", () => ({ env: () => mocks.envValue }));
vi.mock("@/lib/presence", () => ({ viewerCounts: vi.fn(async () => ({ "station-one": 3 })) }));
vi.mock("@/lib/stations", () => ({ viewerUrl: () => "https://stream.example/watch/token" }));
vi.mock("@/lib/schedule-publication", () => ({ promoteAllDueStations: mocks.promoteAllDueStations }));
vi.mock("@/lib/guide-preview", () => ({ resolveGuidePreview: mocks.resolveGuidePreview }));

import { loadGuideCatalog, loadPublicGuideCatalog } from "@/lib/guide";
import { resetGuideCatalogCache } from "@/lib/guide-catalog-cache";

const ownerOne = "00000000-0000-4000-8000-000000000001";
const ownerTwo = "00000000-0000-4000-8000-000000000002";
const stationOne = "00000000-0000-4000-8000-000000000011";
const stationTwo = "00000000-0000-4000-8000-000000000012";
const scheduleOne = "00000000-0000-4000-8000-000000000021";

function row(id: string, ownerId: string, activeScheduleId: string | null) {
  return {
    id, owner_id: ownerId, playback_type: "conventional",
    station_kind: "TV", name: id, description: "", owner_name: "Owner", genre_id: "music", genre_name: "Music",
    mode: "SYNCHRONIZED", broadcast_state: "RUNNING", active_schedule_id: activeScheduleId,
    active_clock_release_id: null, schedule_started_at: new Date(0), transition_ms: 500,
    playback_order: "SEQUENTIAL", shuffle_seed: "0", logo_key: null, offline_slate_key: null,
    access_token_ciphertext: "ciphertext", effective_explicit: false, playout_online: false,
    radio_item_id: null, radio_title: null, radio_artist: null,
    fan_count: 1, rating_average: 4, rating_count: 1, global_average: 3, last_chat_at: null,
    created_at: new Date(0), is_fan: false, viewer_rating: null, is_featured: false,
  };
}

function catalogRows() {
  return [row(stationOne, ownerOne, scheduleOne), row(stationTwo, ownerTwo, null)];
}

const callsWith = (fragment: string) => mocks.query.mock.calls.filter(([sql]) => String(sql).includes(fragment));
const catalogCalls = () => callsWith("FROM stations s").length;
const scheduleItemCalls = () => callsWith("FROM schedule_items").length;
const fanCalls = () => callsWith("FROM station_fans WHERE user_id");
const ratingCalls = () => callsWith("FROM station_ratings WHERE user_id");

function stubQueries(options: { fans?: string[]; ratings?: { station_id: string; rating: number }[] } = {}) {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM stations s")) return { rows: catalogRows() };
    if (sql.includes("FROM schedule_items")) {
      return { rows: [{ schedule_id: scheduleOne, video_id: "video", duration_ms: "1000", position: 0, thumbnail_key: null }] };
    }
    if (sql.includes("FROM station_fans WHERE user_id")) return { rows: (options.fans ?? [stationOne]).map((station_id) => ({ station_id })) };
    if (sql.includes("FROM station_ratings WHERE user_id")) return { rows: options.ratings ?? [{ station_id: stationOne, rating: 4 }] };
    return { rows: [] };
  });
}

describe("Guide catalog cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuideCatalogCache();
    mocks.envValue = { GUIDE_CATALOG_CACHE_SECONDS: 5, APP_URL: "https://stream.example" };
    mocks.promoteAllDueStations.mockResolvedValue([]);
    mocks.resolveGuidePreview.mockReturnValue({ item: null, offsetMs: 0 });
    stubQueries();
  });

  it("reuses one computed catalog for sequential reads inside the TTL", async () => {
    const first = await loadPublicGuideCatalog();
    const second = await loadPublicGuideCatalog();

    expect(catalogCalls()).toBe(1);
    expect(scheduleItemCalls()).toBe(1);
    expect(second).toEqual(first);
    expect(first).toHaveLength(2);
  });

  it("collapses concurrent cold reads into a single catalog computation", async () => {
    const results = await Promise.all([
      loadPublicGuideCatalog(),
      loadPublicGuideCatalog(),
      loadPublicGuideCatalog(),
      loadPublicGuideCatalog(),
      loadPublicGuideCatalog(),
    ]);

    expect(catalogCalls()).toBe(1);
    expect(scheduleItemCalls()).toBe(1);
    for (const stations of results) expect(stations).toEqual(results[0]);
  });

  it("recomputes the catalog once the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      await loadPublicGuideCatalog();
      expect(catalogCalls()).toBe(1);

      vi.advanceTimersByTime(6_000);
      await loadPublicGuideCatalog();
      expect(catalogCalls()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bypasses the cache entirely when the TTL is zero", async () => {
    mocks.envValue.GUIDE_CATALOG_CACHE_SECONDS = 0;

    await loadPublicGuideCatalog();
    await loadPublicGuideCatalog();
    const signedIn = await loadGuideCatalog(ownerOne);

    expect(catalogCalls()).toBe(3);
    expect(scheduleItemCalls()).toBe(3);
    expect(callsWith("FROM stations s")[0][1]).toEqual([null, false]);
    expect(signedIn[0]).toMatchObject({ id: stationOne, isFan: true, viewerRating: 4, isOwner: true });
  });

  it("caches explicit and safe catalogs separately", async () => {
    await loadPublicGuideCatalog();
    await loadPublicGuideCatalog(true);
    await loadPublicGuideCatalog(true);

    expect(catalogCalls()).toBe(2);
    expect(callsWith("FROM stations s").map(([, params]) => params)).toEqual([[null, false], [null, true]]);
  });

  it("overlays signed-in personalization on the cached anonymous rows", async () => {
    const anonymous = await loadPublicGuideCatalog();
    const signedIn = await loadGuideCatalog(ownerOne);

    expect(catalogCalls()).toBe(1);
    expect(fanCalls()).toEqual([
      [expect.stringContaining("SELECT station_id FROM station_fans WHERE user_id = $1"), [ownerOne, [stationOne, stationTwo]]],
    ]);
    expect(ratingCalls()).toEqual([
      [expect.stringContaining("rating::int AS rating FROM station_ratings WHERE user_id = $1"), [ownerOne, [stationOne, stationTwo]]],
    ]);
    expect(anonymous.map(({ isFan, viewerRating, isOwner }) => ({ isFan, viewerRating, isOwner }))).toEqual([
      { isFan: false, viewerRating: null, isOwner: false },
      { isFan: false, viewerRating: null, isOwner: false },
    ]);
    expect(signedIn.map(({ id, isFan, viewerRating, isOwner }) => ({ id, isFan, viewerRating, isOwner }))).toEqual([
      { id: stationOne, isFan: true, viewerRating: 4, isOwner: true },
      { id: stationTwo, isFan: false, viewerRating: null, isOwner: false },
    ]);
  });

  it("does not cache a failed catalog load", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations s")) throw new Error("database unavailable");
      return { rows: [] };
    });
    await expect(loadPublicGuideCatalog()).rejects.toThrow("database unavailable");

    stubQueries();
    const stations = await loadPublicGuideCatalog();

    expect(catalogCalls()).toBe(2);
    expect(stations).toHaveLength(2);
  });

  it("invalidates the cache when a read promotes due schedules", async () => {
    await loadPublicGuideCatalog();
    expect(catalogCalls()).toBe(1);

    mocks.promoteAllDueStations.mockResolvedValue([stationOne]);
    await loadPublicGuideCatalog();
    expect(catalogCalls()).toBe(2);

    mocks.promoteAllDueStations.mockResolvedValue([]);
    await loadPublicGuideCatalog();
    expect(catalogCalls()).toBe(2);
  });

  it("leaves cached entries untouched after a signed-in read", async () => {
    const signedIn = await loadGuideCatalog(ownerTwo);
    const anonymous = await loadPublicGuideCatalog();

    expect(signedIn.map(({ isOwner }) => isOwner)).toEqual([false, true]);
    expect(anonymous.map(({ isFan, viewerRating, isOwner }) => ({ isFan, viewerRating, isOwner }))).toEqual([
      { isFan: false, viewerRating: null, isOwner: false },
      { isFan: false, viewerRating: null, isOwner: false },
    ]);
  });
});
