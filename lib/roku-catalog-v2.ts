import type { StationGenre } from "@/lib/genres";
import type { GuideStation } from "@/lib/guide";

export type RokuV2Station = {
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
};

export type RokuCatalogV2 = {
  apiVersion: 2;
  generatedAt: string;
  explicitIncluded: boolean;
  genres: Array<{ id: string; slug: string; name: string; description: string; explicit: boolean; stationCount: number }>;
  stations: RokuV2Station[];
};

function absolute(origin: string, value: string | null): string | null {
  return value ? new URL(value, `${origin.replace(/\/$/, "")}/`).toString() : null;
}

export function presentRokuV2Station(station: GuideStation, origin: string): RokuV2Station {
  const viewer = new URL(station.watchUrl);
  const token = viewer.pathname.split("/").filter(Boolean).pop() ?? "";
  const root = `/api/public/stations/${encodeURIComponent(token)}`;
  const artwork = station.radioArtworkUrl
    ?? (station.hasLogo ? `${root}/assets/logo` : null)
    ?? (station.previewVideoId && station.previewThumbnailAvailable ? `${root}/media/${encodeURIComponent(station.previewVideoId)}/thumbnail.jpg` : null)
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
    artworkUrl: absolute(origin, artwork),
    stationUrl: absolute(origin, root) as string,
    chatUrl: absolute(origin, `${root}/chat/messages`) as string,
    nowPlaying: station.nowPlayingTitle ? { title: station.nowPlayingTitle, artist: station.nowPlayingArtist ?? "" } : null,
  };
}

export function buildRokuCatalogV2(stations: GuideStation[], genres: StationGenre[], origin: string, includeExplicit: boolean, generatedAt = new Date().toISOString()): RokuCatalogV2 {
  const visible = stations.filter((station) => station.online && (includeExplicit || !station.explicit));
  const counts = new Map<string, number>();
  for (const station of visible) counts.set(station.genreId, (counts.get(station.genreId) ?? 0) + 1);
  return {
    apiVersion: 2,
    generatedAt,
    explicitIncluded: includeExplicit,
    genres: genres.filter((genre) => (includeExplicit || !genre.isExplicit) && (counts.get(genre.id) ?? 0) > 0).map((genre) => ({
      id: genre.id,
      slug: genre.slug,
      name: genre.name,
      description: genre.description,
      explicit: genre.isExplicit,
      stationCount: counts.get(genre.id) ?? 0,
    })),
    stations: visible.map((station) => presentRokuV2Station(station, origin)),
  };
}
