"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Check,
  Clock3,
  Database,
  ExternalLink,
  HardDrive,
  KeyRound,
  MessageSquare,
  Plus,
  Radio,
  Search,
  Server,
  Shield,
  Trash2,
  UserCog,
  Users,
  Video,
  Wifi,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { UserRole } from "@/lib/auth";
import type { StationGenre } from "@/lib/genres";
import {
  filterAdminStations,
  filterAdminUsers,
  formatAdminBytes,
  formatAdminDuration,
  type AdminAuditEntry,
  type AdminDashboardData,
  type AdminStation,
  type AdminStationFeaturedMutation,
  type AdminStationFilter,
  type AdminUser,
  type AdminUserMutation,
} from "@/lib/admin-dashboard";

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function readable(value: string): string {
  return value.replaceAll("_", " ").toLocaleLowerCase();
}

function stationState(station: AdminStation): { label: string; className: string } {
  if (station.deletedAt) return { label: "Deleted", className: "" };
  if (station.moderationStatus === "RESTRICTED") return { label: "Restricted", className: "status-error" };
  if (station.broadcastState === "RUNNING") return { label: "Running", className: "status-success" };
  return { label: "Stopped", className: "status-warning" };
}

type UserMutationResponse = { user: AdminUserMutation; audit: AdminAuditEntry | null };
type StationFeaturedMutationResponse = { station: AdminStationFeaturedMutation; audit: AdminAuditEntry | null };

function userStatus(user: AdminUser): { label: string; className: string } {
  if (user.status === "ACTIVE") return { label: "Active", className: "status-success" };
  if (user.status === "DISABLED") return { label: "Disabled", className: "status-error" };
  if (user.status === "DELETION_PENDING") return { label: "Deletion pending", className: "status-warning" };
  return { label: "Anonymized", className: "" };
}

function auditDetail(entry: AdminAuditEntry): string | null {
  if (entry.action === "USER_ROLE_CHANGED" && typeof entry.metadata.from === "string" && typeof entry.metadata.to === "string") {
    return `Role changed from ${readable(entry.metadata.from)} to ${readable(entry.metadata.to)}.`;
  }
  if (entry.action === "USER_PROFILE_UPDATED" && Array.isArray(entry.metadata.changedFields)) {
    return `Updated ${entry.metadata.changedFields.map((field) => readable(String(field))).join(" and ")}.`;
  }
  if (entry.action === "USER_DISABLED") return typeof entry.metadata.reason === "string" ? entry.metadata.reason : "Account access disabled and credentials revoked.";
  if (entry.action === "USER_RE_ENABLED") return "Account access restored; prior sessions remain revoked.";
  if (entry.action === "USER_TEMPORARY_PASSWORD_SET") return "Temporary password assigned and all sessions revoked.";
  if (entry.action === "USER_DELETION_REQUESTED") return "Irreversible deletion requested; owned stations entered their purge window.";
  if (entry.action === "USER_ANONYMIZED") return "Account tombstone anonymized after station removal.";
  if (entry.action === "ADMIN_STATION_DIAGNOSTIC_OPENED") return typeof entry.metadata.reason === "string" ? entry.metadata.reason : "Read-only diagnostic stream opened.";
  if (entry.action === "STATION_FEATURED_ENABLED") return "Station added to editorial Featured discovery; Guide eligibility still applies.";
  if (entry.action === "STATION_FEATURED_DISABLED") return "Station removed from editorial Featured discovery.";
  return null;
}

