import type { AuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { viewerCounts } from "@/lib/presence";
import type { PublicStation } from "@/lib/public-access";
import { viewerUrl } from "@/lib/stations";
import { compareGuideStations, weightedRating } from "@/lib/guide-ranking";
import { resolveGuidePreview } from "@/lib/guide-preview";
import { promoteAllDueStations } from "@/lib/schedule-publication";
import { invalidateGuideCatalogCache, readGuideCatalogCache } from "@/lib/guide-catalog-cache";
import type { PlaybackOrder } from "@/lib/schedule";
import type { StationKind } from "@/lib/station-kind";

export type GuideSort = "viewers" | "rating" | "fans" | "chat" | "newest" | "name" | "genre";
export type GuideFilters = { q: string; type: "all" | "tv" | "radio"; genre?: string; sort: GuideSort; onAir: boolean; page: number };

export type GuideStation = {
  id: string;
  playbackType: "conventional" | "WEATHERSTAR_4000";
  stationKind: StationKind;
  name: string;
  description: string;
  ownerName: string;
  genreId: string;
  genreName: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  broadcastState: "RUNNING" | "STOPPED";
  online: boolean;
  hasLogo: boolean;
  hasSlate: boolean;
  watchUrl: string;
  viewerCount: number;
  fanCount: number;
  ratingAverage: number;
  ratingCount: number;
  weightedRating: number;
  lastChatAt: string | null;
  createdAt: string;
  isFan: boolean;
  viewerRating: number | null;
  isOwner: boolean;
  explicit: boolean;
  previewVideoId: string | null;
  previewThumbnailAvailable: boolean;
  previewOffsetMs: number;
  radioArtworkUrl: string | null;
  nowPlayingTitle: string | null;
  nowPlayingArtist: string | null;
  isFeatured?: boolean;
};

export type GuideData = {
  stations: GuideStation[];
  fanStations: GuideStation[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export function filterFanStations(stations: GuideStation[], type: GuideFilters["type"]): GuideStation[] {
  return stations.filter((station) => station.isFan && (type === "all" || station.stationKind === type.toUpperCase()));
}

type GuideRow = {
  id: string;
  playback_type: "conventional" | "WEATHERSTAR_4000";
  station_kind: StationKind;
  owner_id: string;
  name: string;
  description: string;
  owner_name: string;
  genre_id: string;
  genre_name: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  broadcast_state: "RUNNING" | "STOPPED";
  active_schedule_id: string | null;
  active_clock_release_id: string | null;
  logo_key: string | null;
  offline_slate_key: string | null;
  access_token_ciphertext: string;
  fan_count: number;
  rating_average: number;
  rating_count: number;
  global_average: number;
  last_chat_at: Date | null;
  created_at: Date;
  is_fan: boolean;
  viewer_rating: number | null;
  schedule_started_at: Date | null;
  transition_ms: number;
  playback_order: PlaybackOrder;
  shuffle_seed: string;
  effective_explicit: boolean;
  playout_online: boolean;
  radio_item_id: string | null;
  radio_title: string | null;
  radio_artist: string | null;
  is_featured: boolean;
};

type GuideScheduleItem = {
  schedule_id: string;
  video_id: string;
  duration_ms: string;
  position: number;
  thumbnail_key: string | null;
};

const PAGE_SIZE = 24;

type CatalogEntry = { station: GuideStation; ownerId: string };

async function catalogEntries(includeExplicit: boolean): Promise<CatalogEntry[]> {
  const result = await query<GuideRow>(
    `SELECT s.id, s.owner_id, s.name, s.description, COALESCE(s.playback_type, 'conventional') AS playback_type,
            s.station_kind, s.is_featured, u.display_name AS owner_name,
            g.id AS genre_id, g.name AS genre_name, s.mode, s.broadcast_state,
             s.active_schedule_id, s.active_clock_release_id, s.schedule_started_at,
            COALESCE(a.transition_ms, s.transition_ms) AS transition_ms,
            COALESCE(a.playback_order, 'SEQUENTIAL'::station_playback_order) AS playback_order,
            COALESCE(a.shuffle_seed, 0)::text AS shuffle_seed,
            s.logo_key, s.offline_slate_key, s.access_token_ciphertext,
             (s.owner_declared_explicit OR s.explicit_enforced_at IS NOT NULL OR g.is_explicit) AS effective_explicit,
              CASE WHEN s.radio_delivery_mode = 'STATIC_HLS' THEN (
                EXISTS (
                  SELECT 1 FROM clock_timeline_items timeline
                  JOIN radio_timeline_delivery delivery ON delivery.timeline_item_id = timeline.id
                   WHERE timeline.release_id = s.active_clock_release_id
                     AND timeline.starts_at <= now() AND timeline.ends_at > now()
                )
              ) ELSE EXISTS (
                SELECT 1 FROM radio_playout_state ps JOIN radio_playout_sessions session ON session.id = ps.active_session_id
                 WHERE ps.station_id = s.id AND ps.status = 'RUNNING' AND ps.heartbeat_at > now() - interval '30 seconds'
                   AND ps.audio_manifest_at > now() - interval '15 seconds'
                   AND ps.waveform_manifest_at > now() - interval '15 seconds'
                   AND session.status = 'ACTIVE' AND session.lease_fence = ps.lease_fence
              ) END AS playout_online,
             radio_item.id::text AS radio_item_id, radio_item.title AS radio_title, radio_item.artist AS radio_artist,
            (SELECT count(*)::int FROM station_fans f WHERE f.station_id = s.id) AS fan_count,
            (SELECT COALESCE(avg(r.rating), 0)::float8 FROM station_ratings r WHERE r.station_id = s.id) AS rating_average,
            (SELECT count(*)::int FROM station_ratings r WHERE r.station_id = s.id) AS rating_count,
            (SELECT COALESCE(avg(r.rating), 3)::float8 FROM station_ratings r) AS global_average,
            (SELECT max(m.created_at) FROM chat_messages m WHERE m.station_id = s.id AND m.hidden_at IS NULL) AS last_chat_at,
            s.created_at,
            EXISTS (SELECT 1 FROM station_fans f WHERE f.station_id = s.id AND f.user_id = $1::uuid) AS is_fan,
            (SELECT r.rating::int FROM station_ratings r WHERE r.station_id = s.id AND r.user_id = $1::uuid) AS viewer_rating
       FROM stations s
       JOIN users u ON u.id = s.owner_id
        JOIN station_genres g ON g.id = s.genre_id
         LEFT JOIN schedules a ON a.id = s.active_schedule_id
        LEFT JOIN LATERAL (
          SELECT timeline.id, item.title, item.artist
            FROM clock_timeline_items timeline
            JOIN clock_release_items item ON item.id = timeline.release_item_id
           WHERE timeline.release_id = s.active_clock_release_id
             AND timeline.starts_at <= now() AND timeline.ends_at > now()
           ORDER BY timeline.starts_at DESC LIMIT 1
        ) radio_item ON s.station_kind = 'RADIO'
       WHERE s.visibility = 'PUBLIC' AND s.access_enabled = true
         AND COALESCE(s.playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')
         AND s.access_password_hash IS NULL
         AND (s.access_expires_at IS NULL OR s.access_expires_at > now())
         AND s.deleted_at IS NULL AND s.moderation_status = 'ACTIVE'
         AND ($2::boolean OR NOT (s.owner_declared_explicit OR s.explicit_enforced_at IS NOT NULL OR g.is_explicit))
      ORDER BY s.id`,
    [null, includeExplicit],
  );
  const scheduleIds = result.rows.map((row) => row.active_schedule_id).filter((value): value is string => Boolean(value));
  const scheduleItems = scheduleIds.length ? await query<GuideScheduleItem>(
    `SELECT schedule_id, video_id, duration_ms::text, position, thumbnail_key
       FROM schedule_items WHERE schedule_id = ANY($1::uuid[]) ORDER BY schedule_id, position`,
    [scheduleIds],
  ) : { rows: [] as GuideScheduleItem[] };
  const bySchedule = new Map<string, GuideScheduleItem[]>();
  for (const item of scheduleItems.rows) bySchedule.set(item.schedule_id, [...(bySchedule.get(item.schedule_id) ?? []), item]);
  const counts = await viewerCounts(result.rows.map((row) => row.id));
  const now = Date.now();
  return result.rows.map((row) => {
     const items = row.active_schedule_id ? bySchedule.get(row.active_schedule_id) ?? [] : [];
     const online = row.broadcast_state === "RUNNING" && (
       row.playback_type === "WEATHERSTAR_4000"
         || (row.station_kind === "RADIO" ? row.playout_online : Boolean(row.active_schedule_id))
     );
     const resolvedPreview = resolveGuidePreview(
      online,
      row.schedule_started_at,
      row.transition_ms,
      items,
      now,
      row.playback_order,
      row.shuffle_seed,
    );
    const preview = resolvedPreview.item;
    const previewOffsetMs = resolvedPreview.offsetMs;
    const watchUrl = viewerUrl(row.access_token_ciphertext, row.station_kind);
    const token = watchUrl.split("?")[0].split("/").filter(Boolean).pop() ?? "";
    const station: GuideStation = {
     id: row.id,
     playbackType: row.playback_type,
    stationKind: row.station_kind,
    name: row.name,
    description: row.description,
    ownerName: row.owner_name,
    genreId: row.genre_id,
    genreName: row.genre_name,
    mode: row.mode,
    broadcastState: row.broadcast_state,
    online,
    hasLogo: Boolean(row.logo_key),
    hasSlate: Boolean(row.offline_slate_key),
    watchUrl,
    viewerCount: counts[row.id] ?? 0,
    fanCount: row.fan_count,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,
    weightedRating: weightedRating(row.rating_average, row.rating_count, row.global_average),
    lastChatAt: row.last_chat_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    isFan: false,
    viewerRating: null,
    isOwner: false,
    explicit: row.effective_explicit,
    previewVideoId: preview?.video_id ?? null,
    previewThumbnailAvailable: Boolean(preview?.thumbnail_key),
    previewOffsetMs,
    radioArtworkUrl: row.radio_item_id ? `/api/public/stations/${token}/radio/items/${row.radio_item_id}/artwork` : null,
     nowPlayingTitle: row.radio_title,
     nowPlayingArtist: row.radio_artist,
    isFeatured: Boolean(row.is_featured),
  };
    return { station, ownerId: row.owner_id };
  });
}

async function personalization(userId: string, stationIds: string[]): Promise<{ fans: Set<string>; ratings: Map<string, number> }> {
  if (!stationIds.length) return { fans: new Set(), ratings: new Map() };
  const [fans, ratings] = await Promise.all([
    query<{ station_id: string }>(
      `SELECT station_id FROM station_fans WHERE user_id = $1 AND station_id = ANY($2::uuid[])`,
      [userId, stationIds],
    ),
    query<{ station_id: string; rating: number }>(
      `SELECT station_id, rating::int AS rating FROM station_ratings WHERE user_id = $1 AND station_id = ANY($2::uuid[])`,
      [userId, stationIds],
    ),
  ]);
  return {
    fans: new Set(fans.rows.map((row) => row.station_id)),
    ratings: new Map(ratings.rows.map((row) => [row.station_id, Number(row.rating)])),
  };
}

async function catalog(userId?: string, includeExplicit = false): Promise<GuideStation[]> {
  const promoted = await promoteAllDueStations();
  if (promoted.length > 0) invalidateGuideCatalogCache();
  const entries = await readGuideCatalogCache(
    `catalog:${includeExplicit ? "explicit" : "safe"}`,
    () => catalogEntries(includeExplicit),
  );
  if (!userId) return entries.map((entry) => entry.station);
  const { fans, ratings } = await personalization(userId, entries.map((entry) => entry.station.id));
  return entries.map(({ station, ownerId }) => ({
    ...station,
    isFan: fans.has(station.id),
    viewerRating: ratings.get(station.id) ?? null,
    isOwner: ownerId === userId,
  }));
}

export async function loadGuideCatalog(userId?: string, includeExplicit = false): Promise<GuideStation[]> {
  return catalog(userId, includeExplicit);
}

export async function loadPublicGuideCatalog(includeExplicit = false): Promise<GuideStation[]> {
  return loadGuideCatalog(undefined, includeExplicit);
}

export async function loadGuide(filters: GuideFilters, userId?: string, includeExplicit = false): Promise<GuideData> {
  const all = await catalog(userId, includeExplicit);
  const queryText = filters.q.toLocaleLowerCase();
  const filtered = all.filter((station) => {
    if (filters.type !== "all" && station.stationKind !== filters.type.toUpperCase()) return false;
    if (filters.genre && station.genreId !== filters.genre) return false;
    if (filters.onAir && !station.online) return false;
    return !queryText || [station.name, station.description, station.ownerName, station.genreName]
      .some((value) => value.toLocaleLowerCase().includes(queryText));
  }).sort(compareGuideStations(filters.sort));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  return {
    stations: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    fanStations: filterFanStations(all, filters.type).sort(compareGuideStations("viewers")).slice(0, 12),
    total: filtered.length,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
  };
}

export async function stationEngagement(stationId: string, userId?: string) {
  const result = await query<{
    fan_count: number;
    rating_average: number;
    rating_count: number;
    is_fan: boolean;
    viewer_rating: number | null;
  }>(
    `SELECT
       (SELECT count(*)::int FROM station_fans WHERE station_id = $1) AS fan_count,
       (SELECT COALESCE(avg(rating), 0)::float8 FROM station_ratings WHERE station_id = $1) AS rating_average,
       (SELECT count(*)::int FROM station_ratings WHERE station_id = $1) AS rating_count,
       EXISTS (SELECT 1 FROM station_fans WHERE station_id = $1 AND user_id = $2::uuid) AS is_fan,
       (SELECT rating::int FROM station_ratings WHERE station_id = $1 AND user_id = $2::uuid) AS viewer_rating`,
    [stationId, userId ?? null],
  );
  const row = result.rows[0];
  return {
    fanCount: row.fan_count,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,
    isFan: row.is_fan,
    viewerRating: row.viewer_rating,
  };
}

function assertCanEngage(station: PublicStation, user: AuthUser): void {
  if (station.visibility !== "PUBLIC") throw new HttpError(409, "Only public stations can receive fans and ratings.", "STATION_PRIVATE");
  if (station.owner_id === user.id) throw new HttpError(409, "Station owners cannot fan or rate their own station.", "OWNER_ENGAGEMENT");
}

export async function becomeFan(station: PublicStation, user: AuthUser): Promise<void> {
  assertCanEngage(station, user);
  await query("INSERT INTO station_fans (user_id, station_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.id, station.id]);
}

export async function stopBeingFan(station: PublicStation, user: AuthUser): Promise<void> {
  assertCanEngage(station, user);
  await query("DELETE FROM station_fans WHERE user_id = $1 AND station_id = $2", [user.id, station.id]);
}

export async function rateStation(station: PublicStation, user: AuthUser, rating: number): Promise<void> {
  assertCanEngage(station, user);
  await query(
    `INSERT INTO station_ratings (user_id, station_id, rating) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, station_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = now()`,
    [user.id, station.id, rating],
  );
}

export async function clearStationRating(station: PublicStation, user: AuthUser): Promise<void> {
  assertCanEngage(station, user);
  await query("DELETE FROM station_ratings WHERE user_id = $1 AND station_id = $2", [user.id, station.id]);
}
