import type { UserRole } from "@/lib/auth";
import type {
  AdminAuditEntry,
  AdminDashboardData,
  AdminOverview,
  AdminRuntimeHealth,
  AdminStation,
  AdminUser,
} from "@/lib/admin-dashboard";
import { query } from "@/lib/db";
import { listGenres } from "@/lib/genres";
import { getTranscodeQueue } from "@/lib/queue";
import { getRedis } from "@/lib/redis";
import { bucket, storage } from "@/lib/storage";

type OverviewRow = {
  total_users: number;
  new_users_7d: number;
  active_stations: number;
  deleted_stations: number;
  live_broadcasts: number;
  unresolved_reports: number;
  retained_source_bytes: string;
  processing_videos: number;
  messages_24h: number;
  processing_median_seconds: number;
  processing_p90_seconds: number;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  version: number;
  updated_at: Date;
  disabled_at: Date | null;
  disabled_reason: string | null;
  must_change_password: boolean;
  deletion_requested_at: Date | null;
  anonymize_after: Date | null;
  anonymized_at: Date | null;
  created_at: Date;
  station_count: number;
  retained_source_bytes: string;
  active_session_count: number;
};

type StationRow = {
  id: string;
  name: string;
  is_featured: boolean;
  owner_email: string;
  owner_display_name: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  access_enabled: boolean;
  broadcast_state: "RUNNING" | "STOPPED";
  moderation_status: "ACTIVE" | "RESTRICTED";
  deleted_at: Date | null;
  video_count: number;
  ready_count: number;
  retained_source_bytes: string;
  updated_at: Date;
  visibility: "PRIVATE" | "PUBLIC";
  genre_name: string;
  fan_count: number;
  rating_average: number;
  rating_count: number;
  owner_declared_explicit: boolean;
  explicit_enforced: boolean;
  genre_explicit: boolean;
  effective_explicit: boolean;
};

type AuditRow = {
  id: string;
  actor_name: string;
  target_label: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function presentUser(row: UserRow): AdminUser {
  const status = row.anonymized_at
    ? "ANONYMIZED"
    : row.deletion_requested_at
      ? "DELETION_PENDING"
      : row.disabled_at
        ? "DISABLED"
        : "ACTIVE";
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status,
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
    disabledAt: row.disabled_at?.toISOString() ?? null,
    disabledReason: row.disabled_reason,
    mustChangePassword: row.must_change_password,
    deletionRequestedAt: row.deletion_requested_at?.toISOString() ?? null,
    anonymizeAfter: row.anonymize_after?.toISOString() ?? null,
    anonymizedAt: row.anonymized_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    stationCount: row.station_count,
    retainedSourceBytes: row.retained_source_bytes,
    activeSessionCount: row.active_session_count,
  };
}

function presentStation(row: StationRow): AdminStation {
  return {
    id: row.id,
    name: row.name,
    isFeatured: row.is_featured,
    ownerEmail: row.owner_email,
    ownerDisplayName: row.owner_display_name,
    mode: row.mode,
    accessEnabled: row.access_enabled,
    broadcastState: row.broadcast_state,
    moderationStatus: row.moderation_status,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    videoCount: row.video_count,
    readyCount: row.ready_count,
    retainedSourceBytes: row.retained_source_bytes,
    updatedAt: row.updated_at.toISOString(),
    visibility: row.visibility,
    genreName: row.genre_name,
    fanCount: row.fan_count,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,
    ownerDeclaredExplicit: row.owner_declared_explicit,
    explicitEnforced: row.explicit_enforced,
    genreExplicit: row.genre_explicit,
    effectiveExplicit: row.effective_explicit,
  };
}

