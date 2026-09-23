import { describe, expect, it } from "vitest";
import type { StationGenre } from "@/lib/genres";
import type { GuideStation } from "@/lib/guide";
import {
  buildMobileHomeSections,
  buildMobileCatalogV1,
  mobileExplicitContentAllowed,
  presentMobileStation,
} from "@/lib/mobile-catalog";

function station(overrides: Partial<GuideStation> = {}): GuideStation {
  return {
    id: "station-tv",
    playbackType: "conventional",
    stationKind: "TV",
    name: "Channel One",
    description: "Independent television",
    ownerName: "Creator",
    genreId: "genre-general",
    genreName: "General",
    mode: "SYNCHRONIZED",
    broadcastState: "RUNNING",
    online: true,
    hasLogo: true,
    hasSlate: true,
    watchUrl: "https://tv.example.test/watch/tv-token",
    viewerCount: 12,
    fanCount: 4,
    ratingAverage: 4.5,
    ratingCount: 2,
    weightedRating: 4.1,
    lastChatAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-17T00:00:00.000Z",
    isFan: false,
    viewerRating: null,
    isOwner: false,
    explicit: false,
    previewVideoId: "video-id",
    previewThumbnailAvailable: true,
    previewOffsetMs: 0,
    radioArtworkUrl: null,
    nowPlayingTitle: null,
    nowPlayingArtist: null,
    isFeatured: false,
    ...overrides,
  };
}

