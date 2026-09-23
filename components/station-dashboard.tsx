"use client";

import Link from "next/link";
import { Eye, Layers3, Radio, RotateCcw, Settings, Tv, Video } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProgrammingMode, StationKind } from "@/lib/station-kind";

type Station = {
  id: string; name: string; description: string; mode: "ON_DEMAND" | "SYNCHRONIZED";
  playback_type: "conventional" | "WEATHERSTAR_4000";
  station_kind: StationKind; programming_mode: ProgrammingMode; time_zone: string;
  access_enabled: boolean; broadcast_state: "RUNNING" | "STOPPED"; ready_count: number;
  storage_bytes: string; purge_after: string | null;
  visibility: "PRIVATE" | "PUBLIC"; genre_name: string;
};

function bytes(value: string): string {
  const amount = Number(value);
  if (amount < 1024 ** 2) return `${(amount / 1024).toFixed(1)} KB`;
  if (amount < 1024 ** 3) return `${(amount / 1024 ** 2).toFixed(1)} MB`;
  return `${(amount / 1024 ** 3).toFixed(1)} GB`;
}

export function StationDashboard({ stations, deleted, initialCounts, selectedKind }: { stations: Station[]; deleted: Station[]; initialCounts: Record<string, number>; selectedKind: "all" | "tv" | "radio" }) {
  const [counts, setCounts] = useState(initialCounts);
  const [error, setError] = useState("");
  const stationKind = selectedKind === "all" ? null : selectedKind.toUpperCase() as StationKind;
  const visibleStations = stationKind ? stations.filter((station) => station.station_kind === stationKind) : stations;
  const visibleDeleted = stationKind ? deleted.filter((station) => station.station_kind === stationKind) : deleted;
  const scopeName = selectedKind === "tv" ? "TV" : selectedKind === "radio" ? "Radio" : "";

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/stations/presence", { cache: "no-store" });
        if (response.ok) setCounts((await response.json()).counts);
      } catch { /* counts are best effort */ }
    };
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function restore(id: string) {
    setError("");
    const response = await fetch(`/api/stations/${id}/restore`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "The station could not be restored."); return; }
    window.location.reload();
  }

  return <div className="stack-lg">
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    <nav className="station-kind-filter" aria-label="Station type">{(["all", "tv", "radio"] as const).map((kind) => <Link key={kind} href={kind === "all" ? "/dashboard" : `/dashboard?type=${kind}`} className={selectedKind === kind ? "button-secondary active" : "button-quiet"} aria-current={selectedKind === kind ? "page" : undefined}>{kind === "all" ? "All" : kind === "tv" ? "TV" : "Radio"}</Link>)}</nav>
    {visibleStations.length ? <div className="dashboard-grid">{visibleStations.map((station) => <article className={`card station-card station-card-${station.station_kind.toLowerCase()}`} key={station.id}>
      <div className="card-header"><div className="cluster"><span className={`status ${station.broadcast_state === "RUNNING" ? "status-success" : "status-warning"}`}>{station.broadcast_state === "RUNNING" ? "Running" : "Stopped"}</span><span className="station-type-badge">{station.station_kind === "TV" ? "TV" : "Radio"}</span></div>{station.station_kind === "RADIO" ? <Radio size={20} color="#b8bcc4" aria-hidden="true" /> : <Tv size={20} color="#b8bcc4" aria-hidden="true" />}</div>
      <div><div className="cluster"><span className={`status ${station.visibility === "PUBLIC" ? "status-success" : ""}`}>{station.visibility.toLocaleLowerCase()}</span><span className="meta">{station.genre_name}</span></div><h2>{station.name}</h2><p className="meta">{station.description || "No station description yet."}</p></div>
      <div className="cluster station-audience"><Eye size={15} /><strong>{counts[station.id] ?? 0}</strong><span className="meta">tuned in</span></div>
      <div className="station-card-footer"><span className="meta cluster">{station.station_kind === "RADIO" ? <Radio size={15} /> : <Video size={15} />} {station.ready_count} ready · {bytes(station.storage_bytes)}</span><span className="meta">{station.programming_mode === "CLOCK" ? station.time_zone : "Always running"}</span></div>
      <div className="station-card-actions"><Link className="button button-secondary" href={`/stations/${station.id}`}><Settings size={16} /> Manage</Link><Link className="button" href={`/stations/${station.id}/production`}><Layers3 size={16} /> Production</Link></div>
    </article>)}</div> : <section className="empty"><h2>{scopeName ? `No ${scopeName} stations` : "No stations on the air yet"}</h2><p>{scopeName ? `Create a ${scopeName} station or choose another type.` : "Create a TV or Radio station to begin programming."}</p></section>}
    {visibleDeleted.length > 0 && <section className="stack"><div><p className="eyebrow">Recovery</p><h2>Recently deleted{scopeName ? ` ${scopeName}` : ""}</h2><p className="meta">Stations can be restored until their scheduled purge.</p></div>{visibleDeleted.map((station) => <div className="card deleted-station" key={station.id}><div><strong>{station.name}</strong><p className="meta">Purge scheduled {station.purge_after ? new Date(station.purge_after).toLocaleString() : "soon"}</p></div><button className="button-secondary" onClick={() => void restore(station.id)}><RotateCcw size={16} /> Restore</button></div>)}</section>}
  </div>;
}
