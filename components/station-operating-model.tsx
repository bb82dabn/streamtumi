"use client";

import { RadioTower, RefreshCw, Route } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Strategy = "PLAYLIST_LOOP" | "WEEKLY_SCHEDULE" | "CALENDAR_EVENTS" | "SMART_ROTATION";
type ModelData = {
  stationKind: "TV" | "RADIO";
  activeProfileId: string;
  deliveryManagement: "AUTOMATIC";
  profiles: Array<{ id: string; name: string; strategy: Strategy; lifecycle: "DRAFT" | "ACTIVE" | "ARCHIVED"; migrationPreview: { activatable?: boolean; warnings?: string[] } }>;
  strategies: Array<{ id: Strategy; label: string }>;
};

export function StationOperatingModel({ stationId }: { stationId: string }) {
  const [data, setData] = useState<ModelData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/stations/${stationId}/programming-profiles`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Station operating model could not be loaded.");
    setData(body);
  }, [stationId]);

  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Station operating model could not be loaded.")); }, [load]);

  async function createPlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/stations/${stationId}/programming-profiles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), strategy: form.get("strategy") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Migration plan could not be created.");
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Migration plan could not be created.");
    } finally { setBusy(false); }
  }

  const active = data?.profiles.find((profile) => profile.id === data.activeProfileId);
  const drafts = data?.profiles.filter((profile) => profile.lifecycle === "DRAFT") ?? [];
  const calendars = data?.profiles.filter((profile) => profile.strategy === "CALENDAR_EVENTS" && (profile.lifecycle === "DRAFT" || profile.lifecycle === "ACTIVE")) ?? [];
  return <section className="card station-operating-model" aria-labelledby="operating-model-title">
    <div className="card-header"><div><p className="eyebrow">Choice &amp; freedom</p><h2 id="operating-model-title">How This Station Runs</h2><p className="meta">Published automation keeps the station running continuously.</p></div><RadioTower size={21} aria-hidden="true" /></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {!data ? <p className="meta">Loading operating model…</p> : <>
      <div className="operating-model-axes"><div><span>Format</span><strong>{data.stationKind === "TV" ? "TV" : "Radio"}</strong><small>{data.stationKind === "TV" ? "video-first output" : "audio-first output"}</small></div><div><span>Automation</span><strong>{active?.name ?? "Not configured"}</strong><small>{active?.strategy.replaceAll("_", " ").toLowerCase()}</small></div><div><span>Source</span><strong>Local media</strong><small>Published schedules are authoritative</small></div><div><span>Delivery</span><strong>Automatic</strong><small>StreamTumi chooses the safe implementation</small></div></div>
      {calendars.length > 0 && <div className="cluster">{calendars.map((profile) => <a className="button button-secondary" href={`/stations/${stationId}/calendar/${profile.id}`} aria-label={`Manage Calendar for ${profile.name}`} key={profile.id}>Manage Calendar</a>)}</div>}
      {drafts.length > 0 && <div className="programming-profile-drafts"><strong>Migration plans</strong>{drafts.map((profile) => <article key={profile.id}><div><span>{profile.name}</span><small>{profile.strategy.replaceAll("_", " ").toLowerCase()}</small></div><span className={`status ${profile.migrationPreview.activatable ? "status-success" : "status-warning"}`}>{profile.migrationPreview.activatable ? "Ready to review" : "Compiler required"}</span>{Boolean(profile.migrationPreview.warnings?.length) && <ul>{profile.migrationPreview.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</article>)}</div>}
      <details className="operating-model-customize"><summary><Route size={15} /> Explore another programming mode</summary><form className="form-grid" onSubmit={(event) => void createPlan(event)}><label>Plan name<input name="name" required maxLength={120} placeholder="Holiday calendar" /></label><label>Programming style<select name="strategy" required defaultValue=""><option value="" disabled>Choose a mode</option>{data.strategies.filter((strategy) => strategy.id !== active?.strategy).map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.label}</option>)}</select></label><div className="cluster"><button disabled={busy}><Route size={15} /> {busy ? "Planning…" : "Create Migration Preview"}</button><button type="button" className="button-quiet" disabled={busy} onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></div><p className="meta">This creates a draft compatibility plan only. It cannot change what is currently on air.</p></form></details>
    </>}
  </section>;
}
