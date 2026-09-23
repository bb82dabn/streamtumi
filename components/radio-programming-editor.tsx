"use client";

import { ArrowDown, ArrowUp, CalendarClock, Check, Pencil, Plus, Save, Send, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type ReadyTrack = { id: string; title: string; artist: string; album: string; durationMs: number; has_artwork: boolean };
type Rotation = { id: string; name: string; purpose: "CONTENT" | "JINGLE" | "FALLBACK"; trackIds: string[] };
type ClockBlock = {
  id: string;
  startMinute: number;
  rotationId: string;
  page: number;
  storySlug: string;
  segmentType: "STORY" | "PACKAGE" | "VO" | "SOT" | "LIVE" | "BREAK" | "BUMP" | "GRAPHIC" | "AUDIO" | "COMMAND" | "NOTE";
  plannedDurationMs: number | null;
  editorialStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "KILLED";
  technicalStatus: "UNCHECKED" | "READY" | "WARNING" | "BLOCKED";
  talent: string;
  cameraSourceNote: string;
  script: string;
  notes: string;
};
type ClockBlockPayload = Omit<ClockBlock, "id">;
type ProgrammingData = {
  draftVersion: number;
  timeZone: string;
  broadcastState: "RUNNING" | "STOPPED";
  playout: { status: "OFFLINE" | "STARTING" | "RUNNING" | "DEGRADED" | "FAILED"; error: string | null };
  delivery?: { mode: "PLAYOUT" | "STATIC_HLS"; ready: boolean };
  activeRelease: { id: string; releaseNumber: number; sourceDraftVersion: number; publishedAt: string } | null;
  rotations: Rotation[];
  blocks: ClockBlock[];
  tracks: ReadyTrack[];
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const commonTimeZones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Europe/London", "Europe/Paris", "Africa/Nairobi", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

function clockLabel(startMinute: number): string {
  const day = Math.floor(startMinute / 1440);
  const minutes = startMinute % 1440;
  return `${weekdays[day]} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function trackDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function clockBlockPayload(block: ClockBlock): ClockBlockPayload {
  return {
    startMinute: block.startMinute,
    rotationId: block.rotationId,
    page: block.page,
    storySlug: block.storySlug,
    segmentType: block.segmentType,
    plannedDurationMs: block.plannedDurationMs,
    editorialStatus: block.editorialStatus,
    technicalStatus: block.technicalStatus,
    talent: block.talent,
    cameraSourceNote: block.cameraSourceNote,
    script: block.script,
    notes: block.notes,
  };
}

export function RadioProgrammingEditor({ stationId }: { stationId: string }) {
  const [data, setData] = useState<ProgrammingData | null>(null);
  const [selectedRotationId, setSelectedRotationId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(`/api/radio/stations/${stationId}/programming`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Programming could not be loaded.");
    setData(result);
    setSelectedRotationId((current) => current && result.rotations.some((rotation: Rotation) => rotation.id === current) ? current : result.rotations[0]?.id ?? null);
  }

  useEffect(() => {
    let active = true;
    const initial = async () => {
      try {
        const response = await fetch(`/api/radio/stations/${stationId}/programming`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Programming could not be loaded.");
        if (active) {
          setData(result);
          setSelectedRotationId(result.rotations[0]?.id ?? null);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Programming could not be loaded.");
      }
    };
    void initial();
    const timer = window.setInterval(() => void initial(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [stationId]);

  async function request(url: string, options: RequestInit, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, options);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The programming change failed.");
      await load();
      setNotice(success);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The programming change failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <section className="radio-programming card"><p className="meta">{error || "Loading weekly programming..."}</p></section>;
  const selectedRotation = data.rotations.find((rotation) => rotation.id === selectedRotationId) ?? null;
  const tracksById = new Map(data.tracks.map((track) => [track.id, track]));
  const published = data.activeRelease?.sourceDraftVersion === data.draftVersion;

  async function createRotation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await request(`/api/radio/stations/${stationId}/rotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), purpose: form.get("purpose"), expectedDraftVersion: data!.draftVersion }),
    }, "Rotation created.");
    if (result?.id) setSelectedRotationId(result.id);
    event.currentTarget.reset();
  }

  async function replaceRotation(trackIds: string[]) {
    if (!selectedRotation) return;
    await request(`/api/radio/rotations/${selectedRotation.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds, expectedDraftVersion: data!.draftVersion }),
    }, "Rotation updated.");
  }

  async function renameRotation(rotation: Rotation) {
    const name = window.prompt("Rotation name", rotation.name);
    if (!name) return;
    await request(`/api/radio/rotations/${rotation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, purpose: rotation.purpose, expectedDraftVersion: data!.draftVersion }),
    }, "Rotation renamed.");
  }

  async function deleteRotation(rotation: Rotation) {
    if (!window.confirm(`Delete “${rotation.name}”?`)) return;
    await request(`/api/radio/rotations/${rotation.id}?expectedDraftVersion=${data!.draftVersion}`, { method: "DELETE" }, "Rotation deleted.");
  }

  async function addBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const day = Number(form.get("day"));
    const [hour, minute] = String(form.get("time")).split(":").map(Number);
    const startMinute = day * 1440 + hour * 60 + minute;
    const rotationId = String(form.get("rotationId"));
    const rotationName = data!.rotations.find((rotation) => rotation.id === rotationId)?.name ?? "Clock block";
    const blocks: ClockBlockPayload[] = [...data!.blocks.map(clockBlockPayload), {
      startMinute, rotationId, page: data!.blocks.length + 1, storySlug: rotationName,
      segmentType: "AUDIO", plannedDurationMs: null, editorialStatus: "DRAFT",
      technicalStatus: "UNCHECKED", talent: "", cameraSourceNote: "", script: "", notes: "",
    }];
    await saveClock(blocks);
  }

  async function saveClock(blocks: ClockBlockPayload[], timeZone = data!.timeZone) {
    await request(`/api/stations/${stationId}/clock`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks, timeZone, expectedDraftVersion: data!.draftVersion }),
    }, "Weekly clock saved as a draft.");
  }

  function saveBlockMetadata(block: ClockBlock, form: FormData): void {
    const plannedText = String(form.get("plannedSeconds") ?? "").trim();
    const next: ClockBlock = {
      ...block,
      page: Number(form.get("page")),
      storySlug: String(form.get("storySlug")),
      segmentType: String(form.get("segmentType")) as ClockBlock["segmentType"],
      plannedDurationMs: plannedText ? Number(plannedText) * 1000 : null,
      editorialStatus: String(form.get("editorialStatus")) as ClockBlock["editorialStatus"],
      technicalStatus: String(form.get("technicalStatus")) as ClockBlock["technicalStatus"],
      talent: String(form.get("talent") ?? ""),
      cameraSourceNote: String(form.get("cameraSourceNote") ?? ""),
      script: String(form.get("script") ?? ""),
      notes: String(form.get("notes") ?? ""),
    };
    void saveClock(data!.blocks.map((candidate) => clockBlockPayload(candidate.id === block.id ? next : candidate)));
  }

  return <section className="card radio-programming stack-lg" id="weekly-programming" aria-labelledby="radio-programming-title">
    <div className="radio-programming-header"><div><p className="eyebrow">Station programming</p><h2 id="radio-programming-title"><span className="basic-only">Radio Schedule</span><span className="advanced-only">Rotations and Weekly Clock</span></h2><p className="meta"><span className="basic-only">Group tracks, choose when each group starts, then publish the schedule.</span><span className="advanced-only">Each clock block starts a rotation and runs until the next block. The final block wraps into Monday.</span></p></div><div className="radio-publish-state"><span className={`status ${published ? "status-success" : "status-warning"}`}>{published ? "Published" : "Changes need publishing"}</span>{data.activeRelease && <span className="meta advanced-only">Release {data.activeRelease.releaseNumber}</span>}<span className={`status advanced-only ${data.playout.status === "RUNNING" ? "status-success" : data.playout.status === "FAILED" ? "status-error" : "status-warning"}`}>Delivery {data.playout.status.toLowerCase()}</span></div></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {notice && <div className="notice notice-success" role="status">{notice}</div>}

    <div className="radio-programming-grid">
      <section className="radio-programming-panel stack">
        <div><h3><span className="basic-only">1. Create music groups</span><span className="advanced-only">1. Build rotations</span></h3><p className="meta"><span className="basic-only">Choose which tracks play together.</span><span className="advanced-only">Order matters. Add a track more than once to weight it more heavily.</span></p></div>
        <form className="radio-rotation-create" onSubmit={createRotation}><input name="name" required maxLength={80} placeholder="Group name" aria-label="Group name" /><select className="advanced-only" name="purpose" aria-label="Rotation purpose" defaultValue="CONTENT"><option value="CONTENT">Content</option><option value="JINGLE">Jingles</option><option value="FALLBACK">Fallback</option></select><button disabled={busy}><Plus size={16} /> Add</button></form>
        {data.rotations.length ? <div className="radio-rotation-tabs" role="tablist" aria-label="Rotations">{data.rotations.map((rotation) => <button type="button" role="tab" aria-selected={selectedRotationId === rotation.id} className={selectedRotationId === rotation.id ? "active" : "button-quiet"} key={rotation.id} onClick={() => setSelectedRotationId(rotation.id)}>{rotation.name}<span>{rotation.trackIds.length}</span></button>)}</div> : <div className="empty"><h3>No rotations</h3><p>Create a content rotation to begin.</p></div>}
        {selectedRotation && <>
          <div className="radio-rotation-heading"><div><strong>{selectedRotation.name}</strong><span className="meta">{selectedRotation.purpose.toLowerCase()}</span></div><div className="cluster"><button className="button-quiet" type="button" onClick={() => void renameRotation(selectedRotation)}><Pencil size={15} /> Rename</button><button className="button-quiet" type="button" onClick={() => void deleteRotation(selectedRotation)}><Trash2 size={15} /> Delete</button></div></div>
          <div className="radio-rotation-list">{selectedRotation.trackIds.map((trackId, index) => {
            const track = tracksById.get(trackId);
            return <div className="radio-rotation-item" key={`${trackId}-${index}`}><span>{index + 1}</span><div><strong>{track?.title ?? "Unavailable track"}</strong><p className="meta">{track?.artist || "Unknown artist"}{track ? ` · ${trackDuration(track.durationMs)}` : ""}</p></div><div><button type="button" className="button-quiet" disabled={busy || index === 0} aria-label="Move up" onClick={() => { const next = [...selectedRotation.trackIds]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; void replaceRotation(next); }}><ArrowUp size={15} /></button><button type="button" className="button-quiet" disabled={busy || index === selectedRotation.trackIds.length - 1} aria-label="Move down" onClick={() => { const next = [...selectedRotation.trackIds]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; void replaceRotation(next); }}><ArrowDown size={15} /></button><button type="button" className="button-quiet" disabled={busy || selectedRotation.trackIds.length === 1} aria-label="Remove track" onClick={() => void replaceRotation(selectedRotation.trackIds.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div></div>;
          })}</div>
          <label>Add a ready track<select value="" onChange={(event) => { if (event.target.value) void replaceRotation([...selectedRotation.trackIds, event.target.value]); }}><option value="">Choose a track</option>{data.tracks.map((track) => <option key={track.id} value={track.id}>{track.artist ? `${track.artist} — ` : ""}{track.title}</option>)}</select></label>
        </>}
      </section>

      <section className="radio-programming-panel stack">
        <div><h3><span className="basic-only">2. Schedule start times</span><span className="advanced-only">2. Place clock blocks</span></h3><p className="meta"><span className="basic-only">Choose when each music group should begin.</span><span className="advanced-only">Times use the station timezone. DST gaps are skipped; repeated times use the earlier occurrence.</span></p></div>
        <form className="radio-time-zone-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void saveClock(data.blocks.map(clockBlockPayload), String(form.get("timeZone"))); }}><label>Station timezone<input name="timeZone" list="radio-time-zones" required defaultValue={data.timeZone} /></label><button className="button-secondary" disabled={busy || !data.blocks.length}>Save timezone</button></form>
        <datalist id="radio-time-zones">{commonTimeZones.map((zone) => <option value={zone} key={zone} />)}</datalist>
        <form className="radio-clock-create" onSubmit={addBlock}>
          <label>Day<select name="day" defaultValue="0">{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>
          <label>Start time<input name="time" type="time" required defaultValue="00:00" /></label>
          <label>Rotation<select name="rotationId" required defaultValue=""><option value="" disabled>Choose rotation</option>{data.rotations.map((rotation) => <option value={rotation.id} key={rotation.id}>{rotation.name}</option>)}</select></label>
          <button disabled={busy || !data.rotations.length}><CalendarClock size={16} /> Add block</button>
        </form>
        {data.blocks.length ? <div className="radio-clock-list">{[...data.blocks].sort((left, right) => left.startMinute - right.startMinute).map((block) => <article className="radio-clock-block radio-clock-rundown-block" key={block.id}>
          <CalendarClock size={18} />
          <div><span className="eyebrow advanced-only">A{block.page} · {block.segmentType}</span><strong>{block.storySlug}</strong><p className="meta">{clockLabel(block.startMinute)} · {data.rotations.find((rotation) => rotation.id === block.rotationId)?.name ?? "Missing rotation"}</p><div className="cluster advanced-only"><span className={`status ${block.editorialStatus === "APPROVED" ? "status-success" : "status-warning"}`}>{block.editorialStatus.replace("_", " ").toLowerCase()}</span><span className={`status ${block.technicalStatus === "READY" ? "status-success" : block.technicalStatus === "BLOCKED" ? "status-error" : ""}`}>{block.technicalStatus.toLowerCase()}</span></div></div>
          <button className="button-quiet" type="button" disabled={busy || data.blocks.length === 1} aria-label="Remove clock block" onClick={() => void saveClock(data.blocks.filter((candidate) => candidate.id !== block.id).map(clockBlockPayload))}><Trash2 size={16} /></button>
          <details className="radio-clock-rundown-editor advanced-only"><summary>Edit ENPS fields</summary><form className="station-rundown-form" onSubmit={(event) => { event.preventDefault(); saveBlockMetadata(block, new FormData(event.currentTarget)); }}>
            <label>Page<input name="page" type="number" min="1" max="9999" defaultValue={block.page} required /></label><label className="station-rundown-form-wide">Story slug<input name="storySlug" maxLength={160} defaultValue={block.storySlug} required /></label>
            <label>Segment<select name="segmentType" defaultValue={block.segmentType}>{["STORY", "PACKAGE", "VO", "SOT", "LIVE", "BREAK", "BUMP", "GRAPHIC", "AUDIO", "COMMAND", "NOTE"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Planned seconds<input name="plannedSeconds" type="number" min="0" max="604800" defaultValue={block.plannedDurationMs === null ? "" : Math.round(block.plannedDurationMs / 1000)} /></label>
            <label>Editorial<select name="editorialStatus" defaultValue={block.editorialStatus}><option value="DRAFT">Draft</option><option value="IN_REVIEW">In review</option><option value="APPROVED">Approved</option><option value="KILLED">Killed</option></select></label><label>Technical<select name="technicalStatus" defaultValue={block.technicalStatus}><option value="UNCHECKED">Unchecked</option><option value="READY">Ready</option><option value="WARNING">Warning</option><option value="BLOCKED">Blocked</option></select></label>
            <label className="station-rundown-form-wide">Talent<input name="talent" maxLength={500} defaultValue={block.talent} /></label><label className="station-rundown-form-wide">Source note<textarea name="cameraSourceNote" maxLength={2000} defaultValue={block.cameraSourceNote} /></label><label className="station-rundown-form-wide">Script<textarea name="script" maxLength={50000} defaultValue={block.script} /></label><label className="station-rundown-form-wide">Producer notes<textarea name="notes" maxLength={50000} defaultValue={block.notes} /></label><div className="station-rundown-actions"><button disabled={busy}><Save size={15} /> Save block</button></div>
          </form></details>
        </article>)}</div> : <div className="empty"><h3>No clock blocks</h3><p>Add the first weekly start time. It will wrap across the entire week.</p></div>}
      </section>
    </div>

    <div className="radio-publish-bar"><div><strong>{published ? "The current schedule is published" : "Changes need publishing"}</strong><p className="meta"><span className="basic-only">Publishing updates what listeners hear during the week.</span><span className="advanced-only">Publishing snapshots track metadata and prepares the current and next service weeks. Start/stop remains in the station header.</span></p>{data.playout.error && <p className="radio-error">{data.playout.error}</p>}</div><div className="cluster"><span className={`status ${data.broadcastState === "RUNNING" ? "status-success" : "status-warning"}`}>{data.broadcastState === "RUNNING" ? "Station running" : "Station stopped"}</span><button disabled={busy || published || !data.blocks.length} onClick={() => void request(`/api/stations/${stationId}/clock/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedDraftVersion: data.draftVersion }) }, "Weekly automation published.")}><Send size={17} /> <span className="basic-only">Update Radio Schedule</span><span className="advanced-only">Publish Automation</span></button></div></div>
    {published && <div className="notice notice-success"><Check size={17} /> Release {data.activeRelease?.releaseNumber} is ready for clock-derived delivery in {data.timeZone}.</div>}
  </section>;
}
