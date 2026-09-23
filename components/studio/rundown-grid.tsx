"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { StudioProjectDocument } from "@/lib/studio-model";

type RundownItem = StudioProjectDocument["rundown"][number];
type RundownItemType = RundownItem["type"];

const TICKS_PER_SECOND = 48_000;

export const RUNDOWN_TYPE_LABELS: Record<RundownItemType, string> = {
  SCENE: "Scene",
  CLIP: "Clip",
  SOUND_EFFECT: "SFX",
  GRAPHIC: "Graphic",
  NOTE: "Note",
};

export function formatRundownStart(ticks: string | null): string {
  if (ticks === null || !/^\d+$/.test(ticks)) return "";
  const totalSeconds = BigInt(ticks) / BigInt(TICKS_PER_SECOND);
  const hours = totalSeconds / 3600n;
  const minutes = (totalSeconds % 3600n) / 60n;
  const seconds = totalSeconds % 60n;
  return hours > 0n
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function parseRundownStart(text: string): { ok: true; ticks: string | null } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, ticks: null };
  const match = /^(?:(\d+):)?(\d{1,3}):(\d{2})$/.exec(trimmed);
  if (!match) return { ok: false };
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (seconds > 59 || (match[1] !== undefined && minutes > 59)) return { ok: false };
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return { ok: true, ticks: String(totalSeconds * TICKS_PER_SECOND) };
}

type TargetOption = { id: string; label: string };

export function rundownTargetOptions(document: StudioProjectDocument, type: RundownItemType): TargetOption[] {
  if (type === "NOTE") return [];
  if (type === "SCENE") return document.scenes.map((scene) => ({ id: scene.id, label: scene.name }));
  const trackKinds = type === "SOUND_EFFECT" ? ["AUDIO"] : type === "GRAPHIC" ? ["GRAPHICS"] : ["VIDEO", "AUDIO", "GRAPHICS", "CONTROL"];
  const options: TargetOption[] = [];
  for (const track of document.tracks) {
    if (!trackKinds.includes(track.kind)) continue;
    for (const clip of track.clips) options.push({ id: clip.id, label: `${clip.name} · ${track.name}` });
  }
  return options;
}

export type RundownGridProps = {
  document: StudioProjectDocument;
  onRundownChange(rundown: RundownItem[]): void;
};

