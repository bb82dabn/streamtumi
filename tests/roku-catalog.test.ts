import { describe, expect, it } from "vitest";
import type { StationGenre } from "@/lib/genres";
import type { GuideStation } from "@/lib/guide";
import {
  buildRokuCatalog,
  mergeCanonicalRokuStations,
  parsePublicGuideCards,
  presentRokuStation,
  rokuCatalogQuerySchema,
} from "@/lib/roku-catalog";

function station(overrides: Partial<GuideStation> = {}): GuideStation {
  return {
    id: "station-a",
    playbackType: "conventional",
    stationKind: "TV",
    name: "Alpha",
    description: "Independent television",
    ownerName: "Owner",
    genreId: "00000000-0000-4000-8000-000000000001",
    genreName: "Entertainment",
    mode: "SYNCHRONIZED",
    broadcastState: "RUNNING",
    online: true,
    hasLogo: true,
    hasSlate: true,
    watchUrl: "https://streamtumi.com/watch/public-token",
    viewerCount: 9,
    fanCount: 4,
    ratingAverage: 4.5,
    ratingCount: 2,
    weightedRating: 4,
    lastChatAt: null,
    createdAt: "2026-08-15T10:00:00.000Z",
    isFan: false,
    viewerRating: null,
    isOwner: false,
    explicit: false,
    previewVideoId: "00000000-0000-4000-8000-000000000010",
    previewThumbnailAvailable: true,
    previewOffsetMs: 0,
    radioArtworkUrl: null,
    nowPlayingTitle: null,
    nowPlayingArtist: null,
    ...overrides,
  };
}

function genre(overrides: Partial<StationGenre> = {}): StationGenre {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "entertainment",
    name: "Entertainment",
    description: "Shows and more",
    active: true,
    isExplicit: false,
    stationCount: 1,
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("Roku catalog", () => {
  it("requires adult attestation before explicit stations are requested", () => {
    expect(() => rokuCatalogQuerySchema.parse({ includeExplicit: "true", adultAttested: "false" })).toThrow();
    expect(rokuCatalogQuerySchema.parse({ includeExplicit: "true", adultAttested: "true" })).toEqual({
      includeExplicit: true,
      adultAttested: true,
    });
  });

  it("presents absolute Roku playback and artwork URLs", () => {
    const result = presentRokuStation(station(), "https://streamtumi.com/");
    expect(result.token).toBe("public-token");
    expect(result.stationUrl).toBe("https://streamtumi.com/api/public/stations/public-token");
    expect(result.chatUrl).toBe("https://streamtumi.com/api/public/stations/public-token/chat/messages");
    expect(result.artworkUrl).toBe("https://streamtumi.com/api/public/stations/public-token/assets/logo");
  });

  it("hides explicit stations and genres by default", () => {
    const explicitGenre = genre({ id: "00000000-0000-4000-8000-000000000002", slug: "late-night", name: "Late Night", isExplicit: true });
    const explicitStation = station({ id: "station-b", genreId: explicitGenre.id, genreName: explicitGenre.name, explicit: true });
    const hidden = buildRokuCatalog([station(), explicitStation], [genre(), explicitGenre], "https://streamtumi.com", false, "2026-08-15T12:00:00.000Z");
    expect(hidden.stations.map((item) => item.id)).toEqual(["station-a"]);
    expect(hidden.genres.map((item) => item.id)).toEqual([genre().id]);

    const shown = buildRokuCatalog([station(), explicitStation], [genre(), explicitGenre], "https://streamtumi.com", true);
    expect(shown.stations).toHaveLength(2);
    expect(shown.genres).toHaveLength(2);
  });

  it("never lists stations that are not currently online", () => {
    const offline = station({ id: "station-offline", online: false, broadcastState: "STOPPED" });
    const catalog = buildRokuCatalog([station(), offline], [genre()], "https://streamtumi.com", true);
    expect(catalog.stations.map((item) => item.id)).toEqual(["station-a"]);
    expect(catalog.genres[0].stationCount).toBe(1);
  });

  it("keeps Radio stations out of the version 1 catalog", () => {
    const radio = station({ id: "station-radio", stationKind: "RADIO", watchUrl: "https://streamtumi.com/listen/radio-token" });
    const catalog = buildRokuCatalog([station(), radio], [genre()], "https://streamtumi.com", true);
    expect(catalog.stations.map((item) => item.id)).toEqual(["station-a"]);
  });

  it("extracts canonical public stations from the server-rendered Guide", () => {
    const html = `<article class="guide-card"><a href="/watch/new-token"></a><p class="guide-owner">by <!-- -->Brian Bouchard<!-- --> · Synchronized</p></article>
      <script>self.__next_f.push([1,"{\\\"token\\\":\\\"new-token\\\",\\\"stationName\\\":\\\"Saturday Morning\\\",\\\"genreName\\\":\\\"Kids \\\\u0026 Family\\\",\\\"hasSlate\\\":false,\\\"hasLogo\\\":false,\\\"previewVideoId\\\":\\\"video-a\\\",\\\"previewThumbnailAvailable\\\":true,\\\"previewOffsetMs\\\":0,\\\"online\\\":true}"])</script>`;
    expect(parsePublicGuideCards(html)).toEqual([expect.objectContaining({
      token: "new-token",
      stationName: "Saturday Morning",
      genreName: "Kids & Family",
      ownerName: "Brian Bouchard",
      online: true,
    })]);
  });

  it("merges newly published canonical stations ahead of stale local data", () => {
    const local = buildRokuCatalog([station()], [genre()], "https://streamtumi.com", false);
    const canonical = presentRokuStation(station({
      id: "station-new",
      name: "Saturday Morning",
      watchUrl: "https://streamtumi.com/watch/new-token",
    }), "https://streamtumi.com");
    const merged = mergeCanonicalRokuStations(local, [canonical]);
    expect(merged.stations.map((item) => item.token)).toEqual(["new-token", "public-token"]);
  });

  it("drops offline canonical entries instead of merging them into the Roku guide", () => {
    const local = buildRokuCatalog([station()], [genre()], "https://streamtumi.com", false);
    const offline = { ...presentRokuStation(station({ watchUrl: "https://streamtumi.com/watch/offline-token" }), "https://streamtumi.com"), online: false };
    expect(mergeCanonicalRokuStations(local, [offline]).stations.map((item) => item.token)).toEqual(["public-token"]);
  });
});