function UserManagementDialog({
  user,
  currentUserId,
  onClose,
  onComplete,
}: {
  user: AdminUser;
  currentUserId: string;
  onClose: () => void;
  onComplete: (result: UserMutationResponse, notice: string) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const self = user.id === currentUserId;
  const locked = user.status === "DELETION_PENDING" || user.status === "ANONYMIZED";
  const status = userStatus(user);

  async function perform(action: string, request: () => Promise<UserMutationResponse>, notice: string) {
    setBusy(action);
    setError("");
    try {
      onComplete(await request(), notice);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The account could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform("profile", () => requestJson(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, email, expectedVersion: user.version }),
    }), `Profile updated for ${displayName.trim()}.`);
  }

  function saveRole() {
    if (role === user.role) return;
    void perform("role", () => requestJson(`/api/admin/users/${user.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, expectedVersion: user.version }),
    }), `${user.displayName} is now ${readable(role)}.`);
  }

  function changeStatus() {
    const disable = user.status === "ACTIVE";
    void perform("status", () => requestJson(`/api/admin/users/${user.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: disable, reason: disable ? reason : undefined, expectedVersion: user.version }),
    }), disable
      ? `${user.displayName} was disabled. Sessions and moderation tokens were revoked.`
      : `${user.displayName} was re-enabled. They must sign in again.`);
  }

  function setTemporaryPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get("temporaryPassword");
    void perform("password", async () => {
      const result = await requestJson(`/api/admin/users/${user.id}/temporary-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, expectedVersion: user.version }),
      });
      form.reset();
      return result;
    }, `Temporary password assigned to ${user.displayName}; all sessions were revoked.`);
  }

  function deleteUser() {
    void perform("delete", () => requestJson(`/api/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation, expectedVersion: user.version }),
    }), `Deletion for ${user.displayName} is irreversible and scheduled.`);
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="dialog admin-user-dialog stack-lg" role="dialog" aria-modal="true" aria-labelledby="admin-user-dialog-title">
      <div className="admin-user-dialog-header">
        <div><p className="eyebrow">User management</p><h2 id="admin-user-dialog-title">{user.displayName}</h2><p className="meta">Version {user.version} · Updated {new Date(user.updatedAt).toLocaleString()}</p></div>
        <button type="button" className="button-quiet" disabled={Boolean(busy)} onClick={onClose}>Close</button>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="admin-user-summary">
        <span className={`status ${status.className}`}>{status.label}</span>
        <span className={`status ${user.role === "ADMIN" ? "status-error" : user.role === "MODERATOR" ? "status-warning" : ""}`}>{readable(user.role)}</span>
        {user.mustChangePassword && <span className="status status-warning">Password change required</span>}
      </div>
      {user.disabledReason && <div className="notice notice-warning"><strong>Disabled reason</strong><p>{user.disabledReason}</p></div>}
      {user.deletionRequestedAt && <div className="notice notice-warning"><strong>Deletion is irreversible</strong><p>Requested {new Date(user.deletionRequestedAt).toLocaleString()}. Anonymization can run after {user.anonymizeAfter ? new Date(user.anonymizeAfter).toLocaleString() : "the station purge window"} and only after every owned station row is gone.</p></div>}

      <div className="admin-user-action-grid">
        <form className="card stack" onSubmit={saveProfile}>
          <div><h3>Profile</h3><p className="meta">Email is normalized to lowercase and must be unique.</p></div>
          <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} disabled={locked || Boolean(busy)} /></label>
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} disabled={locked || Boolean(busy)} /></label>
          <button disabled={locked || Boolean(busy) || (!displayName.trim() || (displayName === user.displayName && email === user.email))}>{busy === "profile" ? "Saving..." : "Save profile"}</button>
        </form>

        <div className="card stack">
          <div><h3>Access level</h3><p className="meta">Administrator changes are serialized to preserve at least one enabled admin.</p></div>
          <label>Role<select value={role} onChange={(event) => setRole(event.target.value as UserRole)} disabled={self || locked || Boolean(busy)}><option value="USER">User</option><option value="MODERATOR">Moderator</option><option value="ADMIN">Administrator</option></select></label>
          <button type="button" className="button-secondary" disabled={self || locked || Boolean(busy) || role === user.role} onClick={saveRole}>{busy === "role" ? "Saving..." : "Change role"}</button>
          {self && <p className="meta">You cannot demote, disable, or delete your current account.</p>}
        </div>

        <div className="card stack">
          <div><h3>{user.status === "DISABLED" ? "Re-enable account" : "Disable account"}</h3><p className="meta">Disabling immediately revokes every session and active moderation token. Re-enabling restores no credentials.</p></div>
          {user.status === "ACTIVE" && <label>Required reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} /></label>}
          <button type="button" className={user.status === "DISABLED" ? "button-secondary" : "button-danger"} disabled={self || locked || Boolean(busy) || (user.status !== "ACTIVE" && user.status !== "DISABLED") || (user.status === "ACTIVE" && !reason.trim())} onClick={changeStatus}>{busy === "status" ? "Updating..." : user.status === "DISABLED" ? "Re-enable account" : "Disable and revoke"}</button>
        </div>

        <form className="card stack" onSubmit={setTemporaryPassword}>
          <div><h3>Temporary password</h3><p className="meta">The value is hashed, never returned or audited, and all sessions are revoked. The user must replace it and sign in again.</p></div>
          <label>Temporary password<input name="temporaryPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required disabled={locked || Boolean(busy)} /></label>
          <button className="button-secondary" disabled={locked || Boolean(busy)}><KeyRound size={16} aria-hidden="true" /> {busy === "password" ? "Assigning..." : "Assign temporary password"}</button>
        </form>
      </div>

      {!self && !locked && <section className="admin-user-delete-zone stack">
        <div><h3>Delete user</h3><p>This action cannot be cancelled. Account access stops immediately. Every owned station enters the configured seven-day soft-delete window; a legal hold blocks the entire request. The user is anonymized only after the grace period and station purge finish.</p></div>
        <label>Type <strong>{user.email}</strong> to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
        <button type="button" className="button-danger" disabled={Boolean(busy) || confirmation !== user.email} onClick={deleteUser}><Trash2 size={16} aria-hidden="true" /> {busy === "delete" ? "Scheduling deletion..." : "Permanently schedule deletion"}</button>
      </section>}
    </section>
  </div>;
}

