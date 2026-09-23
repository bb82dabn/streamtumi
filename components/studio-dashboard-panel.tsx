"use client";

import { Layers3, Power, RefreshCw, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type StudioOverview = {
  station: { id: string; name: string; kind: "TV" | "RADIO"; broadcastState: "RUNNING" | "STOPPED" };
  settings: { enabled: boolean; readiness: "WORKSPACE" | "PREPARING" | "LIVE_READY" | "ERROR"; version: number };
  projects: Array<{ id: string; name: string; draftVersion: number; activeReleaseNumber: number | null; activeReleaseCurrent: boolean; updatedAt: string }>;
};

export function StudioDashboardPanel({ stationId }: { stationId: string }) {
  const [overview, setOverview] = useState<StudioOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/stations/${stationId}/studio`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Studio configuration could not be loaded.");
    setOverview(body);
  }, [stationId]);

  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Studio configuration could not be loaded.")); }, [load]);

  async function toggleEnabled(): Promise<void> {
    if (!overview || busy) return;
    const enabled = !overview.settings.enabled;
    if (!enabled && !window.confirm("Disable production projects for this station?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/stations/${stationId}/studio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, expectedVersion: overview.settings.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Studio configuration could not be updated.");
      setOverview(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Studio configuration could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card studio-dashboard-panel stack" id="studio-production" aria-labelledby="studio-production-title">
    <div className="card-header"><div><p className="eyebrow">Production setup</p><h2 id="studio-production-title"><span className="basic-only">Show Projects</span><span className="advanced-only">Production Projects &amp; Releases</span></h2><p className="meta">Prepare reusable scenes, radio boards, rundowns, and immutable project releases without changing automation.</p></div><Video size={21} aria-hidden="true" /></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {!overview ? <p className="meta">Loading Studio configuration…</p> : <>
      <div className="basic-only live-show-guide">
        <div className="live-show-guide-heading"><div><h3>Prepare a Show Project</h3><p>Create and publish reusable production material for your team.</p></div><span className={`status ${overview.projects.some((project) => project.activeReleaseCurrent) ? "status-success" : "status-warning"}`}>{overview.projects.some((project) => project.activeReleaseCurrent) ? "Ready" : "Setup needed"}</span></div>
        <ol>
          <li className={overview.settings.enabled ? "done" : "current"}><span>{overview.settings.enabled ? "✓" : "1"}</span><div><strong>Enable production</strong><p>Turn on reusable show projects for this station.</p></div>{!overview.settings.enabled && <button type="button" disabled={busy} onClick={() => void toggleEnabled()}>{busy ? "Enabling…" : "Enable production"}</button>}</li>
          <li className={overview.projects.length ? "done" : "pending"}><span>{overview.projects.length ? "✓" : "2"}</span><div><strong>Choose a show</strong><p>{overview.projects.length ? `${overview.projects.length} show${overview.projects.length === 1 ? "" : "s"} available.` : "Enabling Studio creates the first show."}</p></div></li>
          <li className={overview.settings.enabled ? "current" : "pending"}><span>3</span><div><strong>{overview.station.kind === "TV" ? "Add scenes and media" : "Configure decks and carts"}</strong><p>Prepare reusable production material.</p></div>{overview.settings.enabled && <a className="button button-secondary" href={`/stations/${stationId}/setup/studio/${overview.station.kind === "TV" ? "scenes" : "board"}`}><Layers3 size={16} /> Open editor</a>}</li>
          <li className={overview.projects.some((project) => project.activeReleaseCurrent) ? "done" : "pending"}><span>{overview.projects.some((project) => project.activeReleaseCurrent) ? "✓" : "4"}</span><div><strong>Publish a version</strong><p>{overview.projects.some((project) => project.activeReleaseCurrent) ? "The current project is published." : "Open the editor, review the project, and publish it."}</p></div></li>
        </ol>
      </div>
      <div className="advanced-only stack">
        <div className="cluster"><span className={`status ${overview.settings.enabled ? "status-success" : "status-warning"}`}>{overview.settings.enabled ? "Enabled" : "Disabled"}</span><span className="meta">{overview.projects.length} show{overview.projects.length === 1 ? "" : "s"}</span></div>
        {overview.projects.length ? <div className="studio-dashboard-projects">{overview.projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><span>Draft v{project.draftVersion}</span></div><span className={`status ${project.activeReleaseCurrent ? "status-success" : "status-warning"}`}>{project.activeReleaseNumber ? `Release r${project.activeReleaseNumber}${project.activeReleaseCurrent ? "" : " stale"}` : "Unpublished"}</span></article>)}</div> : <div className="empty"><h3>No Studio shows</h3><p>Enable Studio to initialize the station’s first production show.</p></div>}
        <div className="cluster"><button type="button" className={overview.settings.enabled ? "button-danger" : "button-secondary"} disabled={busy} onClick={() => void toggleEnabled()}><Power size={16} /> {busy ? "Updating…" : overview.settings.enabled ? "Disable production" : "Enable production"}</button><button type="button" className="button-quiet" disabled={busy} onClick={() => void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Refresh failed."))}><RefreshCw size={15} /> Refresh</button>{overview.settings.enabled && <a className="button button-secondary" href={`/stations/${stationId}/setup/studio/${overview.station.kind === "TV" ? "scenes" : "board"}`}><Layers3 size={16} /> {overview.station.kind === "TV" ? "Manage scenes and media" : "Manage radio board"}</a>}</div>
      </div>
    </>}
  </section>;
}
