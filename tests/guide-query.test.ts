import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/presence", () => ({ viewerCounts: vi.fn(async () => ({})) }));
vi.mock("@/lib/stations", () => ({ viewerUrl: vi.fn(() => "https://stream.example/watch/token") }));
import type { GuideFilters, GuideStation } from "@/lib/guide";
import { filterFanStations } from "@/lib/guide";
import { guideHref, guidePagination, guideTabs, legacyRadioGuideHref, parseGuideQuery, stationResourceUrl } from "@/lib/guide-query";

const genre = "00000000-0000-4000-8000-000000000001";
const filters: GuideFilters = { q: "jazz hour", type: "tv", genre, sort: "fans", onAir: true, page: 4 };

function station(id: string, stationKind: "TV" | "RADIO", isFan = true): GuideStation {
  return {
    id,
    playbackType: "conventional",
    stationKind,
    name: id,
    description: "",
    ownerName: "Owner",
    genreId: genre,
    genreName: "Music",
    mode: "ON_DEMAND",
    broadcastState: "RUNNING",
    online: true,
    hasLogo: true,
    hasSlate: false,
    watchUrl: `https://stream.example/watch/${id}`,
    viewerCount: 0,
    fanCount: 0,
    ratingAverage: 0,
    ratingCount: 0,
    weightedRating: 0,
    lastChatAt: null,
    createdAt: "2026-08-19T00:00:00.000Z",
    isFan,
    viewerRating: null,
    isOwner: false,
    explicit: false,
    previewVideoId: null,
    previewThumbnailAvailable: false,
    previewOffsetMs: 0,
    radioArtworkUrl: null,
    nowPlayingTitle: null,
    nowPlayingArtist: null,
  };
}

describe("canonical Guide queries", () => {
  it("parses every field independently when other fields are invalid", () => {
    expect(parseGuideQuery({ q: " jazz ", type: "invalid", genre, sort: "fans", onAir: "true", page: "bad" })).toEqual({
      q: "jazz",
      type: "all",
      genre,
      sort: "fans",
      onAir: true,
      page: 1,
    });
    expect(parseGuideQuery({ q: ["first", "second"], type: "radio", genre: "invalid", onAir: "false", page: "2" })).toMatchObject({ q: "first", type: "radio", genre: undefined, onAir: false, page: 2 });
  });

  it("omits defaults and preserves filters across tabs while resetting the page", () => {
    expect(guideHref({ q: "", type: "all", sort: "viewers", onAir: false, page: 1 })).toBe("/guide");
    expect(guideHref(filters, { type: "radio", page: 1 })).toBe(`/guide?q=jazz+hour&type=radio&genre=${genre}&sort=fans&onAir=true`);
    expect(guideHref(filters, { type: "all", page: 1 })).toBe(`/guide?q=jazz+hour&genre=${genre}&sort=fans&onAir=true`);
  });

  it("builds navigational All, TV, and Radio tabs with one active tab", () => {
    const tabs = guideTabs(filters);
    expect(tabs.map(({ label }) => label)).toEqual(["All", "TV", "Radio"]);
    expect(tabs.filter(({ current }) => current).map(({ type }) => type)).toEqual(["tv"]);
    expect(tabs.every(({ href }) => !href.includes("page="))).toBe(true);
    expect(tabs[2].href).toContain("type=radio");
    expect(tabs[2].href).toContain("q=jazz+hour");
  });

  it("clears filters without clearing the selected tab", () => {
    expect(guideHref(filters, { q: "", genre: undefined, sort: "viewers", onAir: false, page: 1 })).toBe("/guide?type=tv");
  });

  it("uses non-link pagination boundaries and canonical page hrefs", () => {
    expect(guidePagination(filters, 1, 3)).toEqual({ previous: null, next: expect.stringContaining("page=2") });
    expect(guidePagination(filters, 3, 3)).toEqual({ previous: expect.stringContaining("page=2"), next: null });
  });

  it("redirects the legacy radio Guide while preserving valid filters", () => {
    expect(legacyRadioGuideHref({ q: "news", genre, sort: "name", onAir: "true", page: "3", type: "tv" }))
      .toBe(`/guide?q=news&type=radio&genre=${genre}&sort=name&onAir=true&page=3`);
  });
});

describe("Guide station scoping", () => {
  it("resolves API and preview resources against the station watch origin", () => {
    expect(stationResourceUrl("https://main.example/watch/token", "/api/public/stations/token/assets/logo"))
      .toBe("https://main.example/api/public/stations/token/assets/logo");
    expect(stationResourceUrl("https://main.example/watch/token", "https://legacy-radio.example/api/public/stations/token/thumbnail.jpg"))
      .toBe("https://main.example/api/public/stations/token/thumbnail.jpg");
  });

  it("filters the fan shelf to the active station type", () => {
    const stations = [station("tv", "TV"), station("radio", "RADIO"), station("not-fan", "TV", false)];
    expect(filterFanStations(stations, "all").map((value) => value.id)).toEqual(["tv", "radio"]);
    expect(filterFanStations(stations, "radio").map((value) => value.id)).toEqual(["radio"]);
  });
});
