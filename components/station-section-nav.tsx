"use client";

import Link from "next/link";
import { Clapperboard, LayoutDashboard, Library, Settings, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

export type StationSection = "overview" | "programming" | "media" | "production" | "settings";

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "programming", label: "Programming", icon: Clapperboard },
  { id: "media", label: "Media", icon: Library },
  { id: "production", label: "Production", icon: SlidersHorizontal },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

export function StationSectionNav({ stationId, active }: { stationId: string; active: StationSection }) {
  const [mode, setMode] = useState<"basic" | "advanced">("basic");

  useEffect(() => {
    const stored = window.localStorage.getItem("streamtumi:station-dashboard-mode") === "advanced" ? "advanced" : "basic";
    setMode(stored);
    document.documentElement.dataset.dashboardMode = stored;
    return () => { delete document.documentElement.dataset.dashboardMode; };
  }, []);

  function changeMode(next: "basic" | "advanced"): void {
    setMode(next);
    window.localStorage.setItem("streamtumi:station-dashboard-mode", next);
    document.documentElement.dataset.dashboardMode = next;
  }

  return <nav className="station-section-nav" aria-label="Station management sections">
    {sections.map(({ id, label, icon: Icon }) => <Link
      className={active === id ? "active" : ""}
      href={id === "overview" ? `/stations/${stationId}` : `/stations/${stationId}/${id}`}
      aria-current={active === id ? "page" : undefined}
      key={id}
    ><Icon size={16} aria-hidden="true" />{label}</Link>)}
    <div className="station-mode-toggle" role="group" aria-label="Dashboard detail level">
      <button type="button" className={mode === "basic" ? "active" : ""} aria-pressed={mode === "basic"} onClick={() => changeMode("basic")}>Basic</button>
      <button type="button" className={mode === "advanced" ? "active" : ""} aria-pressed={mode === "advanced"} onClick={() => changeMode("advanced")}>Advanced</button>
    </div>
  </nav>;
}
