import type { AuthUser } from "@/lib/auth";
import type { StationGenre } from "@/lib/genres";
import type { GuideStation } from "@/lib/guide";

export type MobileStation = {
  id: string;
  token: string;
  stationKind: "TV" | "RADIO";
  playbackKind: "SCHEDULED_TV" | "CONTINUOUS_RADIO" | "PERSONALIZED_WEATHER";
  name: string;
  description: string;
  ownerName: string;
  genreId: string;
  genreName: string;
  online: boolean;
  explicit: boolean;
  viewerCount: number;
  fanCount: number;
  ratingAverage: number;
  ratingCount: number;
  lastChatAt: string | null;
  createdAt: string;
  artworkUrl: string | null;
  stationUrl: string;
  chatUrl: string;
  nowPlaying: { title: string; artist: string } | null;
  isFeatured: boolean;
  isFan: boolean;
  viewerRating: number | null;
  isOwner: boolean;
};

export type MobileHomeSection = {
  id: "featured" | "fans" | "recent" | "popular" | "tv" | "radio" | `genre:${string}`;
  kind: "FEATURED" | "FANS" | "RECENT" | "POPULAR" | "TV" | "RADIO" | "GENRE";
  title: string;
  genreId?: string;
  stationIds: string[];
};

export type MobileCatalogV1 = {
  apiVersion: 1;
  generatedAt: string;
  explicitIncluded: boolean;
  genres: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    explicit: boolean;
    stationCount: number;
  }>;
  stations: MobileStation[];
  homeSections: MobileHomeSection[];
};

type ExplicitPolicy = Pick<AuthUser, "showExplicitContent" | "explicitAgeAttestedAt"> | null | undefined;

export function mobileExplicitContentAllowed(user: ExplicitPolicy): boolean {
  return Boolean(user?.showExplicitContent && user.explicitAgeAttestedAt);
}

function absolute(origin: string, value: string | null): string | null {
  return value ? new URL(value, `${origin.replace(/\/$/, "")}/`).toString() : null;
}

export function presentMobileStation(station: GuideStation): MobileStation {
  const viewer = new URL(station.watchUrl);
  const token = viewer.pathname.split("/").filter(Boolean).pop() ?? "";
  const root = `/api/public/stations/${encodeURIComponent(token)}`;
  const artwork = station.radioArtworkUrl
    ?? (station.hasLogo ? `${root}/assets/logo` : null)
    ?? (station.previewVideoId && station.previewThumbnailAvailable
      ? `${root}/media/${encodeURIComponent(station.previewVideoId)}/thumbnail.jpg`
      : null)
    ?? (station.hasSlate ? `${root}/assets/slate` : null);

  return {
    id: station.id,
    token,
    stationKind: station.stationKind,
    playbackKind: station.playbackType === "WEATHERSTAR_4000"
      ? "PERSONALIZED_WEATHER"
      : station.stationKind === "RADIO" ? "CONTINUOUS_RADIO" : "SCHEDULED_TV",
    name: station.name,
    description: station.description,
    ownerName: station.ownerName,
    genreId: station.genreId,
    genreName: station.genreName,
    online: station.online,
    explicit: station.explicit,
    viewerCount: station.viewerCount,
    fanCount: station.fanCount,
    ratingAverage: station.ratingAverage,
    ratingCount: station.ratingCount,
    lastChatAt: station.lastChatAt,
    createdAt: station.createdAt,
    artworkUrl: absolute(viewer.origin, artwork),
    stationUrl: absolute(viewer.origin, root) as string,
    chatUrl: absolute(viewer.origin, `${root}/chat/messages`) as string,
    nowPlaying: station.nowPlayingTitle
      ? { title: station.nowPlayingTitle, artist: station.nowPlayingArtist ?? "" }
      : null,
    isFeatured: Boolean(station.isFeatured),
    isFan: station.isFan,
    viewerRating: station.viewerRating,
    isOwner: station.isOwner,
  };
}

export function rankMobileStations(stations: MobileStation[]): MobileStation[] {
  return [...stations].sort((left, right) =>
    Number(right.online) - Number(left.online)
      || right.viewerCount - left.viewerCount
      || right.fanCount - left.fanCount
      || right.ratingAverage - left.ratingAverage
      || right.ratingCount - left.ratingCount
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id));
}

export function buildMobileHomeSections(
  stations: MobileStation[],
  genres: MobileCatalogV1["genres"],
  recentStationIds: string[] = [],
): MobileHomeSection[] {
  const ranked = rankMobileStations(stations);
  const byId = new Set(stations.map((station) => station.id));
  const section = (
    id: MobileHomeSection["id"],
    kind: MobileHomeSection["kind"],
    title: string,
    values: MobileStation[] | string[],
    genreId?: string,
  ): MobileHomeSection => ({
    id,
    kind,
    title,
    ...(genreId ? { genreId } : {}),
    stationIds: values
      .map((value) => typeof value === "string" ? value : value.id)
      .filter((stationId, index, all) => byId.has(stationId) && all.indexOf(stationId) === index)
      .slice(0, 12),
  });

  return [
    section("featured", "FEATURED", "Featured", ranked.filter((station) => station.isFeatured)),
    section("fans", "FANS", "Your fan stations", ranked.filter((station) => station.isFan)),
    section("recent", "RECENT", "Recently tuned", recentStationIds),
    section("popular", "POPULAR", "Popular now", ranked),
    section("tv", "TV", "Television", ranked.filter((station) => station.stationKind === "TV")),
    section("radio", "RADIO", "Radio", ranked.filter((station) => station.stationKind === "RADIO")),
    ...genres.map((genre) => section(
      `genre:${genre.id}`,
      "GENRE",
      genre.name,
      ranked.filter((station) => station.genreId === genre.id),
      genre.id,
    )),
  ];
}

export function buildMobileCatalogV1(
  stations: GuideStation[],
  genres: StationGenre[],
  includeExplicit: boolean,
  generatedAt = new Date().toISOString(),
  recentStationIds: string[] = [],
): MobileCatalogV1 {
  const visible = stations.filter((station) => station.online && (includeExplicit || !station.explicit));
  const counts = new Map<string, number>();
  for (const station of visible) counts.set(station.genreId, (counts.get(station.genreId) ?? 0) + 1);

  const presentedGenres = genres
    .filter((genre) => (includeExplicit || !genre.isExplicit) && (counts.get(genre.id) ?? 0) > 0)
    .map((genre) => ({
      id: genre.id,
      slug: genre.slug,
      name: genre.name,
      description: genre.description,
      explicit: genre.isExplicit,
      stationCount: counts.get(genre.id) ?? 0,
    }));
  const presentedStations = visible.map(presentMobileStation);

  return {
    apiVersion: 1,
    generatedAt,
    explicitIncluded: includeExplicit,
    genres: presentedGenres,
    stations: presentedStations,
    homeSections: buildMobileHomeSections(presentedStations, presentedGenres, recentStationIds),
  };
}
