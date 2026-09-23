import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  optionalMobileAuth: vi.fn(),
  listGenres: vi.fn(),
  loadGuideCatalog: vi.fn(),
  recentTuneStationIds: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/mobile-auth", () => ({ optionalMobileAuth: mocks.optionalMobileAuth }));
vi.mock("@/lib/genres", () => ({ listGenres: mocks.listGenres }));
vi.mock("@/lib/guide", () => ({ loadGuideCatalog: mocks.loadGuideCatalog }));
vi.mock("@/lib/tune-history", () => ({ recentTuneStationIds: mocks.recentTuneStationIds }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { GET } from "@/app/api/mobile/v1/catalog/route";

const station = {
  id: "station",
  playbackType: "conventional" as const,
  stationKind: "TV" as const,
  name: "Station",
  description: "Description",
  ownerName: "Owner",
  genreId: "genre",
  genreName: "Genre",
  mode: "SYNCHRONIZED" as const,
  broadcastState: "RUNNING" as const,
  online: true,
  hasLogo: false,
  hasSlate: false,
  watchUrl: "https://example.test/watch/token",
  viewerCount: 0,
  fanCount: 0,
  ratingAverage: 0,
  ratingCount: 0,
  weightedRating: 0,
  lastChatAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
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
  isFeatured: false,
};

const genre = {
  id: "genre",
  slug: "genre",
  name: "Genre",
  description: "Description",
  active: true,
  isExplicit: false,
  stationCount: 1,
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("GET /api/mobile/v1/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.optionalMobileAuth.mockResolvedValue(null);
    mocks.loadGuideCatalog.mockResolvedValue([station]);
    mocks.listGenres.mockResolvedValue([genre]);
    mocks.recentTuneStationIds.mockResolvedValue([]);
  });

  it("ignores query adult booleans for anonymous callers", async () => {
    const request = new Request("https://example.test/api/mobile/v1/catalog?includeExplicit=true&adultAttested=true");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toMatchObject({ apiVersion: 1, explicitIncluded: false });
    expect(mocks.loadGuideCatalog).toHaveBeenCalledWith(undefined, false);
    expect(mocks.listGenres).toHaveBeenCalledWith(true);
    expect(mocks.recentTuneStationIds).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledWith(request, "mobile-v1-catalog", 60, 60);
  });

  it("does not include explicit content for an unattested preference", async () => {
    mocks.optionalMobileAuth.mockResolvedValue({
      token: "token",
      user: { id: "user", showExplicitContent: true, explicitAgeAttestedAt: null },
    });

    const response = await GET(new Request("https://example.test/api/mobile/v1/catalog?includeExplicit=true"));
    expect((await response.json()).explicitIncluded).toBe(false);
    expect(mocks.loadGuideCatalog).toHaveBeenCalledWith("user", false);
  });

  it("includes explicit content only from authenticated persisted policy", async () => {
    mocks.optionalMobileAuth.mockResolvedValue({
      token: "token",
      user: { id: "user", showExplicitContent: true, explicitAgeAttestedAt: "2026-08-18T00:00:00.000Z" },
    });

    const response = await GET(new Request("https://example.test/api/mobile/v1/catalog?includeExplicit=false"));
    expect((await response.json()).explicitIncluded).toBe(true);
    expect(mocks.loadGuideCatalog).toHaveBeenCalledWith("user", true);
  });

  it("loads personalized engagement and recent history only from bearer identity", async () => {
    mocks.optionalMobileAuth.mockResolvedValue({
      token: "token",
      user: { id: "user", showExplicitContent: false, explicitAgeAttestedAt: null },
    });
    mocks.recentTuneStationIds.mockResolvedValue(["station"]);

    const response = await GET(new Request("https://example.test/api/mobile/v1/catalog?isFan=true", {
      headers: { Authorization: `Bearer ${"A".repeat(43)}` },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.optionalMobileAuth).toHaveBeenCalled();
    expect(mocks.loadGuideCatalog).toHaveBeenCalledWith("user", false);
    expect(mocks.recentTuneStationIds).toHaveBeenCalledWith("user");
    expect(body.homeSections.find((section: { kind: string }) => section.kind === "RECENT").stationIds)
      .toEqual(["station"]);
  });
});
