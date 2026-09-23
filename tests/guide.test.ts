import { describe, expect, it } from "vitest";
import type { GuideStation } from "@/lib/guide";
import { compareGuideStations, weightedRating } from "@/lib/guide-ranking";
import { contentPreferenceSchema, guideQuerySchema, stationRatingSchema, stationSchema, stationUpdateSchema } from "@/lib/validation";

function station(overrides: Partial<GuideStation>): GuideStation {
  return {
    id: "station-a",
    playbackType: "conventional",
    stationKind: "TV",
    name: "Alpha",
    description: "",
    ownerName: "Owner",
    genreId: "00000000-0000-4000-8000-000000000001",
    genreName: "Music",
    mode: "ON_DEMAND",
    broadcastState: "RUNNING",
    online: true,
    hasLogo: false,
    hasSlate: false,
    watchUrl: "https://example.com/watch/token",
    viewerCount: 0,
    fanCount: 0,
    ratingAverage: 0,
    ratingCount: 0,
    weightedRating: 0,
    lastChatAt: null,
    createdAt: "2026-08-15T10:00:00.000Z",
    isFan: false,
    viewerRating: null,
    isOwner: false,
    explicit: false,
    previewVideoId: null,
    previewThumbnailAvailable: false,
    previewOffsetMs: 0,
    radioArtworkUrl: null,
    nowPlayingTitle: null,
    nowPlayingArtist: null,
    ...overrides,
  };
}

describe("Stream Guide ranking", () => {
  it("uses Bayesian weighting so one rating does not dominate established stations", () => {
    const onePerfect = weightedRating(5, 1, 3, 5);
    const established = weightedRating(4.5, 20, 3, 5);
    expect(established).toBeGreaterThan(onePerfect);
  });

  it("sorts live stations before off-air stations, then by viewers", () => {
    const values = [
      station({ id: "offline", name: "Offline", online: false, viewerCount: 100 }),
      station({ id: "small", name: "Small", viewerCount: 3 }),
      station({ id: "large", name: "Large", viewerCount: 20 }),
    ].sort(compareGuideStations("viewers"));
    expect(values.map((value) => value.id)).toEqual(["large", "small", "offline"]);
  });

  it("uses rating count and station name as deterministic tie breakers", () => {
    const values = [
      station({ id: "b", name: "Bravo", weightedRating: 4, ratingCount: 2 }),
      station({ id: "a", name: "Alpha", weightedRating: 4, ratingCount: 4 }),
      station({ id: "c", name: "Charlie", weightedRating: 4, ratingCount: 2 }),
    ].sort(compareGuideStations("rating"));
    expect(values.map((value) => value.id)).toEqual(["a", "b", "c"]);
  });
});

describe("guide validation", () => {
  it("keeps new stations private by default", () => {
    const result = stationSchema.parse({ name: "Test", description: "", transitionMs: 0 });
    expect(result.visibility).toBe("PRIVATE");
  });

  it("does not expose a per-station playback mode", () => {
    expect(() => stationSchema.parse({ name: "Test", mode: "ON_DEMAND" })).toThrow();
    expect(() => stationUpdateSchema.parse({ mode: "ON_DEMAND", description: "Updated" })).toThrow();
  });

  it("does not apply creation defaults to partial station updates", () => {
    expect(stationUpdateSchema.parse({ visibility: "PUBLIC" })).toEqual({ visibility: "PUBLIC" });
  });

  it("accepts only 1 through 5 star ratings", () => {
    expect(stationRatingSchema.parse({ rating: 5 }).rating).toBe(5);
    expect(() => stationRatingSchema.parse({ rating: 0 })).toThrow();
    expect(() => stationRatingSchema.parse({ rating: 6 })).toThrow();
  });

  it("normalizes Guide query defaults and on-air filtering", () => {
    expect(guideQuerySchema.parse({})).toMatchObject({ q: "", type: "all", sort: "viewers", onAir: false, page: 1 });
    expect(guideQuerySchema.parse({ type: "radio", onAir: "true", sort: "fans", page: "2" })).toMatchObject({ type: "radio", onAir: true, sort: "fans", page: 2 });
  });

  it("requires adult confirmation before explicit discovery is enabled", () => {
    expect(() => contentPreferenceSchema.parse({ showExplicitContent: true })).toThrow();
    expect(contentPreferenceSchema.parse({ showExplicitContent: true, confirmAdult: true })).toMatchObject({ showExplicitContent: true });
    expect(contentPreferenceSchema.parse({ showExplicitContent: false })).toMatchObject({ showExplicitContent: false });
  });
});
