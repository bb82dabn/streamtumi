import { z } from "zod";
import type { StationGenre } from "@/lib/genres";
import type { GuideStation } from "@/lib/guide";

const queryBoolean = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

export const rokuCatalogQuerySchema = z.object({
  includeExplicit: queryBoolean,
  adultAttested: queryBoolean,
}).superRefine((value, context) => {
  if (value.includeExplicit && !value.adultAttested) {
    context.addIssue({
      code: "custom",
      path: ["adultAttested"],
      message: "Adult confirmation is required to include explicit stations.",
    });
  }
});

export type RokuStation = {
  id: string;
  token: string;
  name: string;
  description: string;
  ownerName: string;
  genreId: string;
  genreName: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  broadcastState: "RUNNING" | "STOPPED";
  online: boolean;
  explicit: boolean;
  viewerCount: number;
  fanCount: number;
  ratingAverage: number;
  ratingCount: number;
  lastChatAt: string | null;
  createdAt: string;
  artworkUrl: string | null;
  logoUrl: string | null;
  slateUrl: string | null;
  thumbnailUrl: string | null;
  stationUrl: string;
  chatUrl: string;
};

export type PublicGuideCard = {
  token: string;
  stationName: string;
  genreName: string;
  ownerName: string;
  hasSlate: boolean;
  hasLogo: boolean;
  previewVideoId: string | null;
  previewThumbnailAvailable: boolean;
  online: boolean;
};

export type RokuCatalog = {
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
  stations: RokuStation[];
};

function tokenFromWatchUrl(watchUrl: string): string {
  return new URL(watchUrl).pathname.split("/").filter(Boolean).pop() ?? "";
}

function publicUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/$/, "")}/`).toString();
}

function decodeGuideText(value: string): string {
  return value
    .replace(/\\+u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parsePublicGuideCards(html: string): PublicGuideCard[] {
  const normalized = html.replace(/\\"/g, '"');
  const owners = new Map<string, string>();
  for (const match of normalized.matchAll(/<article class="guide-card">([\s\S]*?)<\/article>/g)) {
    const body = match[1];
    const token = body.match(/href="\/watch\/([^"?]+)"/)?.[1];
    const owner = body.match(/class="guide-owner">by (?:<!-- -->)?([^<]+)/)?.[1];
    if (token && owner) owners.set(token, decodeGuideText(owner.trim()));
  }

  const cards: PublicGuideCard[] = [];
  const seen = new Set<string>();
  const pattern = /"token":"([^"]+)","stationName":"([^"]+)","genreName":"([^"]+)","hasSlate":(true|false),"hasLogo":(true|false),"previewVideoId":(null|"([^"]+)"),"previewThumbnailAvailable":(true|false),"previewOffsetMs":[^,]+,"online":(true|false)/g;
  for (const match of normalized.matchAll(pattern)) {
    const token = match[1];
    if (seen.has(token)) continue;
    seen.add(token);
    cards.push({
      token,
      stationName: decodeGuideText(match[2]),
      genreName: decodeGuideText(match[3]),
      ownerName: owners.get(token) ?? "StreamTumi creator",
      hasSlate: match[4] === "true",
      hasLogo: match[5] === "true",
      previewVideoId: match[6] === "null" ? null : match[7],
      previewThumbnailAvailable: match[8] === "true",
      online: match[9] === "true",
    });
  }
  return cards;
}

export function presentRokuStation(station: GuideStation, origin: string): RokuStation {
  const token = tokenFromWatchUrl(station.watchUrl);
  const root = `/api/public/stations/${encodeURIComponent(token)}`;
  const logoUrl = station.hasLogo ? publicUrl(origin, `${root}/assets/logo`) : null;
  const slateUrl = station.hasSlate ? publicUrl(origin, `${root}/assets/slate`) : null;
  const thumbnailUrl = station.previewVideoId && station.previewThumbnailAvailable
    ? publicUrl(origin, `${root}/media/${encodeURIComponent(station.previewVideoId)}/thumbnail.jpg`)
    : null;

  return {
    id: station.id,
    token,
    name: station.name,
    description: station.description,
    ownerName: station.ownerName,
    genreId: station.genreId,
    genreName: station.genreName,
    mode: station.mode,
    broadcastState: station.broadcastState,
    online: station.online,
    explicit: station.explicit,
    viewerCount: station.viewerCount,
    fanCount: station.fanCount,
    ratingAverage: station.ratingAverage,
    ratingCount: station.ratingCount,
    lastChatAt: station.lastChatAt,
    createdAt: station.createdAt,
    artworkUrl: logoUrl ?? thumbnailUrl ?? slateUrl,
    logoUrl,
    slateUrl,
    thumbnailUrl,
    stationUrl: publicUrl(origin, root),
    chatUrl: publicUrl(origin, `${root}/chat/messages`),
  };
}

type PublicStationDetail = {
  station?: {
    name?: string;
    description?: string;
    mode?: "ON_DEMAND" | "SYNCHRONIZED";
    broadcastState?: "RUNNING" | "STOPPED";
    explicit?: boolean;
    playbackKind?: "SCHEDULED_TV" | "CONTINUOUS_RADIO" | "PERSONALIZED_WEATHER";
  };
  online?: boolean;
  playlist?: Array<{ id?: string; thumbnailUrl?: string | null }>;
  position?: { index?: number } | null;
};

export async function loadCanonicalRokuStations(
  origin: string,
  genres: StationGenre[],
): Promise<RokuStation[]> {
  const baseOrigin = new URL(origin).origin;

  const guideResponse = await fetch(publicUrl(baseOrigin, "/guide"), {
    cache: "no-store",
    headers: { Accept: "text/html", "User-Agent": "StreamTumi-Roku-Catalog/1.0" },
  });
  if (!guideResponse.ok) throw new Error(`Canonical Guide returned ${guideResponse.status}.`);
  const cards = parsePublicGuideCards(await guideResponse.text());
  const stations = (await Promise.all(cards.filter((card) => card.online).map(async (card): Promise<RokuStation | null> => {
    const root = `/api/public/stations/${encodeURIComponent(card.token)}`;
    const detailResponse = await fetch(publicUrl(baseOrigin, root), {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "StreamTumi-Roku-Catalog/1.0" },
    });
    if (!detailResponse.ok) return null;
    const detail = await detailResponse.json() as PublicStationDetail;
    if (!detail.station) return null;
    const online = detail.online ?? card.online;
    if (!online) return null;
    const genre = genres.find((item) => item.name.toLocaleLowerCase() === card.genreName.toLocaleLowerCase());
    const currentIndex = detail.position?.index ?? 0;
    const currentItem = detail.playlist?.[currentIndex] ?? detail.playlist?.[0];
    const previewVideoId = card.previewVideoId ?? currentItem?.id ?? null;
    const thumbnailPath = currentItem?.thumbnailUrl
      ?? (previewVideoId ? `${root}/media/${encodeURIComponent(previewVideoId)}/thumbnail.jpg` : null);
    const logoUrl = card.hasLogo ? publicUrl(baseOrigin, `${root}/assets/logo`) : null;
    const slateUrl = card.hasSlate ? publicUrl(baseOrigin, `${root}/assets/slate`) : null;
    const thumbnailUrl = thumbnailPath ? publicUrl(baseOrigin, thumbnailPath) : null;
    const genreSlug = card.genreName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "public";

    return {
      id: `canonical-${card.token}`,
      token: card.token,
      name: detail.station.name ?? card.stationName,
      description: detail.station.description ?? "",
      ownerName: card.ownerName,
      genreId: genre?.id ?? `canonical-${genreSlug}`,
      genreName: card.genreName,
      mode: detail.station.mode ?? "ON_DEMAND",
      broadcastState: detail.station.broadcastState ?? (card.online ? "RUNNING" : "STOPPED"),
      online,
      explicit: detail.station.explicit ?? false,
      viewerCount: 0,
      fanCount: 0,
      ratingAverage: 0,
      ratingCount: 0,
      lastChatAt: null,
      createdAt: new Date().toISOString(),
      artworkUrl: logoUrl ?? thumbnailUrl ?? slateUrl,
      logoUrl,
      slateUrl,
      thumbnailUrl,
      stationUrl: publicUrl(baseOrigin, root),
      chatUrl: publicUrl(baseOrigin, `${root}/chat/messages`),
    };
  }))).filter((station): station is RokuStation => station !== null);

  return stations;
}

export function mergeCanonicalRokuStations(catalog: RokuCatalog, canonical: RokuStation[]): RokuCatalog {
  const localByToken = new Map(catalog.stations.map((station) => [station.token, station]));
  const canonicalTokens = new Set(canonical.map((station) => station.token));
  const mergedCanonical = canonical
    .filter((station) => station.online && (catalog.explicitIncluded || !station.explicit))
    .map((station) => {
      const local = localByToken.get(station.token);
      return local ? {
        ...station,
        id: local.id,
        viewerCount: local.viewerCount,
        fanCount: local.fanCount,
        ratingAverage: local.ratingAverage,
        ratingCount: local.ratingCount,
        lastChatAt: local.lastChatAt,
        createdAt: local.createdAt,
      } : station;
    });
  const stations = [...mergedCanonical, ...catalog.stations.filter((station) => station.online && !canonicalTokens.has(station.token))];
  const genres = [...catalog.genres];
  for (const station of stations) {
    if (!genres.some((genre) => genre.id === station.genreId)) {
      genres.push({
        id: station.genreId,
        slug: station.genreId.replace(/^canonical-/, ""),
        name: station.genreName,
        description: "Public StreamTumi stations",
        explicit: station.explicit,
        stationCount: 0,
      });
    }
  }
  for (const genre of genres) genre.stationCount = stations.filter((station) => station.genreId === genre.id).length;
  return { ...catalog, generatedAt: new Date().toISOString(), genres, stations };
}

export function buildRokuCatalog(
  stations: GuideStation[],
  genres: StationGenre[],
  origin: string,
  includeExplicit: boolean,
  generatedAt = new Date().toISOString(),
): RokuCatalog {
  const visibleStations = stations.filter((station) => station.stationKind === "TV"
    && station.online
    && (includeExplicit || !station.explicit));
  const visibleGenres = genres.filter((genre) => includeExplicit || !genre.isExplicit);
  const stationCountByGenre = new Map<string, number>();
  for (const station of visibleStations) {
    stationCountByGenre.set(station.genreId, (stationCountByGenre.get(station.genreId) ?? 0) + 1);
  }

  return {
    apiVersion: 1,
    generatedAt,
    explicitIncluded: includeExplicit,
    genres: visibleGenres.map((genre) => ({
      id: genre.id,
      slug: genre.slug,
      name: genre.name,
      description: genre.description,
      explicit: genre.isExplicit,
      stationCount: stationCountByGenre.get(genre.id) ?? 0,
    })),
    stations: visibleStations.map((station) => presentRokuStation(station, origin)),
  };
}
