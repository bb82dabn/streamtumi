"use client";

import { Archive, Layers3, Plus, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { RundownGrid } from "@/components/studio/rundown-grid";
import { TvSceneDesigner } from "@/components/studio/tv-scene-designer";
import type { MediaAssetSummary } from "@/lib/media-assets";
import type { StudioOverview, StudioProject } from "@/lib/studio";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "The production request failed.");
  return body as T;
}

export function StudioProductionConsole({ initialOverview }: { initialOverview: StudioOverview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [selectedProjectId, setSelectedProjectId] = useState(initialOverview.projects[0]?.id ?? "");
  const [project, setProject] = useState<StudioProject | null>(null);
  const [assets, setAssets] = useState<MediaAssetSummary[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stationId = overview.station.id;

  useEffect(() => {
    if (!selectedProjectId) {
      setProject(null);
      return;
    }
    let current = true;
    setProject(null);
    setDirty(false);
    void requestJson<{ project: StudioProject }>(`/api/stations/${stationId}/studio/projects/${selectedProjectId}`)
      .then((result) => { if (current) setProject(result.project); })
      .catch((caught) => { if (current) setError(caught instanceof Error ? caught.message : "The project could not be loaded."); });
    return () => { current = false; };
  }, [selectedProjectId, stationId]);

  useEffect(() => {
    if (!overview.settings.enabled) return;
    let current = true;
    void requestJson<{ assets: MediaAssetSummary[] }>("/api/media/assets?type=ALL&status=ACTIVE&limit=100")
      .then((result) => { if (current) setAssets(result.assets); })
      .catch(() => undefined);
    return () => { current = false; };
  }, [overview.settings.enabled]);

  function updateProject(next: StudioProject): void {
    setProject(next);
    setDirty(true);
    setNotice("");
  }

  function mergeSummary(next: StudioProject): void {
    setOverview((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === next.id ? {
        id: next.id,
        name: next.name,
        description: next.description,
        draftVersion: next.draftVersion,
        activeReleaseId: next.activeReleaseId,
        activeReleaseNumber: next.activeReleaseNumber,
        activeReleaseSourceDraftVersion: next.activeReleaseSourceDraftVersion,
        activeReleaseDocumentHash: next.activeReleaseDocumentHash,
        activeReleaseCurrent: next.activeReleaseCurrent,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
      } : item),
    }));
  }

  async function enableProduction(): Promise<void> {
    setBusy("enable"); setError("");
    try {
      const next = await requestJson<StudioOverview>(`/api/stations/${stationId}/studio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, expectedVersion: overview.settings.version }),
      });
      setOverview(next);
      setSelectedProjectId(next.projects[0]?.id ?? "");
      setNotice("Production projects are enabled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Production projects could not be enabled.");
    } finally { setBusy(""); }
  }

  async function createProject(): Promise<void> {
    const name = newProjectName.trim();
    if (!name) return;
    setBusy("create"); setError("");
    try {
      const result = await requestJson<{ project: StudioProject }>(`/api/stations/${stationId}/studio/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: "" }),
      });
      setOverview((current) => ({ ...current, projects: [result.project, ...current.projects] }));
      setNewProjectName("");
      setSelectedProjectId(result.project.id);
      setNotice("Production project created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be created.");
    } finally { setBusy(""); }
  }

  async function saveProject(candidate = project): Promise<StudioProject | null> {
    if (!candidate) return null;
    setBusy("save"); setError("");
    try {
      const result = await requestJson<{ project: StudioProject }>(`/api/stations/${stationId}/studio/projects/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.name,
          description: candidate.description,
          document: candidate.document,
          expectedDraftVersion: candidate.draftVersion,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setProject(result.project);
      mergeSummary(result.project);
      setDirty(false);
      setNotice(`Draft v${result.project.draftVersion} saved.`);
      return result.project;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be saved.");
      return null;
    } finally { setBusy(""); }
  }

  async function publishProject(): Promise<void> {
    let candidate = project;
    if (!candidate) return;
    if (dirty) candidate = await saveProject(candidate);
    if (!candidate) return;
    setBusy("publish"); setError("");
    try {
      const result = await requestJson<{ project: StudioProject }>(`/api/stations/${stationId}/studio/projects/${candidate.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedDraftVersion: candidate.draftVersion, idempotencyKey: crypto.randomUUID() }),
      });
      setProject(result.project);
      mergeSummary(result.project);
      setNotice(`Production release r${result.project.activeReleaseNumber} published.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be published.");
    } finally { setBusy(""); }
  }

  async function upgradeProject(): Promise<void> {
    if (!project) return;
    setBusy("upgrade"); setError("");
    try {
      const result = await requestJson<{ project: StudioProject }>(`/api/stations/${stationId}/studio/projects/${project.id}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedDraftVersion: project.draftVersion, idempotencyKey: crypto.randomUUID() }),
      });
      setProject(result.project);
      mergeSummary(result.project);
      setNotice("The TV project was upgraded to the scene designer format.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be upgraded.");
    } finally { setBusy(""); }
  }

  if (!overview.settings.enabled) {
    return <main className="shell page"><section className="card stack"><p className="eyebrow">Production</p><h1>Build reusable show projects</h1><p className="meta">Create scene layouts, radio boards, rundowns, and immutable releases without changing station playout.</p>{error && <div className="notice notice-error" role="alert">{error}</div>}<button type="button" disabled={Boolean(busy)} onClick={() => void enableProduction()}><Archive size={17} /> {busy ? "Enabling..." : "Enable production projects"}</button></section></main>;
  }

  const audioAssets = assets.filter((asset) => asset.type === "AUDIO" && asset.preview);
  const board = project?.document.radioBoard;
  return <main className="shell page stack-lg">
    <section className="card stack">
      <div className="card-header"><div><p className="eyebrow">Production</p><h1>{overview.station.name} projects</h1><p className="meta">Draft reusable layouts and rundowns. Station playout remains controlled by published automation.</p></div><Layers3 size={22} /></div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {notice && <div className="notice notice-success" role="status">{notice}</div>}
      <div className="form-grid">
        <label>Project<select value={selectedProjectId} onChange={(event) => { if (!dirty || window.confirm("Discard unsaved changes?")) setSelectedProjectId(event.target.value); }}>{overview.projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>New project<span className="cluster"><input value={newProjectName} maxLength={120} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Show name" /><button type="button" disabled={Boolean(busy) || !newProjectName.trim()} onClick={() => void createProject()}><Plus size={16} /> Create</button></span></label>
      </div>
      {project && <div className="form-grid"><label>Name<input value={project.name} maxLength={120} onChange={(event) => updateProject({ ...project, name: event.target.value })} /></label><label>Description<input value={project.description} maxLength={500} onChange={(event) => updateProject({ ...project, description: event.target.value })} /></label></div>}
      {project && <div className="cluster"><span className={`status ${dirty ? "status-warning" : "status-success"}`}>{dirty ? "Unsaved draft" : `Draft v${project.draftVersion}`}</span><span className="status">{project.activeReleaseNumber ? `Release r${project.activeReleaseNumber}${project.activeReleaseCurrent ? "" : " stale"}` : "Unpublished"}</span><button type="button" disabled={Boolean(busy) || !dirty} onClick={() => void saveProject()}><Save size={16} /> {busy === "save" ? "Saving..." : "Save draft"}</button><button type="button" className="button-secondary" disabled={Boolean(busy)} onClick={() => void publishProject()}><Send size={16} /> {busy === "publish" ? "Publishing..." : "Publish release"}</button></div>}
    </section>

    {project?.document.output.kind === "TV" && project.document.schemaVersion === 1 && <section className="card stack"><h2>Scene format upgrade</h2><p className="meta">Upgrade this historical project to edit reusable TV scenes and uploaded media sources.</p><button type="button" disabled={Boolean(busy) || dirty} onClick={() => void upgradeProject()}>Upgrade project</button></section>}
    {project?.document.output.kind === "TV" && project.document.schemaVersion === 2 && <TvSceneDesigner document={project.document} mediaAssets={assets} disabled={Boolean(busy)} onDocumentChange={(document) => updateProject({ ...project, document })} />}
    {project?.document.output.kind === "RADIO" && board && <section className="card stack"><div className="card-header"><div><p className="eyebrow">Radio board</p><h2>Decks and carts</h2><p className="meta">Assign uploaded audio for reusable production preparation.</p></div><Archive size={20} /></div><div className="form-grid">{(["A", "B"] as const).map((deck) => <label key={deck}>Deck {deck}<select value={board.decks[deck].assetId ?? ""} onChange={(event) => updateProject({ ...project, document: { ...project.document, radioBoard: { ...board, decks: { ...board.decks, [deck]: { ...board.decks[deck], assetId: event.target.value || null } } } } })}><option value="">Unassigned</option>{audioAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.title}</option>)}</select></label>)}</div><div className="form-grid">{board.carts.map((cart, index) => <label key={cart.id}>Cart {index + 1}<input value={cart.label} maxLength={80} onChange={(event) => updateProject({ ...project, document: { ...project.document, radioBoard: { ...board, carts: board.carts.map((item) => item.id === cart.id ? { ...item, label: event.target.value || item.label } : item) } } })} /><select value={cart.assetId ?? ""} onChange={(event) => updateProject({ ...project, document: { ...project.document, radioBoard: { ...board, carts: board.carts.map((item) => item.id === cart.id ? { ...item, assetId: event.target.value || null } : item) } } })}><option value="">Unassigned</option>{audioAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.title}</option>)}</select></label>)}</div></section>}
    {project && <section className="card stack"><div className="card-header"><div><p className="eyebrow">Running order</p><h2>Rundown</h2></div></div><RundownGrid document={project.document} onRundownChange={(rundown) => updateProject({ ...project, document: { ...project.document, rundown } })} /></section>}
  </main>;
}