export function RundownGrid({ document, onRundownChange }: RundownGridProps) {
  const [newType, setNewType] = useState<RundownItemType>("NOTE");
  const [newLabel, setNewLabel] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const rundown = document.rundown;
  const hardStarts = rundown.filter((item) => item.scheduledTicks !== null).length;

  function replaceItem(itemId: string, change: Partial<RundownItem>): void {
    onRundownChange(rundown.map((item) => item.id === itemId ? { ...item, ...change } : item));
  }

  function moveItem(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= rundown.length) return;
    const next = [...rundown];
    [next[index], next[target]] = [next[target], next[index]];
    onRundownChange(next);
  }

  function duplicateItem(index: number): void {
    if (rundown.length >= 2000) return;
    const source = rundown[index];
    const next = [...rundown];
    next.splice(index + 1, 0, { ...source, id: crypto.randomUUID() });
    onRundownChange(next);
  }

  function deleteItem(index: number): void {
    onRundownChange(rundown.filter((_, itemIndex) => itemIndex !== index));
  }

  function addItem(): void {
    const label = newLabel.trim() || RUNDOWN_TYPE_LABELS[newType];
    if (rundown.length >= 2000) return;
    onRundownChange([...rundown, { id: crypto.randomUUID(), type: newType, label: label.slice(0, 160), scheduledTicks: null, targetId: null }]);
    setNewLabel("");
  }

  function commitStart(item: RundownItem, text: string): void {
    if (text.trim() === formatRundownStart(item.scheduledTicks)) return;
    const parsed = parseRundownStart(text);
    if (!parsed.ok) {
      setStartError(`"${text.trim()}" is not a valid start. Use minutes:seconds or hours:minutes:seconds, or leave blank to float.`);
      return;
    }
    setStartError(null);
    replaceItem(item.id, { scheduledTicks: parsed.ticks });
  }

  return <section className="rundown-workspace" aria-label="Show rundown">
    <div className="rundown-toolbar">
      <label>Cue type<select value={newType} onChange={(event) => setNewType(event.target.value as RundownItemType)}>{(Object.keys(RUNDOWN_TYPE_LABELS) as RundownItemType[]).map((type) => <option key={type} value={type}>{RUNDOWN_TYPE_LABELS[type]}</option>)}</select></label>
      <label>Story slug<input value={newLabel} maxLength={160} placeholder="Opening headlines" onChange={(event) => setNewLabel(event.target.value)} /></label>
      <button type="button" disabled={rundown.length >= 2000} onClick={addItem}><Plus size={16} aria-hidden="true" /> Add cue</button>
      <span className="rundown-summary" role="status">{rundown.length} rows · {hardStarts} hard start{hardStarts === 1 ? "" : "s"}</span>
    </div>
    {startError && <div className="notice notice-error" role="alert">{startError}</div>}
    {rundown.length === 0
      ? <div className="empty"><h2>No cues yet</h2><p>Add scenes, clips, sound effects, graphics, and operator notes to build the running order. Rows autosave into the show draft and freeze when you publish a release.</p></div>
      : <div className="rundown-grid-wrap"><table className="rundown-grid">
        <caption className="sr-only">Show rundown rows in running order</caption>
        <thead><tr><th scope="col">Page</th><th scope="col">Story slug</th><th scope="col">Segment</th><th scope="col">Start</th><th scope="col">Source</th><th scope="col"><span className="sr-only">Row actions</span></th></tr></thead>
        <tbody>
          {rundown.map((item, index) => {
            const targets = rundownTargetOptions(document, item.type);
            const missingTarget = item.targetId !== null && !targets.some((target) => target.id === item.targetId);
            return <tr key={item.id}>
              <th scope="row">A{index + 1}</th>
              <td><input aria-label={`Row A${index + 1} story slug`} value={item.label} maxLength={160} onChange={(event) => replaceItem(item.id, { label: event.target.value || item.label })} /></td>
              <td><select aria-label={`Row A${index + 1} segment type`} value={item.type} onChange={(event) => replaceItem(item.id, { type: event.target.value as RundownItemType, targetId: null })}>{(Object.keys(RUNDOWN_TYPE_LABELS) as RundownItemType[]).map((type) => <option key={type} value={type}>{RUNDOWN_TYPE_LABELS[type]}</option>)}</select></td>
              <td><input
                aria-label={`Row A${index + 1} hard start`}
                key={`${item.id}:${item.scheduledTicks ?? "float"}`}
                defaultValue={formatRundownStart(item.scheduledTicks)}
                placeholder="float"
                inputMode="numeric"
                onBlur={(event) => commitStart(item, event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
              /></td>
              <td>{item.type === "NOTE"
                ? <span className="meta">—</span>
                : targets.length
                  ? <select aria-label={`Row A${index + 1} source`} value={item.targetId ?? ""} onChange={(event) => replaceItem(item.id, { targetId: event.target.value || null })}><option value="">Unassigned</option>{missingTarget && <option value={item.targetId!}>Missing source — choose a replacement</option>}{targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select>
                  : <span className="meta">No {RUNDOWN_TYPE_LABELS[item.type].toLowerCase()} targets in this show yet</span>}</td>
              <td className="rundown-row-actions">
                <button type="button" className="button-quiet" aria-label={`Move row A${index + 1} up`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" className="button-quiet" aria-label={`Move row A${index + 1} down`} disabled={index === rundown.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                <button type="button" className="button-quiet" aria-label={`Duplicate row A${index + 1}`} onClick={() => duplicateItem(index)}><Copy size={14} aria-hidden="true" /></button>
                <button type="button" className="button-danger" aria-label={`Delete row A${index + 1}`} onClick={() => deleteItem(index)}><Trash2 size={14} aria-hidden="true" /></button>
              </td>
            </tr>;
          })}
        </tbody>
      </table></div>}
    <p className="meta">Blank starts float after the previous row. These rows publish inside the immutable production release.</p>
  </section>;
}