function HealthRow({
  icon,
  label,
  status,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  status: "ok" | "error";
  detail: string;
}) {
  return <div className="admin-health-row">
    <span className="admin-health-icon" aria-hidden="true">{icon}</span>
    <div><strong>{label}</strong><span className="meta">{detail}</span></div>
    <span className={`status ${status === "ok" ? "status-success" : "status-error"}`}>{status === "ok" ? "Operational" : "Unavailable"}</span>
  </div>;
}

export function AdminDashboard({ initialData, currentUserId }: { initialData: AdminDashboardData; currentUserId: string }) {
  const [users, setUsers] = useState(initialData.users);
  const [audit, setAudit] = useState(initialData.audit);
  const [genres, setGenres] = useState(initialData.genres);
  const [stations, setStations] = useState(initialData.stations);
  const [genreDrafts, setGenreDrafts] = useState<Record<string, { name: string; description: string }>>(() => Object.fromEntries(initialData.genres.map((genre) => [genre.id, { name: genre.name, description: genre.description }])));
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [stationQuery, setStationQuery] = useState("");
  const [stationFilter, setStationFilter] = useState<AdminStationFilter>("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [busyGenreId, setBusyGenreId] = useState<string | null>(null);
  const [featuredBusy, setFeaturedBusy] = useState<Record<string, boolean>>({});
  const [featuredErrors, setFeaturedErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const visibleUsers = useMemo(() => filterAdminUsers(users, userQuery, roleFilter), [users, userQuery, roleFilter]);
  const visibleStations = useMemo(
    () => filterAdminStations(stations, stationQuery, stationFilter),
    [stations, stationQuery, stationFilter],
  );
  const { overview, health } = initialData;

  function completeUserMutation(result: UserMutationResponse, message: string) {
    setUsers((current) => current.map((item) => item.id === result.user.id ? {
      ...item,
      ...result.user,
      activeSessionCount: result.user.status !== "ACTIVE" || result.user.mustChangePassword ? 0 : item.activeSessionCount,
    } : item));
    if (result.audit) setAudit((current) => [result.audit!, ...current].slice(0, 30));
    setError("");
    setNotice(message);
  }

  async function createNewGenre(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyGenreId("new"); setError(""); setNotice("");
    try {
      const result = await requestJson("/api/admin/genres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), description: form.get("description"), isExplicit: form.get("isExplicit") === "on" }),
      });
      const genre = result.genre as StationGenre;
      setGenres((current) => [...current, genre].sort((a, b) => a.name.localeCompare(b.name)));
      setGenreDrafts((current) => ({ ...current, [genre.id]: { name: genre.name, description: genre.description } }));
      formElement.reset();
      setNotice(`${genre.name} added to station genres.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The genre could not be added.");
    } finally { setBusyGenreId(null); }
  }

  async function saveGenre(genre: StationGenre) {
    const draft = genreDrafts[genre.id];
    if (!draft) return;
    setBusyGenreId(genre.id); setError(""); setNotice("");
    try {
      const result = await requestJson(`/api/admin/genres/${genre.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setGenres((current) => current.map((item) => item.id === genre.id ? result.genre : item).sort((a, b) => a.name.localeCompare(b.name)));
      setNotice(`${result.genre.name} updated.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The genre could not be updated.");
    } finally { setBusyGenreId(null); }
  }

  async function setGenreActive(genre: StationGenre, active: boolean) {
    setBusyGenreId(genre.id); setError(""); setNotice("");
    try {
      const result = await requestJson(`/api/admin/genres/${genre.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      setGenres((current) => current.map((item) => item.id === genre.id ? result.genre : item));
      setNotice(`${genre.name} ${active ? "restored" : "archived"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The genre could not be changed.");
    } finally { setBusyGenreId(null); }
  }

  async function setGenreExplicit(genre: StationGenre, isExplicit: boolean) {
    setBusyGenreId(genre.id); setError(""); setNotice("");
    try {
      const result = await requestJson(`/api/admin/genres/${genre.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isExplicit }),
      });
      setGenres((current) => current.map((item) => item.id === genre.id ? result.genre : item));
      setNotice(`${genre.name} is now ${isExplicit ? "explicit" : "standard"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The explicit classification could not be changed.");
    } finally { setBusyGenreId(null); }
  }

  async function removeGenre(genre: StationGenre) {
    if (!window.confirm(`Delete ${genre.name}? Only unused genres can be deleted.`)) return;
    setBusyGenreId(genre.id); setError(""); setNotice("");
    try {
      await requestJson(`/api/admin/genres/${genre.id}`, { method: "DELETE" });
      setGenres((current) => current.filter((item) => item.id !== genre.id));
      setNotice(`${genre.name} deleted.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The genre could not be deleted.");
    } finally { setBusyGenreId(null); }
  }

  async function setStationExplicit(station: AdminStation, enforced: boolean) {
    setError(""); setNotice("");
    try {
      const result = await requestJson(`/api/moderation/stations/${station.id}/explicit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforced, note: `Explicit classification ${enforced ? "enforced" : "cleared"} from the admin station inventory.` }),
      });
      setStations((current) => current.map((item) => item.id === station.id ? {
        ...item,
        explicitEnforced: result.enforced,
        effectiveExplicit: item.ownerDeclaredExplicit || item.genreExplicit || result.enforced,
      } : item));
      setNotice(`${station.name} explicit enforcement ${enforced ? "enabled" : "cleared"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The station classification could not be changed.");
    }
  }

  async function setFeatured(station: AdminStation, featured: boolean) {
    setFeaturedBusy((current) => ({ ...current, [station.id]: true }));
    setFeaturedErrors((current) => {
      const next = { ...current };
      delete next[station.id];
      return next;
    });
    setNotice("");
    try {
      const result = await requestJson(`/api/admin/stations/${station.id}/featured`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured }),
      }) as StationFeaturedMutationResponse;
      setStations((current) => current.map((item) => item.id === station.id ? { ...item, ...result.station } : item));
      if (result.audit) setAudit((current) => [result.audit!, ...current].slice(0, 30));
      setNotice(`${station.name} ${featured ? "added to" : "removed from"} Featured discovery.`);
    } catch (caught) {
      setFeaturedErrors((current) => ({
        ...current,
        [station.id]: caught instanceof Error ? caught.message : "Featured placement could not be changed.",
      }));
    } finally {
      setFeaturedBusy((current) => {
        const next = { ...current };
        delete next[station.id];
        return next;
      });
    }
  }

  function openDiagnosticPreview(station: AdminStation) {
    const reason = window.prompt(`Why are you opening a diagnostic preview of ${station.name}?`);
    if (reason === null) return;
    if (reason.trim().length < 10) {
      setError("Enter a troubleshooting reason of at least 10 characters.");
      return;
    }
    setError("");
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/admin/stations/${station.id}/preview/open`;
    form.target = "_blank";
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "reason";
    field.value = reason.trim();
    form.append(field);
    document.body.append(form);
    form.submit();
    form.remove();
  }

  return <div className="admin-dashboard stack-lg">
    <nav className="admin-jump-nav" aria-label="Admin dashboard sections">
      <a href="#overview">Overview</a>
      <a href="#users">Users</a>
      <a href="#genres">Genres</a>
      <a href="#stations">Stations</a>
      <a href="#activity">Activity</a>
      <Link href="/moderation">Moderation <ExternalLink size={14} aria-hidden="true" /></Link>
    </nav>

    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {notice && <div className="notice notice-success" role="status">{notice}</div>}

    <section id="overview" className="stack" aria-labelledby="admin-overview-title">
      <div className="admin-section-heading">
        <div><p className="eyebrow">Platform overview</p><h2 id="admin-overview-title">Current operations</h2></div>
        <span className="meta">Snapshot {new Date(initialData.generatedAt).toLocaleString()}</span>
      </div>
      <div className="admin-metrics">
        <div className="admin-metric admin-metric-primary">
          <span><Users size={17} aria-hidden="true" /> Accounts</span>
          <strong>{overview.totalUsers}</strong>
          <p className="meta">{overview.newUsers7d} joined in the last 7 days</p>
        </div>
        <div className="admin-metric">
          <span><Radio size={17} aria-hidden="true" /> Stations</span>
          <strong>{overview.activeStations}</strong>
          <p className="meta">{overview.liveBroadcasts} running · {overview.deletedStations} in recovery</p>
        </div>
        <div className="admin-metric">
          <span><AlertTriangle size={17} aria-hidden="true" /> Needs review</span>
          <strong>{overview.unresolvedReports}</strong>
          <p className="meta">Open and in-review reports</p>
        </div>
        <div className="admin-metric">
          <span><HardDrive size={17} aria-hidden="true" /> Retained sources</span>
          <strong>{formatAdminBytes(overview.retainedSourceBytes)}</strong>
          <p className="meta">Original uploaded video bytes</p>
        </div>
      </div>

      <div className="admin-operations-grid">
        <article className="card stack admin-operations-card">
          <div><h3>Dependency health</h3><p className="meta">Live checks from this application instance.</p></div>
          <div className="admin-health-list">
            <HealthRow icon={<Database size={18} />} label="PostgreSQL" status={health.database} detail="Accounts, stations, and schedules" />
            <HealthRow icon={<Wifi size={18} />} label="Redis" status={health.redis} detail="Queues, presence, and rate limits" />
            <HealthRow icon={<HardDrive size={18} />} label="Object storage" status={health.storage} detail="Sources, HLS, and station assets" />
            <HealthRow icon={<Server size={18} />} label="Transcode queue" status={health.queue} detail="BullMQ processing connection" />
          </div>
        </article>

        <article className="card stack admin-operations-card">
          <div><h3>Processing workload</h3><p className="meta">Current activity. Failed job records are retained diagnostics, not active work.</p></div>
          <div className="admin-workload-grid">
            <div><span className="meta">Active jobs</span><strong>{health.queueCounts?.active ?? "—"}</strong></div>
            <div><span className="meta">Waiting</span><strong>{health.queueCounts?.waiting ?? "—"}</strong></div>
            <div><span className="meta">Delayed</span><strong>{health.queueCounts?.delayed ?? "—"}</strong></div>
            <div><span className="meta">Failed job records</span><strong>{health.queueCounts?.failed ?? "—"}</strong></div>
          </div>
          <div className="admin-operational-lines">
            <p><Video size={16} aria-hidden="true" /><strong>{overview.processingVideos}</strong> videos queued or processing</p>
            <p><Clock3 size={16} aria-hidden="true" /><strong>{formatAdminDuration(overview.processingMedianSeconds)}</strong> median processing · p90 {formatAdminDuration(overview.processingP90Seconds)}</p>
            <p><MessageSquare size={16} aria-hidden="true" /><strong>{overview.messages24h}</strong> chat messages in the last 24 hours</p>
          </div>
        </article>

        <article className="card stack admin-operations-card admin-attention-card">
          <div><h3>Trust &amp; safety</h3><p className="meta">Move from platform operations into report review.</p></div>
          <div className="admin-attention-count"><Shield size={20} aria-hidden="true" /><strong>{overview.unresolvedReports}</strong><span>reports need attention</span></div>
          <Link className="button" href="/moderation">Open moderation workspace <ExternalLink size={16} aria-hidden="true" /></Link>
        </article>
      </div>
    </section>

    <section id="users" className="card admin-section" aria-labelledby="admin-users-title">
      <div className="admin-section-header">
        <div><p className="eyebrow">Access control</p><h2 id="admin-users-title">Users</h2><p className="meta">Search the 200 newest accounts and manage profile, access, and lifecycle state.</p></div>
        <div className="admin-table-controls">
          <label>Search users<span className="admin-search-input"><Search size={16} aria-hidden="true" /><input type="search" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Name or email" /></span></label>
          <label>Role<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "ALL" | UserRole)}><option value="ALL">All roles</option><option value="USER">Users</option><option value="MODERATOR">Moderators</option><option value="ADMIN">Administrators</option></select></label>
        </div>
      </div>
      <p className="admin-result-count" aria-live="polite">{visibleUsers.length} {visibleUsers.length === 1 ? "account" : "accounts"}</p>
      {visibleUsers.length ? <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Account</th><th>Status</th><th>Role</th><th>Stations</th><th>Storage</th><th>Sessions</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>{visibleUsers.map((user) => {
            const state = userStatus(user);
            return <tr key={user.id}>
            <td data-label="Account"><strong>{user.displayName}</strong><span className="meta">{user.email}</span></td>
            <td data-label="Status"><span className={`status ${state.className}`}>{state.label}</span>{user.disabledReason && <span className="meta">{user.disabledReason}</span>}</td>
            <td data-label="Role"><span className={`status ${user.role === "ADMIN" ? "status-error" : user.role === "MODERATOR" ? "status-warning" : ""}`}>{readable(user.role)}</span></td>
            <td data-label="Stations">{user.stationCount}</td>
            <td data-label="Storage">{formatAdminBytes(user.retainedSourceBytes)}</td>
            <td data-label="Sessions">{user.activeSessionCount} active{user.mustChangePassword && <span className="meta">Password change required</span>}</td>
            <td data-label="Joined"><time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleDateString()}</time></td>
            <td data-label="Actions"><button type="button" className="button-secondary" onClick={() => { setNotice(""); setError(""); setSelectedUserId(user.id); }}><UserCog size={15} aria-hidden="true" /> Manage</button></td>
          </tr>;
          })}</tbody>
        </table>
      </div> : <div className="empty admin-empty"><h3>No matching users</h3><p>Adjust the account search or role filter.</p></div>}
    </section>

    <section id="genres" className="card admin-section" aria-labelledby="admin-genres-title">
      <div className="admin-section-header">
        <div><p className="eyebrow">Guide taxonomy</p><h2 id="admin-genres-title">Station genres</h2><p className="meta">Add and edit Guide categories. Archive categories that are still assigned; unused categories can be deleted.</p></div>
        <form className="admin-genre-create" onSubmit={createNewGenre}>
          <label>Name<input name="name" required minLength={2} maxLength={60} placeholder="Example: Animation" /></label>
          <label>Description<input name="description" maxLength={240} placeholder="Optional category guidance" /></label>
          <label className="admin-genre-explicit"><input type="checkbox" name="isExplicit" /> Explicit</label>
          <button disabled={busyGenreId !== null}><Plus size={16} aria-hidden="true" /> {busyGenreId === "new" ? "Adding…" : "Add genre"}</button>
        </form>
      </div>
      <p className="admin-result-count">{genres.filter((genre) => genre.active).length} active · {genres.length} total</p>
      <div className="admin-table-wrap">
        <table className="admin-table admin-genres-table">
          <thead><tr><th>Genre</th><th>Description</th><th>Status</th><th>Content</th><th>Stations</th><th>Actions</th></tr></thead>
          <tbody>{genres.map((genre) => <tr key={genre.id}>
            <td data-label="Genre"><input aria-label={`Name for ${genre.name}`} value={genreDrafts[genre.id]?.name ?? genre.name} maxLength={60} onChange={(event) => setGenreDrafts((current) => ({ ...current, [genre.id]: { ...(current[genre.id] ?? { description: genre.description }), name: event.target.value } }))} /></td>
            <td data-label="Description"><input aria-label={`Description for ${genre.name}`} value={genreDrafts[genre.id]?.description ?? genre.description} maxLength={240} onChange={(event) => setGenreDrafts((current) => ({ ...current, [genre.id]: { ...(current[genre.id] ?? { name: genre.name }), description: event.target.value } }))} /></td>
            <td data-label="Status"><span className={`status ${genre.active ? "status-success" : ""}`}>{genre.active ? "Active" : "Archived"}</span></td>
            <td data-label="Content"><button type="button" className={genre.isExplicit ? "button-danger" : "button-quiet"} disabled={busyGenreId !== null} aria-pressed={genre.isExplicit} onClick={() => void setGenreExplicit(genre, !genre.isExplicit)}>{genre.isExplicit ? "Explicit" : "Standard"}</button></td>
            <td data-label="Stations">{genre.stationCount}</td>
            <td data-label="Actions"><div className="cluster admin-genre-actions"><button type="button" className="button-secondary" disabled={busyGenreId !== null || !genreDrafts[genre.id]?.name.trim()} onClick={() => void saveGenre(genre)}><Check size={15} aria-hidden="true" /> Save</button><button type="button" className="button-quiet" disabled={busyGenreId !== null} onClick={() => void setGenreActive(genre, !genre.active)}>{genre.active ? "Archive" : "Restore"}</button><button type="button" className="button-danger" disabled={busyGenreId !== null || genre.stationCount > 0} title={genre.stationCount > 0 ? "Reassign stations before deleting this genre" : undefined} onClick={() => void removeGenre(genre)}><Trash2 size={15} aria-hidden="true" /> Delete</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section id="stations" className="card admin-section" aria-labelledby="admin-stations-title">
      <div className="admin-section-header">
        <div><p className="eyebrow">System inventory</p><h2 id="admin-stations-title">Stations</h2><p className="meta">Operational inventory for the 200 most recently updated stations. Featured placement applies only to Guide-eligible stations and does not change normal Guide sorting.</p></div>
        <div className="admin-table-controls">
          <label>Search stations<span className="admin-search-input"><Search size={16} aria-hidden="true" /><input type="search" value={stationQuery} onChange={(event) => setStationQuery(event.target.value)} placeholder="Station or owner" /></span></label>
          <label>State<select value={stationFilter} onChange={(event) => setStationFilter(event.target.value as AdminStationFilter)}><option value="ALL">All states</option><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option><option value="RUNNING">Running</option><option value="STOPPED">Stopped</option><option value="RESTRICTED">Restricted</option><option value="DELETED">In recovery</option></select></label>
        </div>
      </div>
      <p className="admin-result-count" aria-live="polite">{visibleStations.length} {visibleStations.length === 1 ? "station" : "stations"}</p>
      {visibleStations.length ? <div className="admin-table-wrap">
        <table className="admin-table admin-stations-table">
          <thead><tr><th>Station</th><th>Owner</th><th>Discovery</th><th>State</th><th>Community</th><th>Media</th><th>Storage</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>{visibleStations.map((station) => {
            const state = stationState(station);
            return <tr key={station.id}>
              <td data-label="Station"><strong>{station.name}</strong><span className="meta">Always running</span></td>
              <td data-label="Owner"><strong>{station.ownerDisplayName}</strong><span className="meta">{station.ownerEmail}</span></td>
              <td data-label="Discovery"><div className="cluster"><span className={`status ${station.visibility === "PUBLIC" ? "status-success" : ""}`}>{station.visibility.toLocaleLowerCase()}</span><span className={`status ${station.effectiveExplicit ? "status-error" : ""}`}>{station.effectiveExplicit ? "Explicit" : "Standard"}</span>{station.isFeatured && <span className="status status-warning">Featured</span>}</div><span className="meta">{station.genreName}{station.genreExplicit ? " · explicit genre" : station.ownerDeclaredExplicit ? " · owner labeled" : ""}</span><div className="cluster"><button type="button" className="button-quiet admin-explicit-control" onClick={() => void setStationExplicit(station, !station.explicitEnforced)}>{station.explicitEnforced ? "Clear enforcement" : "Enforce explicit"}</button><button type="button" className="button-quiet admin-explicit-control" aria-pressed={station.isFeatured} disabled={Boolean(station.deletedAt) || Boolean(featuredBusy[station.id])} onClick={() => void setFeatured(station, !station.isFeatured)}>{featuredBusy[station.id] ? "Updating..." : station.isFeatured ? "Remove featured" : "Feature station"}</button></div>{featuredErrors[station.id] && <span className="meta status-error" role="alert">{featuredErrors[station.id]}</span>}</td>
              <td data-label="State"><span className={`status ${state.className}`}>{state.label}</span></td>
              <td data-label="Community">{station.fanCount} fans<span className="meta">{station.ratingCount ? `${station.ratingAverage.toFixed(1)} rating (${station.ratingCount})` : "Unrated"}</span></td>
              <td data-label="Media">{station.readyCount} / {station.videoCount} ready</td>
              <td data-label="Storage">{formatAdminBytes(station.retainedSourceBytes)}</td>
              <td data-label="Updated"><time dateTime={station.updatedAt}>{new Date(station.updatedAt).toLocaleDateString()}</time></td>
              <td data-label="Actions"><button type="button" className="button-secondary" disabled={Boolean(station.deletedAt)} title={station.deletedAt ? "Deleted stations cannot be previewed" : "Open a read-only admin stream without affecting viewer presence"} onClick={() => openDiagnosticPreview(station)}><ExternalLink size={15} aria-hidden="true" /> Diagnostic preview</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className="empty admin-empty"><h3>No matching stations</h3><p>Adjust the inventory search or state filter.</p></div>}
    </section>

    <section id="activity" className="card admin-section" aria-labelledby="admin-activity-title">
      <div className="admin-section-heading"><div><p className="eyebrow">Accountability</p><h2 id="admin-activity-title">Recent admin activity</h2><p className="meta">Audited user and platform changes made through administrator controls.</p></div><Activity size={21} aria-hidden="true" /></div>
      {audit.length ? <ol className="admin-activity-list">{audit.map((entry) => <li key={entry.id}>
        <span className="admin-activity-marker" aria-hidden="true" />
        <div><strong>{readable(entry.action)}</strong><span className="meta">{entry.actorName}{entry.targetLabel ? ` · ${entry.targetLabel}` : ""}</span>{auditDetail(entry) && <p>{auditDetail(entry)}</p>}</div>
        <time className="meta" dateTime={entry.createdAt}><Clock3 size={13} aria-hidden="true" />{new Date(entry.createdAt).toLocaleString()}</time>
      </li>)}</ol> : <div className="empty admin-empty"><h3>No admin changes yet</h3><p>User-management actions made here will appear in this audit trail.</p></div>}
    </section>
    {selectedUserId && (() => {
      const selectedUser = users.find((user) => user.id === selectedUserId);
      return selectedUser ? <UserManagementDialog key={`${selectedUser.id}-${selectedUser.version}`} user={selectedUser} currentUserId={currentUserId} onClose={() => setSelectedUserId(null)} onComplete={completeUserMutation} /> : null;
    })()}
  </div>;
}
