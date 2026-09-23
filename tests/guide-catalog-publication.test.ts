import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  query: vi.fn(),
  promoteAllDueStations: vi.fn(),
  resolveGuidePreview: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/env", () => ({ env: () => ({ GUIDE_CATALOG_CACHE_SECONDS: 0, APP_URL: "https://stream.example" }) }));
vi.mock("@/lib/presence", () => ({ viewerCounts: vi.fn(async () => ({})) }));
vi.mock("@/lib/stations", () => ({ viewerUrl: () => "/watch/example" }));
vi.mock("@/lib/schedule-publication", () => ({
  promoteAllDueStations: mocks.promoteAllDueStations,
}));
vi.mock("@/lib/guide-preview", () => ({ resolveGuidePreview: mocks.resolveGuidePreview }));

import { loadPublicGuideCatalog } from "@/lib/guide";
import { resetGuideCatalogCache } from "@/lib/guide-catalog-cache";

describe("Guide schedule publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuideCatalogCache();
    mocks.order.length = 0;
    mocks.promoteAllDueStations.mockImplementation(async () => { mocks.order.push("promote"); return []; });
    mocks.resolveGuidePreview.mockReturnValue({ item: null, offsetMs: 0 });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations s")) {
        mocks.order.push("catalog");
        return { rows: [{
           id: "station", owner_id: "owner", name: "Station", description: "", owner_name: "Owner",
           playback_type: "conventional", station_kind: "TV", is_featured: false,
          genre_id: "genre", genre_name: "Music", mode: "SYNCHRONIZED", broadcast_state: "RUNNING",
          active_schedule_id: "schedule", schedule_started_at: new Date(0), transition_ms: 500,
          playback_order: "SHUFFLE", shuffle_seed: "1234", logo_key: null, offline_slate_key: null,
          access_token_ciphertext: "ciphertext", effective_explicit: false, fan_count: 0,
          rating_average: 0, rating_count: 0, global_average: 3, last_chat_at: null,
          created_at: new Date(0), is_fan: false, viewer_rating: null,
        }] };
      }
      if (sql.includes("FROM schedule_items")) return { rows: [] };
      return { rows: [] };
    });
  });

  it("promotes due schedules and previews immutable active schedule settings", async () => {
    await loadPublicGuideCatalog();
    expect(mocks.order).toEqual(["promote", "catalog"]);
    expect(mocks.resolveGuidePreview).toHaveBeenCalledWith(
      true,
      new Date(0),
      500,
      [],
      expect.any(Number),
      "SHUFFLE",
      "1234",
    );
    expect(String(mocks.query.mock.calls[0][0])).toMatch(/LEFT JOIN schedules a/);
  });
});