function genre(overrides: Partial<StationGenre> = {}): StationGenre {
  return {
    id: "genre-general",
    slug: "general",
    name: "General",
    description: "General programming",
    active: true,
    isExplicit: false,
    stationCount: 99,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("mobile catalog v1 presenter", () => {
  it("presents TV URLs as absolute URLs on the station's canonical origin", () => {
    expect(presentMobileStation(station())).toMatchObject({
      token: "tv-token",
      stationKind: "TV",
      playbackKind: "SCHEDULED_TV",
      artworkUrl: "https://tv.example.test/api/public/stations/tv-token/assets/logo",
      stationUrl: "https://tv.example.test/api/public/stations/tv-token",
      chatUrl: "https://tv.example.test/api/public/stations/tv-token/chat/messages",
      nowPlaying: null,
      isFeatured: false,
      isFan: false,
      viewerRating: null,
      isOwner: false,
    });
  });

  it("presents Radio as continuous playback with relay artwork and metadata", () => {
    const result = presentMobileStation(station({
      id: "station-radio",
      stationKind: "RADIO",
      watchUrl: "https://audio.example.test/listen/radio-token",
      radioArtworkUrl: "/api/public/stations/radio-token/radio/items/item-id/artwork",
      nowPlayingTitle: "Current Track",
      nowPlayingArtist: "Current Artist",
    }));

    expect(result).toMatchObject({
      token: "radio-token",
      stationKind: "RADIO",
      playbackKind: "CONTINUOUS_RADIO",
      artworkUrl: "https://audio.example.test/api/public/stations/radio-token/radio/items/item-id/artwork",
      stationUrl: "https://audio.example.test/api/public/stations/radio-token",
      nowPlaying: { title: "Current Track", artist: "Current Artist" },
    });
  });

  it("uses thumbnail and slate artwork fallbacks as absolute URLs", () => {
    const thumbnail = presentMobileStation(station({ hasLogo: false }));
    expect(thumbnail.artworkUrl).toBe("https://tv.example.test/api/public/stations/tv-token/media/video-id/thumbnail.jpg");

    const slate = presentMobileStation(station({
      hasLogo: false,
      previewThumbnailAvailable: false,
    }));
    expect(slate.artworkUrl).toBe("https://tv.example.test/api/public/stations/tv-token/assets/slate");

    const none = presentMobileStation(station({
      hasLogo: false,
      hasSlate: false,
      previewThumbnailAvailable: false,
    }));
    expect(none.artworkUrl).toBeNull();
  });

  it("filters offline and explicit stations and reports visible genre counts", () => {
    const explicitGenre = genre({
      id: "genre-explicit",
      slug: "after-hours",
      name: "After Hours",
      isExplicit: true,
    });
    const inputs = [
      station(),
      station({ id: "tv-two", watchUrl: "https://tv.example.test/watch/tv-two" }),
      station({ id: "offline", online: false, broadcastState: "STOPPED" }),
      station({
        id: "explicit",
        genreId: explicitGenre.id,
        genreName: explicitGenre.name,
        explicit: true,
      }),
    ];

    const hidden = buildMobileCatalogV1(inputs, [genre(), explicitGenre], false, "2026-08-18T12:00:00.000Z");
    expect(hidden).toMatchObject({
      apiVersion: 1,
      generatedAt: "2026-08-18T12:00:00.000Z",
      explicitIncluded: false,
    });
    expect(hidden.stations.map((item) => item.id)).toEqual(["station-tv", "tv-two"]);
    expect(hidden.genres).toEqual([expect.objectContaining({ id: "genre-general", stationCount: 2 })]);

    const included = buildMobileCatalogV1(inputs, [genre(), explicitGenre], true);
    expect(included.stations.map((item) => item.id)).toEqual(["station-tv", "tv-two", "explicit"]);
    expect(included.genres).toEqual([
      expect.objectContaining({ id: "genre-general", stationCount: 2 }),
      expect.objectContaining({ id: "genre-explicit", explicit: true, stationCount: 1 }),
    ]);
  });

  it("requires both persisted preference and age attestation for explicit content", () => {
    expect(mobileExplicitContentAllowed(null)).toBe(false);
    expect(mobileExplicitContentAllowed({ showExplicitContent: false, explicitAgeAttestedAt: "2026-08-18T00:00:00.000Z" })).toBe(false);
    expect(mobileExplicitContentAllowed({ showExplicitContent: true, explicitAgeAttestedAt: null })).toBe(false);
    expect(mobileExplicitContentAllowed({ showExplicitContent: true, explicitAgeAttestedAt: "2026-08-18T00:00:00.000Z" })).toBe(true);
  });

  it("builds stable editorial, personalized, format, and genre sections", () => {
    const stations = [
      presentMobileStation(station({ id: "featured", isFeatured: true, isFan: true, viewerCount: 3 })),
      presentMobileStation(station({ id: "popular", watchUrl: "https://tv.example.test/watch/popular", viewerCount: 20 })),
      presentMobileStation(station({ id: "radio", stationKind: "RADIO", watchUrl: "https://radio.example.test/listen/radio", viewerCount: 10 })),
    ];
    const sections = buildMobileHomeSections(stations, [{
      id: "genre-general",
      slug: "general",
      name: "General",
      description: "General programming",
      explicit: false,
      stationCount: 3,
    }], ["radio", "missing", "featured", "radio"]);

    expect(sections.map((section) => section.kind)).toEqual([
      "FEATURED", "FANS", "RECENT", "POPULAR", "TV", "RADIO", "GENRE",
    ]);
    expect(sections.find((section) => section.kind === "FEATURED")?.stationIds).toEqual(["featured"]);
    expect(sections.find((section) => section.kind === "FANS")?.stationIds).toEqual(["featured"]);
    expect(sections.find((section) => section.kind === "RECENT")?.stationIds).toEqual(["radio", "featured"]);
    expect(sections.find((section) => section.kind === "POPULAR")?.stationIds).toEqual(["popular", "radio", "featured"]);
    expect(sections.find((section) => section.kind === "TV")?.stationIds).toEqual(["popular", "featured"]);
    expect(sections.find((section) => section.kind === "RADIO")?.stationIds).toEqual(["radio"]);
    expect(sections.at(-1)).toMatchObject({ id: "genre:genre-general", genreId: "genre-general" });
  });

  it("includes server tune history in the catalog's recent section", () => {
    const catalog = buildMobileCatalogV1(
      [station(), station({ id: "second", watchUrl: "https://tv.example.test/watch/second" })],
      [genre()],
      false,
      "2026-08-18T12:00:00.000Z",
      ["second", "station-tv"],
    );

    expect(catalog.homeSections.find((section) => section.kind === "RECENT")?.stationIds)
      .toEqual(["second", "station-tv"]);
  });

  it("returns only the stable public station allowlist", () => {
    const source = {
      ...station(),
      accessTokenCiphertext: "ciphertext-must-not-leak",
      accessPasswordHash: "hash-must-not-leak",
      internalNote: "private-note",
    };
    const result = presentMobileStation(source);

    expect(Object.keys(result).sort()).toEqual([
      "artworkUrl",
      "chatUrl",
      "createdAt",
      "description",
      "explicit",
      "fanCount",
      "genreId",
      "genreName",
      "id",
      "isFan",
      "isFeatured",
      "isOwner",
      "lastChatAt",
      "name",
      "nowPlaying",
      "online",
      "ownerName",
      "playbackKind",
      "ratingAverage",
      "ratingCount",
      "stationKind",
      "stationUrl",
      "token",
      "viewerCount",
      "viewerRating",
    ]);
    expect(JSON.stringify(result)).not.toContain("ciphertext-must-not-leak");
    expect(JSON.stringify(result)).not.toContain("hash-must-not-leak");
    expect(result).not.toHaveProperty("watchUrl");
    expect(result).toMatchObject({ isFeatured: false, isFan: false, isOwner: false, viewerRating: null });
  });
});