function presentAudit(row: AuditRow): AdminAuditEntry {
  return {
    id: row.id,
    actorName: row.actor_name,
    targetLabel: row.target_label,
    action: row.action,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

async function runtimeHealth(): Promise<AdminRuntimeHealth> {
  const [redisResult, storageResult, queueResult] = await Promise.allSettled([
    getRedis().ping(),
    storage.bucketExists(bucket),
    getTranscodeQueue().getJobCounts("waiting", "active", "delayed", "failed"),
  ]);
  const queueCounts = queueResult.status === "fulfilled" ? {
    waiting: queueResult.value.waiting ?? 0,
    active: queueResult.value.active ?? 0,
    delayed: queueResult.value.delayed ?? 0,
    failed: queueResult.value.failed ?? 0,
  } : null;

  return {
    database: "ok",
    redis: redisResult.status === "fulfilled" && redisResult.value === "PONG" ? "ok" : "error",
    storage: storageResult.status === "fulfilled" && storageResult.value ? "ok" : "error",
    queue: queueResult.status === "fulfilled" ? "ok" : "error",
    queueCounts,
  };
}

export async function loadAdminDashboard(): Promise<AdminDashboardData> {
  const [overviewResult, usersResult, stationsResult, auditResult, health, genres] = await Promise.all([
    query<OverviewRow>(
      `SELECT
         (SELECT count(*)::int FROM users) AS total_users,
         (SELECT count(*)::int FROM users WHERE created_at >= now() - interval '7 days') AS new_users_7d,
         (SELECT count(*)::int FROM stations WHERE deleted_at IS NULL) AS active_stations,
         (SELECT count(*)::int FROM stations WHERE deleted_at IS NOT NULL) AS deleted_stations,
         (SELECT count(*)::int FROM stations WHERE deleted_at IS NULL AND broadcast_state = 'RUNNING') AS live_broadcasts,
         (SELECT count(*)::int FROM content_reports WHERE status IN ('OPEN', 'IN_REVIEW')) AS unresolved_reports,
         (SELECT COALESCE(sum(size_bytes), 0)::text FROM videos) AS retained_source_bytes,
         (SELECT count(*)::int FROM videos WHERE status IN ('QUEUED', 'PROCESSING')) AS processing_videos,
         (SELECT count(*)::int FROM chat_messages WHERE created_at >= now() - interval '24 hours') AS messages_24h,
         (SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY processing_duration_ms / 1000.0), 0)::float8
            FROM videos WHERE processing_finished_at >= now() - interval '7 days' AND processing_duration_ms IS NOT NULL) AS processing_median_seconds,
         (SELECT COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY processing_duration_ms / 1000.0), 0)::float8
            FROM videos WHERE processing_finished_at >= now() - interval '7 days' AND processing_duration_ms IS NOT NULL) AS processing_p90_seconds`,
    ),
    query<UserRow>(
       `SELECT u.id, u.email, u.display_name, u.role, u.created_at, u.version, u.updated_at,
               u.disabled_at, u.disabled_reason, u.must_change_password,
               u.deletion_requested_at, u.anonymize_after, u.anonymized_at,
              (SELECT count(*)::int FROM stations s WHERE s.owner_id = u.id) AS station_count,
              (SELECT COALESCE(sum(v.size_bytes), 0)::text
                 FROM videos v JOIN stations s ON s.id = v.station_id
                WHERE s.owner_id = u.id) AS retained_source_bytes,
               (SELECT count(*)::int FROM sessions se
                  WHERE se.user_id = u.id AND se.expires_at > now()) AS active_session_count
          FROM users u
        ORDER BY u.created_at DESC
        LIMIT 200`,
    ),
    query<StationRow>(
      `SELECT s.id, s.name, s.is_featured, u.email AS owner_email, u.display_name AS owner_display_name,
              s.mode, s.access_enabled, s.broadcast_state, s.moderation_status, s.visibility, g.name AS genre_name,
              s.owner_declared_explicit, s.explicit_enforced_at IS NOT NULL AS explicit_enforced,
              g.is_explicit AS genre_explicit,
              (s.owner_declared_explicit OR s.explicit_enforced_at IS NOT NULL OR g.is_explicit) AS effective_explicit,
              s.deleted_at, s.updated_at,
              (SELECT count(*)::int FROM videos v WHERE v.station_id = s.id) AS video_count,
              (SELECT count(*)::int FROM videos v WHERE v.station_id = s.id AND v.status = 'READY') AS ready_count,
              (SELECT COALESCE(sum(v.size_bytes), 0)::text FROM videos v WHERE v.station_id = s.id) AS retained_source_bytes,
              (SELECT count(*)::int FROM station_fans f WHERE f.station_id = s.id) AS fan_count,
              (SELECT COALESCE(avg(r.rating), 0)::float8 FROM station_ratings r WHERE r.station_id = s.id) AS rating_average,
              (SELECT count(*)::int FROM station_ratings r WHERE r.station_id = s.id) AS rating_count
         FROM stations s
         JOIN users u ON u.id = s.owner_id
         JOIN station_genres g ON g.id = s.genre_id
        ORDER BY (s.deleted_at IS NULL) DESC, s.updated_at DESC
        LIMIT 200`,
    ),
    query<AuditRow>(
      `SELECT id, actor_name, target_label, action, metadata, created_at
         FROM admin_audit_log
        ORDER BY created_at DESC
        LIMIT 30`,
    ),
    runtimeHealth(),
    listGenres(false),
  ]);
  const row = overviewResult.rows[0];
  const overview: AdminOverview = {
    totalUsers: row.total_users,
    newUsers7d: row.new_users_7d,
    activeStations: row.active_stations,
    deletedStations: row.deleted_stations,
    liveBroadcasts: row.live_broadcasts,
    unresolvedReports: row.unresolved_reports,
    retainedSourceBytes: row.retained_source_bytes,
    processingVideos: row.processing_videos,
    messages24h: row.messages_24h,
    processingMedianSeconds: row.processing_median_seconds,
    processingP90Seconds: row.processing_p90_seconds,
  };

  return {
    overview,
    health,
    users: usersResult.rows.map(presentUser),
    stations: stationsResult.rows.map(presentStation),
    genres,
    audit: auditResult.rows.map(presentAudit),
    generatedAt: new Date().toISOString(),
  };
}

export { changeUserRole } from "@/lib/admin-users";
