"use client";

import { Disc3, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import type { RadioVisualizerId } from "@/lib/radio-visualizers";

type Preset = { id: RadioVisualizerId; name: string; description: string };
type Settings = { mode: "COVER" | "VISUALIZER"; visualizerId: RadioVisualizerId; version: number; presets: Preset[] };

async function loadSettings(stationId: string): Promise<Settings> {
  const response = await fetch(`/api/radio/stations/${stationId}/visual`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Visual settings could not be loaded.");
  return result;
}

export function RadioVisualSettings({ stationId }: { stationId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void loadSettings(stationId).then((result) => { if (active) setSettings(result); }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Visual settings could not be loaded."); });
    return () => { active = false; };
  }, [stationId]);

  async function select(mode: "COVER" | "VISUALIZER", visualizerId: RadioVisualizerId) {
    if (!settings || busy || (settings.mode === mode && settings.visualizerId === visualizerId)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/radio/stations/${stationId}/visual`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, visualizerId, expectedVersion: settings.version }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The visual could not be changed.");
      setSettings({ ...settings, mode, visualizerId, version: result.version });
      setNotice("Visual preference published. Listener devices will apply it on their next station refresh.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The visual could not be changed."); }
    finally { setBusy(false); }
  }

  if (!settings) return <section className="card"><p className="meta">{error || "Loading visual options..."}</p></section>;
  return <section className="card radio-visual-settings stack-lg" id="station-visuals" aria-labelledby="radio-visual-title">
    <div><p className="eyebrow">Television visual</p><h2 id="radio-visual-title">Choose what listeners see</h2><p className="meta">The owner’s selection is fixed for web and Roku until another visual is published.</p></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {notice && <div className="notice notice-success" role="status">{notice}</div>}
    <div className="radio-visual-grid">
      <button type="button" className={`radio-visual-card radio-visual-cover ${settings.mode === "COVER" ? "selected" : ""}`} disabled={busy} onClick={() => void select("COVER", settings.visualizerId)}><span className="radio-visual-preview"><Disc3 size={36} /></span><strong>Track Cover</strong><small>Use the current track artwork and update it automatically.</small></button>
      {settings.presets.map((preset) => <button type="button" className={`radio-visual-card ${settings.mode === "VISUALIZER" && settings.visualizerId === preset.id ? "selected" : ""}`} disabled={busy} key={preset.id} onClick={() => void select("VISUALIZER", preset.id)}><span className={`radio-visual-preview visual-${preset.id}`}><Waves size={34} /></span><strong>{preset.name}</strong><small>{preset.description}</small></button>)}
    </div>
  </section>;
}
