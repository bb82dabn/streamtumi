import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/env", () => ({ env: () => ({ GUIDE_CATALOG_CACHE_SECONDS: 0, APP_URL: "https://stream.example" }) }));
vi.mock("@/lib/presence", () => ({ viewerCounts: vi.fn(async () => ({})) }));
vi.mock("@/lib/stations", () => ({ viewerUrl: () => "/watch/weather" }));
vi.mock("@/lib/schedule-publication", () => ({ promoteAllDueStations: vi.fn(async () => []) }));
vi.mock("@/lib/guide-preview", () => ({ resolveGuidePreview: vi.fn(() => ({ item: null, offsetMs: 0 })) }));

import { loadPublicGuideCatalog } from "@/lib/guide";
import { resetGuideCatalogCache } from "@/lib/guide-catalog-cache";

function row(playbackType: "conventional" | "WEATHERSTAR_4000", activeScheduleId: string | null) {
  return {
    id: playbackType, playback_type: playbackType,
    station_kind: "TV", owner_id: "owner",
    name: playbackType, description: "", owner_name: "Owner", genre_id: "weather", genre_name: "Weather",
    mode: "SYNCHRONIZED", broadcast_state: "RUNNING", active_schedule_id: activeScheduleId,
    active_clock_release_id: null, schedule_started_at: null, transition_ms: 0, playback_order: "SEQUENTIAL",
    shuffle_seed: "0", logo_key: null, offline_slate_key: null, access_token_ciphertext: "ciphertext",
    effective_explicit: false, playout_online: false, radio_item_id: null, radio_title: null, radio_artist: null,
    fan_count: 0, rating_average: 0, rating_count: 0, global_average: 3, last_chat_at: null,
    created_at: new Date(0), is_fan: false, viewer_rating: null, is_featured: false,
  };
}

describe("weather stations in the Guide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuideCatalogCache();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations s")) return { rows: [row("WEATHERSTAR_4000", null), row("conventional", null)] };
      return { rows: [] };
    });
  });

  it("shows running weather online without changing unscheduled conventional TV", async () => {
    const stations = await loadPublicGuideCatalog();
    expect(stations.map(({ playbackType, online }) => ({ playbackType, online }))).toEqual([
      { playbackType: "WEATHERSTAR_4000", online: true },
      { playbackType: "conventional", online: false },
    ]);
  });
});
