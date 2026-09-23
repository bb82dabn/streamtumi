import type { UserRole } from "@/lib/auth";
import type { StationGenre } from "@/lib/genres";

export type AdminOverview = {
  totalUsers: number;
  newUsers7d: number;
  activeStations: number;
  deletedStations: number;
  liveBroadcasts: number;
  unresolvedReports: number;
  retainedSourceBytes: string;
  processingVideos: number;
  messages24h: number;
  processingMedianSeconds: number;
  processingP90Seconds: number;
};

export type AdminRuntimeHealth = {
  database: "ok";
  redis: "ok" | "error";
  storage: "ok" | "error";
  queue: "ok" | "error";
  queueCounts: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  } | null;
};

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: "ACTIVE" | "DISABLED" | "DELETION_PENDING" | "ANONYMIZED";
  version: number;
  updatedAt: string;
  disabledAt: string | null;
  disabledReason: string | null;
  mustChangePassword: boolean;
  deletionRequestedAt: string | null;
  anonymizeAfter: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  stationCount: number;
  retainedSourceBytes: string;
  activeSessionCount: number;
};

export type AdminUserMutation = Pick<AdminUser,
  "id" | "email" | "displayName" | "role" | "status" | "version" | "updatedAt" |
  "disabledAt" | "disabledReason" | "mustChangePassword" | "deletionRequestedAt" | "anonymizeAfter" | "anonymizedAt"
>;

export type AdminStation = {
  id: string;
  name: string;
  isFeatured: boolean;
  ownerEmail: string;
  ownerDisplayName: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  accessEnabled: boolean;
  broadcastState: "RUNNING" | "STOPPED";
  moderationStatus: "ACTIVE" | "RESTRICTED";
  deletedAt: string | null;
  videoCount: number;
  readyCount: number;
  retainedSourceBytes: string;
  updatedAt: string;
  visibility: "PRIVATE" | "PUBLIC";
  genreName: string;
  fanCount: number;
  ratingAverage: number;
  ratingCount: number;
  ownerDeclaredExplicit: boolean;
  explicitEnforced: boolean;
  genreExplicit: boolean;
  effectiveExplicit: boolean;
};

export type AdminStationFeaturedMutation = Pick<AdminStation, "id" | "name" | "isFeatured" | "updatedAt">;

export type AdminAuditEntry = {
  id: string;
  actorName: string;
  targetLabel: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminDashboardData = {
  overview: AdminOverview;
  health: AdminRuntimeHealth;
  users: AdminUser[];
  stations: AdminStation[];
  genres: StationGenre[];
  audit: AdminAuditEntry[];
  generatedAt: string;
};

export type AdminStationFilter = "ALL" | "RUNNING" | "STOPPED" | "RESTRICTED" | "DELETED" | "PUBLIC" | "PRIVATE";

export function formatAdminBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatAdminDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "No data";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function filterAdminUsers(users: AdminUser[], query: string, role: "ALL" | UserRole): AdminUser[] {
  const normalized = query.trim().toLocaleLowerCase();
  return users.filter((user) => {
    const roleMatches = role === "ALL" || user.role === role;
    const queryMatches = !normalized || [user.displayName, user.email, user.role, user.status]
      .some((value) => value.toLocaleLowerCase().includes(normalized));
    return roleMatches && queryMatches;
  });
}

export function filterAdminStations(stations: AdminStation[], query: string, filter: AdminStationFilter): AdminStation[] {
  const normalized = query.trim().toLocaleLowerCase();
  return stations.filter((station) => {
    const stateMatches = filter === "ALL"
      || (filter === "DELETED" && station.deletedAt !== null)
      || (filter === "RESTRICTED" && station.moderationStatus === "RESTRICTED")
      || (filter === "PUBLIC" && station.deletedAt === null && station.visibility === "PUBLIC")
      || (filter === "PRIVATE" && station.deletedAt === null && station.visibility === "PRIVATE")
      || (filter === "RUNNING" && station.deletedAt === null && station.broadcastState === "RUNNING")
      || (filter === "STOPPED" && station.deletedAt === null && station.broadcastState === "STOPPED");
    const queryMatches = !normalized || [station.name, station.ownerDisplayName, station.ownerEmail]
      .some((value) => value.toLocaleLowerCase().includes(normalized));
    return stateMatches && queryMatches;
  });
}
