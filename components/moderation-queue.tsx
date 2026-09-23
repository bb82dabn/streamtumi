"use client";

import {
  AlertTriangle,
  Bot,
  Check,
  Clock3,
  Eye,
  Inbox,
  LockKeyhole,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { MediaPreview } from "@/components/media-preview";
import {
  filterModerationReports,
  reportAge,
  type ModerationDashboardReport,
  type ModerationReportFilters,
  type ModerationReportStatus,
} from "@/lib/moderation-dashboard";
import type { ModerationOverview } from "@/lib/moderation";

type AuditEntry = {
  id: string;
  actor_type: string;
  actor_name: string;
  action: string;
  note: string | null;
  created_at: string;
};

type ServiceToken = {
  id: string;
  name: string;
  scopes: string[];
  active: boolean;
  created_at: string;
  last_used_at: string | null;
};

type BusyAction = "refresh" | "claim" | "decision" | "legal-hold" | "explicit" | "create-token" | "revoke-token";

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function readable(value: string): string {
  return value.replaceAll("_", " ").toLocaleLowerCase();
}

function statusClass(status: ModerationReportStatus): string {
  if (status === "OPEN") return "status-warning";
  if (status === "IN_REVIEW") return "status-processing";
  if (status === "ACTIONED") return "status-success";
  return "";
}

export function ModerationQueue({
  initialReports,
  initialOverview,
  isAdmin,
}: {
  initialReports: ModerationDashboardReport[];
  initialOverview: ModerationOverview;
  isAdmin: boolean;
}) {
  const [reports, setReports] = useState(initialReports);
  const [overview, setOverview] = useState(initialOverview);
  const [selectedId, setSelectedId] = useState<string | null>(initialReports[0]?.id ?? null);
  const [filters, setFilters] = useState<ModerationReportFilters>({ query: "", status: "ACTIVE", subject: "ALL" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [serviceTokens, setServiceTokens] = useState<ServiceToken[]>([]);
  const [serviceTokensLoading, setServiceTokensLoading] = useState(isAdmin);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [legalHoldMode, setLegalHoldMode] = useState<"apply" | "release" | null>(null);
  const [explicitMode, setExplicitMode] = useState<boolean | null>(null);

  const filteredReports = useMemo(() => filterModerationReports(reports, filters), [reports, filters]);
  const selected = reports.find((report) => report.id === selectedId) ?? null;
  const unresolved = overview.open + overview.inReview;

  useEffect(() => {
    if (filteredReports.some((report) => report.id === selectedId)) return;
    setSelectedId(filteredReports[0]?.id ?? null);
  }, [filteredReports, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setAudit([]);
      setAuditLoading(false);
      return;
    }
    let ignore = false;
    setAuditLoading(true);
    void requestJson(`/api/moderation/reports/${selectedId}`, { cache: "no-store" })
      .then((data) => { if (!ignore) setAudit(data.audit); })
      .catch(() => { if (!ignore) setAudit([]); })
      .finally(() => { if (!ignore) setAuditLoading(false); });
    return () => { ignore = true; };
  }, [selectedId, selected?.version]);

  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;
    setServiceTokensLoading(true);
    void requestJson("/api/moderation/tokens", { cache: "no-store" })
      .then((data) => { if (!ignore) setServiceTokens(data.tokens); })
      .catch(() => { if (!ignore) setServiceTokens([]); })
      .finally(() => { if (!ignore) setServiceTokensLoading(false); });
    return () => { ignore = true; };
  }, [isAdmin]);

  async function loadReports(selectId?: string) {
    const data = await requestJson("/api/moderation/reports", { cache: "no-store" });
    setReports(data.reports);
    setOverview(data.overview);
    const preferredId = selectId ?? selectedId;
    setSelectedId(data.reports.some((report: ModerationDashboardReport) => report.id === preferredId)
      ? preferredId
      : data.reports[0]?.id ?? null);
  }

  async function refresh() {
    setBusyAction("refresh");
    setError("");
    try {
      await loadReports();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh reports.");
    } finally {
      setBusyAction(null);
    }
  }

  function chooseReport(reportId: string) {
    setSelectedId(reportId);
    setLegalHoldMode(null);
    setExplicitMode(null);
    setError("");
    setNotice("");
  }

  async function claim() {
    if (!selected) return;
    setBusyAction("claim");
    setError("");
    try {
      await requestJson(`/api/moderation/reports/${selected.id}/claim`, { method: "POST" });
      setNotice("Report assigned for review.");
      await loadReports(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not claim report.");
    } finally {
      setBusyAction(null);
    }
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusyAction("decision");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/moderation/reports/${selected.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: form.get("action"), note: form.get("note"), version: selected.version }),
      });
      setNotice("Decision recorded in the moderation audit log.");
      await loadReports(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function changeLegalHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !legalHoldMode) return;
    const form = new FormData(event.currentTarget);
    const active = legalHoldMode === "apply";
    setBusyAction("legal-hold");
    setError("");
    try {
      await requestJson(`/api/moderation/reports/${selected.id}/legal-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, note: form.get("note") }),
      });
      setNotice(active ? "Legal hold applied." : "Legal hold released.");
      setLegalHoldMode(null);
      await loadReports(selected.id);
      const detail = await requestJson(`/api/moderation/reports/${selected.id}`, { cache: "no-store" });
      setAudit(detail.audit);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Legal hold failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function changeExplicitEnforcement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.station_id || explicitMode === null) return;
    const form = new FormData(event.currentTarget);
    setBusyAction("explicit"); setError("");
    try {
      await requestJson(`/api/moderation/stations/${selected.station_id}/explicit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforced: explicitMode, note: form.get("note") }),
      });
      setNotice(explicitMode ? "Explicit classification enforced." : "Explicit enforcement cleared.");
      setExplicitMode(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Explicit classification failed.");
    } finally { setBusyAction(null); }
  }

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyAction("create-token");
    setError("");
    setToken("");
    try {
      const data = await requestJson("/api/moderation/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), scopes: ["reports:read", "reports:decide"] }),
      });
      setToken(data.token);
      formElement.reset();
      const updated = await requestJson("/api/moderation/tokens", { cache: "no-store" });
      setServiceTokens(updated.tokens);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Token could not be created.");
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeToken(id: string, name: string) {
    if (!window.confirm(`Revoke the moderation token for ${name}? This cannot be undone.`)) return;
    setBusyAction("revoke-token");
    setError("");
    try {
      await requestJson(`/api/moderation/tokens/${id}`, { method: "DELETE" });
      setServiceTokens((current) => current.map((item) => item.id === id ? { ...item, active: false } : item));
      setNotice(`${name} token revoked.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Token could not be revoked.");
    } finally {
      setBusyAction(null);
    }
  }

  return <div className="moderation-dashboard">
    <section className="moderation-overview" aria-label="Moderation overview">
      <div className="moderation-metric moderation-metric-primary">
        <span className="moderation-metric-label"><Inbox size={16} aria-hidden="true" /> Needs review</span>
        <strong>{unresolved}</strong>
        <span className="meta">Open and in review</span>
      </div>
      <div className="moderation-metric">
        <span className="moderation-metric-label"><AlertTriangle size={16} aria-hidden="true" /> Awaiting claim</span>
        <strong>{overview.open}</strong>
        <span className="meta">Oldest items first</span>
      </div>
      <div className="moderation-metric">
        <span className="moderation-metric-label"><Eye size={16} aria-hidden="true" /> In review</span>
        <strong>{overview.inReview}</strong>
        <span className="meta">Active investigations</span>
      </div>
      <div className="moderation-metric">
        <span className="moderation-metric-label"><Check size={16} aria-hidden="true" /> Resolved today</span>
        <strong>{overview.resolvedToday}</strong>
        <span className="meta">Actioned or dismissed</span>
      </div>
    </section>

    <div className="moderation-risk-strip" aria-label="Active safeguards">
      <span><Shield size={16} aria-hidden="true" /><strong>{overview.restrictedStations}</strong> restricted {overview.restrictedStations === 1 ? "station" : "stations"}</span>
      <span><LockKeyhole size={16} aria-hidden="true" /><strong>{overview.legalHolds}</strong> active legal {overview.legalHolds === 1 ? "hold" : "holds"}</span>
      <span className="meta">Counts update when the queue refreshes.</span>
    </div>

    <div className="moderation-layout">
      <aside className="moderation-list card" aria-labelledby="report-queue-title">
        <div className="card-header moderation-queue-header">
          <div>
            <h2 id="report-queue-title">Report queue</h2>
            <p className="meta">Triage up to 200 recent reports</p>
          </div>
          <button
            type="button"
            className="button-quiet"
            aria-label={busyAction === "refresh" ? "Refreshing reports" : "Refresh reports"}
            disabled={busyAction !== null}
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="moderation-queue-controls">
          <label className="moderation-search">
            <span>Search reports</span>
            <span className="moderation-search-input">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Reference, reason, or email"
              />
            </span>
          </label>
          <div className="moderation-filter-grid">
            <label>Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as ModerationReportFilters["status"] }))}>
                <option value="ACTIVE">Needs review</option>
                <option value="ALL">All statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_REVIEW">In review</option>
                <option value="ACTIONED">Actioned</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </label>
            <label>Content
              <select value={filters.subject} onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value as ModerationReportFilters["subject"] }))}>
                <option value="ALL">All content</option>
                <option value="STATION">Stations</option>
                <option value="VIDEO">Videos</option>
                <option value="CHAT_MESSAGE">Chat messages</option>
              </select>
            </label>
          </div>
        </div>

        <p className="moderation-result-count" aria-live="polite">
          {filteredReports.length} {filteredReports.length === 1 ? "report" : "reports"}
        </p>
        <div className="moderation-list-items">
          {filteredReports.length ? filteredReports.map((report) => <button
            type="button"
            className={`moderation-list-item ${selected?.id === report.id ? "active" : ""}`}
            key={report.id}
            aria-pressed={selected?.id === report.id}
            onClick={() => chooseReport(report.id)}
          >
            <span className="moderation-item-top">
              <span className={`status ${statusClass(report.status)}`}>{readable(report.status)}</span>
              <span className="moderation-item-time"><Clock3 size={13} aria-hidden="true" />{reportAge(report.created_at)}</span>
            </span>
            <strong>{report.reference_code}</strong>
            <span className="moderation-item-reason">{readable(report.subject_type)} · {readable(report.reason)}</span>
          </button>) : <div className="empty moderation-queue-empty">
            <h2>No matching reports</h2>
            <p>Adjust the queue filters or refresh for new reports.</p>
          </div>}
        </div>
      </aside>

      <section className="moderation-detail stack" aria-label="Selected report review">
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {notice && <div className="notice notice-success" role="status">{notice}</div>}

        {selected ? <>
          <article className="card stack moderation-report-card">
            <div className="moderation-detail-header">
              <div>
                <p className="eyebrow">{selected.reference_code}</p>
                <h2>{readable(selected.subject_type)} report</h2>
              </div>
              <span className={`status ${statusClass(selected.status)}`}>{readable(selected.status)}</span>
            </div>
            <div className="report-facts">
              <div><span className="meta">Reason</span><strong>{readable(selected.reason)}</strong></div>
              <div><span className="meta">Received</span><strong>{new Date(selected.created_at).toLocaleString()}</strong></div>
              <div><span className="meta">Reporter</span><strong>{selected.reporter_email ?? "Anonymous"}</strong></div>
            </div>
            <div className="report-statement">
              <span className="meta">Reporter statement</span>
              <p>{selected.details}</p>
            </div>
            <details className="report-metadata">
              <summary>Captured metadata</summary>
              <pre>{JSON.stringify(selected.subject_snapshot, null, 2)}</pre>
            </details>
            {typeof selected.subject_snapshot.hlsKey === "string" && <div className="stack">
              <div className="notice notice-warning"><AlertTriangle size={16} aria-hidden="true" /> Reported media does not autoplay. Load it only when needed for review.</div>
              <MediaPreview source={`/api/moderation/reports/${selected.id}/media/master.m3u8`} />
            </div>}
          </article>

          {(selected.status === "OPEN" || selected.status === "IN_REVIEW") && <article className="card stack review-panel">
            <div>
              <h2>Review action</h2>
              <p className="meta">Every action is attributed and added to the immutable audit trail.</p>
            </div>
            <div className="cluster review-utility-actions">
              <button className="button-secondary" disabled={busyAction !== null} onClick={() => void claim()}>
                <Eye size={17} aria-hidden="true" /> {busyAction === "claim" ? "Claiming…" : "Claim review"}
              </button>
              <button type="button" className="button-secondary" disabled={busyAction !== null} aria-pressed={legalHoldMode === "apply"} onClick={() => setLegalHoldMode("apply")}>
                <LockKeyhole size={17} aria-hidden="true" /> Apply legal hold
              </button>
              <button type="button" className="button-quiet" disabled={busyAction !== null} aria-pressed={legalHoldMode === "release"} onClick={() => setLegalHoldMode("release")}>Release hold</button>
              {selected.station_id && <><button type="button" className="button-secondary" disabled={busyAction !== null} aria-pressed={explicitMode === true} onClick={() => setExplicitMode(true)}>Enforce explicit</button><button type="button" className="button-quiet" disabled={busyAction !== null} aria-pressed={explicitMode === false} onClick={() => setExplicitMode(false)}>Clear explicit</button></>}
            </div>

            {legalHoldMode && <form className="legal-hold-form" onSubmit={changeLegalHold}>
              <label>{legalHoldMode === "apply" ? "Reason for legal hold" : "Reason for releasing legal hold"}
                <textarea name="note" required minLength={3} maxLength={2000} autoFocus />
              </label>
              <div className="cluster">
                <button disabled={busyAction !== null}>{busyAction === "legal-hold" ? "Saving…" : legalHoldMode === "apply" ? "Confirm legal hold" : "Confirm release"}</button>
                <button type="button" className="button-quiet" disabled={busyAction !== null} onClick={() => setLegalHoldMode(null)}>Cancel</button>
              </div>
            </form>}

            {explicitMode !== null && <form className="legal-hold-form" onSubmit={changeExplicitEnforcement}>
              <label>{explicitMode ? "Reason for explicit enforcement" : "Reason for clearing explicit enforcement"}<textarea name="note" required minLength={3} maxLength={1000} autoFocus /></label>
              <div className="cluster"><button disabled={busyAction !== null}>{busyAction === "explicit" ? "Saving…" : "Confirm classification"}</button><button type="button" className="button-quiet" disabled={busyAction !== null} onClick={() => setExplicitMode(null)}>Cancel</button></div>
            </form>}

            <form className="stack decision-form" key={selected.id} onSubmit={decide} aria-busy={busyAction === "decision"}>
              <div className="form-grid">
                <label>Decision
                  <select name="action" defaultValue={selected.subject_type === "CHAT_MESSAGE" ? "HIDE_MESSAGE" : "RESTRICT_STATION"}>
                    <option value="DISMISS">Dismiss — no violation</option>
                    <option value="ESCALATE">Escalate for further review</option>
                    {selected.subject_type === "CHAT_MESSAGE" && <option value="HIDE_MESSAGE">Hide message</option>}
                    <option value="RESTRICT_STATION">Restrict station</option>
                    <option value="RESTORE_STATION">Restore station access</option>
                  </select>
                </label>
                <label>Decision note
                  <textarea name="note" required minLength={3} maxLength={2000} placeholder="Record the policy basis and relevant context." />
                </label>
              </div>
              <button disabled={busyAction !== null}><Check size={17} aria-hidden="true" /> {busyAction === "decision" ? "Recording…" : "Record decision"}</button>
            </form>
          </article>}

          <article className="card stack audit-card">
            <div>
              <h2>Audit trail</h2>
              <p className="meta">Chronological reviewer and automation activity.</p>
            </div>
            {auditLoading ? <p className="meta" role="status">Loading audit activity…</p> : audit.length > 0 ? <ol className="audit-list">
              {audit.map((entry) => <li className="audit-entry" key={entry.id}>
                <span className="audit-marker" aria-hidden="true" />
                <div>
                  <strong>{readable(entry.action)}</strong>
                  <span className="meta">{entry.actor_name} · {entry.actor_type.toLocaleLowerCase()} · {new Date(entry.created_at).toLocaleString()}</span>
                  {entry.note && <p>{entry.note}</p>}
                </div>
              </li>)}
            </ol> : <p className="meta">No audit activity has been recorded for this report.</p>}
          </article>
        </> : <div className="empty moderation-detail-empty">
          <h2>Select a report</h2>
          <p>Choose a queue item to inspect its captured context and review history.</p>
        </div>}
      </section>
    </div>

    {isAdmin && <section className="card stack automation-panel" aria-labelledby="automation-title">
      <div className="automation-header">
        <div>
          <p className="eyebrow">Administrator only</p>
          <h2 id="automation-title">Automation credentials</h2>
          <p className="meta">Issue and revoke scoped access for moderation services. Raw tokens are shown once and stored only as SHA-256 hashes.</p>
        </div>
        <Bot size={22} aria-hidden="true" />
      </div>
      <form className="automation-create" onSubmit={createToken}>
        <label>Service name<input name="name" required minLength={2} maxLength={80} placeholder="Example: overnight review worker" /></label>
        <div>
          <span className="meta">Granted scopes</span>
          <div className="cluster"><span className="scope-chip">reports:read</span><span className="scope-chip">reports:decide</span></div>
        </div>
        <button disabled={busyAction !== null}><Shield size={17} aria-hidden="true" /> {busyAction === "create-token" ? "Creating…" : "Create token"}</button>
      </form>
      {token && <div className="notice notice-warning" role="status">
        <strong>Copy this token now. It will not be shown again.</strong>
        <code className="token-output">{token}</code>
      </div>}
      {serviceTokensLoading ? <p className="meta" role="status">Loading automation credentials…</p> : serviceTokens.length > 0 ? <div className="service-token-list">
        {serviceTokens.map((item) => <div className="service-token" key={item.id}>
          <div>
            <div className="cluster"><strong>{item.name}</strong><span className={`status ${item.active ? "status-success" : ""}`}>{item.active ? "active" : "revoked"}</span></div>
            <p className="meta">{item.scopes.join(", ")} · created {new Date(item.created_at).toLocaleDateString()}{item.last_used_at ? ` · last used ${new Date(item.last_used_at).toLocaleString()}` : " · never used"}</p>
          </div>
          {item.active && <button type="button" className="button-danger" disabled={busyAction !== null} onClick={() => void revokeToken(item.id, item.name)}>Revoke</button>}
        </div>)}
      </div> : <div className="empty automation-empty"><h2>No service tokens</h2><p>Create one only when a trusted moderation service needs API access.</p></div>}
    </section>}
  </div>;
}
