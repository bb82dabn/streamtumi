"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type StationKind = "TV" | "RADIO";
type EventKind = "PROGRAM" | "PREMIERE" | "OFFLINE";
type RecurrenceKind = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
type SourceKind = "TV_SCHEDULE" | "RADIO_CLOCK_BLOCK" | "NONE";
type CalendarSource =
  | { kind: "TV_SCHEDULE"; scheduleId: string }
  | { kind: "RADIO_CLOCK_BLOCK"; releaseId: string; blockId: string }
  | { kind: "NONE" };
type CalendarEvent = {
  id: string;
  title: string;
  eventKind: EventKind;
  source: CalendarSource;
  fallbackSource: CalendarSource;
  localStartDate: string;
  localStartTime: string;
  timeZone: string;
  durationMs: number;
  recurrenceKind: RecurrenceKind;
  recurrenceInterval: number;
  recurrenceCount: number | null;
  recurrenceUntilDate: string | null;
  recurrenceWeekdays: number[] | null;
  recurrenceMonthDays: number[] | null;
  dstGapPolicy: "SKIP" | "SHIFT_FORWARD";
  dstFoldPolicy: "EARLIER" | "LATER";
  priority: number;
  lateJoinPolicy: "SKIP" | "JOIN_IN_PROGRESS";
};
type CalendarException = {
  id: string;
  eventId: string;
  recurrenceKey: string;
  kind: "CANCEL" | "MOVE";
  movedLocalStartDate: string | null;
  movedLocalStartTime: string | null;
  movedTimeZone: string | null;
};
type CalendarProfile = {
  id: string;
  name: string;
  lifecycle: "DRAFT" | "ACTIVE";
  strategy: "CALENDAR_EVENTS";
};
type CalendarDraft = {
  profile: CalendarProfile;
  draftVersion: number;
  updatedAt: string | null;
  events: CalendarEvent[];
  exceptions: CalendarException[];
};
type CalendarIssue = {
  code: string;
  message: string;
  blocking: boolean;
  eventId?: string;
  recurrenceKey?: string;
  conflictingEventId?: string;
};
type CalendarOccurrence = {
  eventId: string;
  recurrenceKey: string;
  title: string;
  eventKind: EventKind;
  startsAt: string;
  endsAt: string | null;
  isMoved: boolean;
  priority: number;
};
type CalendarPreview = {
  draftVersion: number;
  horizon: { from: string; to: string };
  valid: boolean;
  occurrences: CalendarOccurrence[];
  issues: CalendarIssue[];
  errors: CalendarIssue[];
  warnings: CalendarIssue[];
};
type CalendarRelease = {
  releaseId: string;
  profileId: string;
  releaseNumber: number;
  sourceDraftVersion: number;
  publishedAt: string;
  occurrenceCount: number;
  horizonFrom: string;
  materializedThrough: string;
  idempotent: boolean;
};

const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID = new RegExp(`^${UUID_PATTERN}$`);
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const timeZones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Europe/London", "Europe/Paris", "Africa/Nairobi", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "The calendar request failed.");
  return body;
}

function emptySource(kind: SourceKind): CalendarSource {
  if (kind === "TV_SCHEDULE") return { kind, scheduleId: "" };
  if (kind === "RADIO_CLOCK_BLOCK") return { kind, releaseId: "", blockId: "" };
  return { kind: "NONE" };
}

function fixedSourceKind(stationKind: StationKind): "TV_SCHEDULE" | "RADIO_CLOCK_BLOCK" {
  return stationKind === "TV" ? "TV_SCHEDULE" : "RADIO_CLOCK_BLOCK";
}

function primarySourceKind(eventKind: EventKind, stationKind: StationKind): SourceKind {
  if (eventKind === "OFFLINE") return "NONE";
  return fixedSourceKind(stationKind);
}

function defaultWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function newCalendarEvent(stationKind: StationKind, timeZone: string): CalendarEvent {
  const date = new Date().toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID(),
    title: "",
    eventKind: "PROGRAM",
    source: emptySource(fixedSourceKind(stationKind)),
    fallbackSource: { kind: "NONE" },
    localStartDate: date,
    localStartTime: "12:00",
    timeZone,
    durationMs: 60 * 60 * 1_000,
    recurrenceKind: "NONE",
    recurrenceInterval: 1,
    recurrenceCount: null,
    recurrenceUntilDate: null,
    recurrenceWeekdays: null,
    recurrenceMonthDays: null,
    dstGapPolicy: "SKIP",
    dstFoldPolicy: "EARLIER",
    priority: 0,
    lateJoinPolicy: "JOIN_IN_PROGRESS",
  };
}

function sourceProblem(source: CalendarSource, label: string): string | null {
  if (source.kind === "TV_SCHEDULE" && !UUID.test(source.scheduleId)) return `${label} needs a published TV schedule UUID.`;
  if (source.kind === "RADIO_CLOCK_BLOCK" && (!UUID.test(source.releaseId) || !UUID.test(source.blockId))) return `${label} needs both the published clock release UUID and its immutable release block UUID.`;
  return null;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function eventProblem(event: CalendarEvent, stationKind: StationKind): string | null {
  if (!UUID.test(event.id)) return "An event has an invalid event UUID. Reload the draft and try again.";
  if (!event.title.trim()) return "Every event needs a title.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.localStartDate) || !/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(event.localStartTime)) return `“${event.title}” needs a valid local date and time.`;
  if (!validTimeZone(event.timeZone)) return `“${event.title}” needs a valid IANA timezone.`;
  if (!Number.isSafeInteger(event.durationMs) || event.durationMs <= 0) return `“${event.title}” needs a positive duration.`;
  if (event.source.kind !== primarySourceKind(event.eventKind, stationKind)) return `“${event.title}” has a source that does not match its event type.`;
  const source = sourceProblem(event.source, `Source for “${event.title}”`) || sourceProblem(event.fallbackSource, `Fallback for “${event.title}”`);
  if (source) return source;
  if (event.eventKind === "OFFLINE" && event.fallbackSource.kind !== "NONE") return `Offline event “${event.title}” cannot have a fallback source.`;
  if (!Number.isInteger(event.recurrenceInterval) || event.recurrenceInterval < 1 || event.recurrenceInterval > 366) return `“${event.title}” needs a recurrence interval from 1 to 366.`;
  if (event.recurrenceCount !== null && (!Number.isInteger(event.recurrenceCount) || event.recurrenceCount < 1 || event.recurrenceCount > 1_000_000)) return `“${event.title}” has an invalid recurrence count.`;
  if (event.recurrenceUntilDate !== null && event.recurrenceUntilDate < event.localStartDate) return `“${event.title}” has a recurrence end before its start date.`;
  if (event.recurrenceKind === "WEEKLY" && !event.recurrenceWeekdays?.length) return `“${event.title}” needs at least one weekday.`;
  if (event.recurrenceKind === "MONTHLY" && (!event.recurrenceMonthDays?.length || event.recurrenceMonthDays.some((day) => !Number.isInteger(day) || day < 1 || day > 31))) return `“${event.title}” needs valid month days from 1 to 31.`;
  return null;
}

function sourceLabel(kind: SourceKind): string {
  if (kind === "TV_SCHEDULE") return "Published TV schedule";
  if (kind === "RADIO_CLOCK_BLOCK") return "Published Radio clock block";
  return "No source";
}

function SourceEditor({ legend, source, allowedKinds, onChange }: {
  legend: string;
  source: CalendarSource;
  allowedKinds: SourceKind[];
  onChange: (source: CalendarSource) => void;
}) {
  return <fieldset className="stack">
    <legend>{legend}</legend>
    <label>Source type<select value={source.kind} onChange={(event) => onChange(emptySource(event.target.value as SourceKind))}>{allowedKinds.map((kind) => <option value={kind} key={kind}>{sourceLabel(kind)}</option>)}</select></label>
    {source.kind === "TV_SCHEDULE" && <label>Published TV schedule ID<input value={source.scheduleId} onChange={(event) => onChange({ ...source, scheduleId: event.target.value.trim() })} required pattern={UUID_PATTERN} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck={false} /></label>}
    {source.kind === "RADIO_CLOCK_BLOCK" && <>
      <label>Published clock release ID<input value={source.releaseId} onChange={(event) => onChange({ ...source, releaseId: event.target.value.trim() })} required pattern={UUID_PATTERN} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck={false} /></label>
      <label>Immutable release block ID<input value={source.blockId} onChange={(event) => onChange({ ...source, blockId: event.target.value.trim() })} required pattern={UUID_PATTERN} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck={false} /></label>
    </>}
  </fieldset>;
}

function eventKindLabel(kind: EventKind): string {
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

function recurrenceLabel(event: CalendarEvent): string {
  if (event.recurrenceKind === "NONE") return "One time";
  const interval = event.recurrenceInterval === 1 ? "" : ` every ${event.recurrenceInterval}`;
  return `${event.recurrenceKind.toLowerCase()}${interval}`;
}

export function CalendarProgrammingEditor({ stationId, profileId, stationKind, stationTimeZone }: {
  stationId: string;
  profileId: string;
  stationKind: StationKind;
  stationTimeZone: string;
}) {
  const [profile, setProfile] = useState<CalendarProfile | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CalendarPreview | null>(null);
  const [previewFrom, setPreviewFrom] = useState("");
  const [previewTo, setPreviewTo] = useState("");
  const [release, setRelease] = useState<CalendarRelease | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const publishKey = useRef<string | null>(null);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const draft = await requestJson<CalendarDraft>(`/api/stations/${stationId}/calendar?profileId=${encodeURIComponent(profileId)}`, { cache: "no-store" });
      setProfile(draft.profile);
      setDraftVersion(draft.draftVersion);
      setUpdatedAt(draft.updatedAt);
      setEvents(draft.events);
      setExceptions(draft.exceptions);
      setSelectedEventId((current) => current && draft.events.some((event) => event.id === current) ? current : draft.events[0]?.id ?? null);
      setPreview(null);
      setRelease(null);
      setDirty(false);
      publishKey.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The calendar draft could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [profileId, stationId]);

  useEffect(() => { void loadDraft(); }, [loadDraft]);

  function changed(nextEvents: CalendarEvent[]): void {
    setEvents(nextEvents);
    setDirty(true);
    setPreview(null);
    setNotice("");
    publishKey.current = null;
  }

  function addEvent(): void {
    const next = newCalendarEvent(stationKind, stationTimeZone);
    changed([...events, next]);
    setSelectedEventId(next.id);
  }

  function updateEvent(id: string, update: Partial<CalendarEvent>): void {
    changed(events.map((event) => event.id === id ? { ...event, ...update } : event));
  }

  function changeEventKind(event: CalendarEvent, eventKind: EventKind): void {
    updateEvent(event.id, {
      eventKind,
      source: emptySource(primarySourceKind(eventKind, stationKind)),
      fallbackSource: eventKind === "OFFLINE" ? { kind: "NONE" } : event.fallbackSource,
    });
  }

  function changeRecurrence(event: CalendarEvent, recurrenceKind: RecurrenceKind): void {
    updateEvent(event.id, {
      recurrenceKind,
      recurrenceCount: recurrenceKind === "NONE" ? null : event.recurrenceCount,
      recurrenceUntilDate: recurrenceKind === "NONE" ? null : event.recurrenceUntilDate,
      recurrenceWeekdays: recurrenceKind === "WEEKLY" ? event.recurrenceWeekdays?.length ? event.recurrenceWeekdays : [defaultWeekday(event.localStartDate)] : null,
      recurrenceMonthDays: recurrenceKind === "MONTHLY" ? event.recurrenceMonthDays?.length ? event.recurrenceMonthDays : [Number(event.localStartDate.slice(8, 10))] : null,
    });
  }

  function moveEvent(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= events.length) return;
    const next = [...events];
    [next[index], next[target]] = [next[target], next[index]];
    changed(next);
  }

  function removeEvent(event: CalendarEvent): void {
    if (!window.confirm(`Remove “${event.title || "Untitled event"}” from this draft?`)) return;
    const next = events.filter((candidate) => candidate.id !== event.id);
    changed(next);
    setExceptions((current) => current.filter((exception) => exception.eventId !== event.id));
    if (selectedEventId === event.id) setSelectedEventId(next[0]?.id ?? null);
  }

  function validateDraft(): boolean {
    const problem = events.map((event) => eventProblem(event, stationKind)).find(Boolean);
    if (problem) {
      setError(problem);
      return false;
    }
    setError("");
    return true;
  }

  async function saveDraft(): Promise<number | null> {
    if (!validateDraft()) return null;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ draftVersion: number }>(`/api/stations/${stationId}/calendar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, expectedDraftVersion: draftVersion, events, exceptions }),
      });
      setDraftVersion(result.draftVersion);
      setUpdatedAt(new Date().toISOString());
      setDirty(false);
      setPreview(null);
      publishKey.current = null;
      setNotice(`Draft version ${result.draftVersion} saved.`);
      return result.draftVersion;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The calendar draft could not be saved.");
      return null;
    } finally {
      setBusy("");
    }
  }

  function previewDate(value: string): string | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new Error("Choose a valid preview date and time.");
    return parsed.toISOString();
  }

  async function previewCalendar(): Promise<void> {
    const version = dirty ? await saveDraft() : draftVersion;
    if (version === null || version === 0) return;
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const from = previewDate(previewFrom);
      const to = previewDate(previewTo);
      const result = await requestJson<CalendarPreview>(`/api/stations/${stationId}/calendar/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, from, to }),
      });
      setPreview(result);
      setNotice(result.valid ? `Preview ready with ${result.occurrences.length} occurrence${result.occurrences.length === 1 ? "" : "s"}.` : "Preview found blocking calendar issues.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The calendar preview could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function publishCalendar(): Promise<void> {
    const version = dirty ? await saveDraft() : draftVersion;
    if (version === null || version === 0) return;
    setBusy("publish");
    setError("");
    setNotice("");
    const idempotencyKey = publishKey.current ?? crypto.randomUUID();
    publishKey.current = idempotencyKey;
    try {
      const result = await requestJson<CalendarRelease>(`/api/stations/${stationId}/calendar/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, expectedDraftVersion: version, idempotencyKey }),
      });
      setRelease(result);
      setNotice(`Calendar release ${result.releaseNumber} published from draft version ${result.sourceDraftVersion}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The calendar release could not be published.");
    } finally {
      setBusy("");
    }
  }

  async function activateRelease(): Promise<void> {
    if (!release) return;
    setBusy("activate");
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ releaseId: string; profileId: string; activated: boolean }>(`/api/stations/${stationId}/calendar/releases/${release.releaseId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activation: "IMMEDIATE" }),
      });
      setProfile((current) => current ? { ...current, lifecycle: "ACTIVE" } : current);
      setNotice(result.activated ? `Release ${release.releaseNumber} is active now.` : `Release ${release.releaseNumber} was already active.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The calendar release could not be activated.");
    } finally {
      setBusy("");
    }
  }

  if (loading && !profile) return <section className="card stack" aria-busy="true"><p className="meta">Loading calendar draft...</p></section>;
  if (!profile) return <section className="card stack">{error && <div className="notice notice-error" role="alert">{error}</div>}<button type="button" onClick={() => void loadDraft()}><RefreshCw size={16} aria-hidden="true" /> Retry</button></section>;

  const selected = events.find((event) => event.id === selectedEventId) ?? null;
  const fallbackKinds: SourceKind[] = ["NONE", fixedSourceKind(stationKind)];
  const blockingIssues = preview?.issues.filter((issue) => issue.blocking) ?? [];
  const warningIssues = preview?.issues.filter((issue) => !issue.blocking) ?? [];
  const names = new Map(events.map((event) => [event.id, event.title || "Untitled event"]));
  const previewBlocksPublish = preview?.draftVersion === draftVersion && !preview.valid;

  function issueText(issue: CalendarIssue): string {
    const eventName = issue.eventId ? names.get(issue.eventId) : null;
    const conflictName = issue.conflictingEventId ? names.get(issue.conflictingEventId) : null;
    return `${eventName ? `${eventName}: ` : ""}${issue.message}${conflictName ? ` Conflicts with ${conflictName}.` : ""}`;
  }

  return <div className="stack-lg">
    <section className="card stack">
      <div className="card-header"><div><p className="eyebrow">Calendar Events</p><h2>{profile.name}</h2><p className="meta">Draft version {draftVersion} · {profile.lifecycle.toLowerCase()}{updatedAt ? ` · saved ${new Date(updatedAt).toLocaleString()}` : " · not saved yet"}</p></div><span className={`status ${dirty ? "status-warning" : "status-success"}`}>{dirty ? "Unsaved changes" : "Draft saved"}</span></div>
      <div className="notice">
        <strong>Use published, immutable source IDs only.</strong>
        <p className="meta">TV schedule IDs are returned as <code>scheduleId</code> when Channel Lineup is published. Radio clock publication returns the release ID; use a block ID from that immutable release snapshot, not an editable draft block ID. There is no source-list API, so this advanced editor never invents or substitutes IDs.</p>
      </div>
      {exceptions.length > 0 && <p className="meta">This draft also has {exceptions.length} saved occurrence exception{exceptions.length === 1 ? "" : "s"}. They are preserved; removing an event also removes its exceptions.</p>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {notice && <div className="notice notice-success" role="status">{notice}</div>}
    </section>

    <div className="editor-grid">
      <section className="card stack">
        <div className="card-header"><div><h2>Events</h2><p className="meta">Select an event to edit its complete definition.</p></div><div className="cluster"><button type="button" disabled={Boolean(busy)} onClick={addEvent}><Plus size={16} aria-hidden="true" /> Add event</button><button type="button" className="button-secondary" disabled={Boolean(busy) || !dirty} onClick={() => void saveDraft()}><Save size={16} aria-hidden="true" /> {busy === "save" ? "Saving..." : "Save draft"}</button></div></div>
        {events.length === 0 ? <div className="empty"><CalendarClock size={28} aria-hidden="true" /><h3>No calendar events</h3><p>Add an event. Offline events require no source; all other events need real published source IDs.</p></div> : <div className="stack">{events.map((event, index) => <article className={selectedEventId === event.id ? "notice" : "card"} key={event.id}>
          <div className="card-header"><div><strong>{event.title || "Untitled event"}</strong><p className="meta">{eventKindLabel(event.eventKind)} · {event.localStartDate} at {event.localStartTime} · {recurrenceLabel(event)}</p></div><span className="status">Priority {event.priority}</span></div>
          <div className="cluster">
            <button type="button" className="button-secondary" aria-pressed={selectedEventId === event.id} onClick={() => setSelectedEventId(event.id)}><Pencil size={15} aria-hidden="true" /> Edit</button>
            <button type="button" className="button-quiet" disabled={Boolean(busy) || index === 0} aria-label={`Move ${event.title || "untitled event"} up`} onClick={() => moveEvent(index, -1)}><ArrowUp size={15} aria-hidden="true" /> Move up</button>
            <button type="button" className="button-quiet" disabled={Boolean(busy) || index === events.length - 1} aria-label={`Move ${event.title || "untitled event"} down`} onClick={() => moveEvent(index, 1)}><ArrowDown size={15} aria-hidden="true" /> Move down</button>
            <button type="button" className="button-quiet" disabled={Boolean(busy)} aria-label={`Delete ${event.title || "untitled event"}`} onClick={() => removeEvent(event)}><Trash2 size={15} aria-hidden="true" /> Delete</button>
          </div>
        </article>)}</div>}
      </section>

      {selected ? <form className="card stack-lg" onSubmit={(formEvent: FormEvent<HTMLFormElement>) => { formEvent.preventDefault(); void saveDraft(); }}>
        <div className="card-header"><div><p className="eyebrow">Event definition</p><h2>{selected.title || "Untitled event"}</h2></div><code title="Stable event UUID">{selected.id}</code></div>
        <fieldset className="form-grid">
          <legend>Content and timing</legend>
          <label>Title<input value={selected.title} onChange={(event) => updateEvent(selected.id, { title: event.target.value })} required maxLength={200} /></label>
          <label>Event type<select value={selected.eventKind} onChange={(event) => changeEventKind(selected, event.target.value as EventKind)}><option value="PROGRAM">Program</option><option value="PREMIERE">Premiere</option><option value="OFFLINE">Offline</option></select></label>
          <label>Local start date<input type="date" value={selected.localStartDate} onChange={(event) => updateEvent(selected.id, { localStartDate: event.target.value })} required /></label>
          <label>Local start time<input type="time" step="1" value={selected.localStartTime} onChange={(event) => updateEvent(selected.id, { localStartTime: event.target.value })} required /></label>
          <label>Timezone<input value={selected.timeZone} list="calendar-time-zones" onChange={(event) => updateEvent(selected.id, { timeZone: event.target.value })} required maxLength={100} placeholder="Area/City" /></label>
          <label>Duration in seconds<input type="number" min="0.001" step="0.001" value={selected.durationMs / 1_000} onChange={(event) => updateEvent(selected.id, { durationMs: Math.round(Number(event.target.value) * 1_000) })} required /></label>
          <datalist id="calendar-time-zones">{timeZones.map((zone) => <option value={zone} key={zone} />)}</datalist>
        </fieldset>

        <SourceEditor legend="Primary source" source={selected.source} allowedKinds={[primarySourceKind(selected.eventKind, stationKind)]} onChange={(source) => updateEvent(selected.id, { source })} />
        {selected.eventKind === "OFFLINE" ? <div className="notice">Offline events always use source <code>NONE</code> and fallback <code>NONE</code>.</div> : <SourceEditor legend="Fallback source" source={selected.fallbackSource} allowedKinds={fallbackKinds} onChange={(fallbackSource) => updateEvent(selected.id, { fallbackSource })} />}

        <fieldset className="form-grid">
          <legend>Recurrence</legend>
          <label>Repeats<select value={selected.recurrenceKind} onChange={(event) => changeRecurrence(selected, event.target.value as RecurrenceKind)}><option value="NONE">One time</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
          {selected.recurrenceKind !== "NONE" && <>
            <label>Every <span className="sr-only">recurrence interval</span><input type="number" min="1" max="366" value={selected.recurrenceInterval} onChange={(event) => updateEvent(selected.id, { recurrenceInterval: Number(event.target.value) })} required /></label>
            <label>Occurrence count (optional)<input type="number" min="1" max="1000000" value={selected.recurrenceCount ?? ""} onChange={(event) => updateEvent(selected.id, { recurrenceCount: event.target.value ? Number(event.target.value) : null })} /></label>
            <label>Repeat through (optional)<input type="date" min={selected.localStartDate} value={selected.recurrenceUntilDate ?? ""} onChange={(event) => updateEvent(selected.id, { recurrenceUntilDate: event.target.value || null })} /></label>
          </>}
        </fieldset>
        {selected.recurrenceKind === "WEEKLY" && <fieldset className="stack"><legend>Weekdays</legend><div className="cluster">{weekdays.map((day, index) => { const value = index + 1; return <label className="cluster" key={day}><input type="checkbox" checked={selected.recurrenceWeekdays?.includes(value) ?? false} onChange={(event) => { const current = selected.recurrenceWeekdays ?? []; updateEvent(selected.id, { recurrenceWeekdays: event.target.checked ? [...current, value].sort((left, right) => left - right) : current.filter((candidate) => candidate !== value) }); }} /> {day}</label>; })}</div></fieldset>}
        {selected.recurrenceKind === "MONTHLY" && <fieldset className="stack"><legend>Month days</legend><p className="meta">Use comma-separated calendar days from 1 to 31. Months without a selected day skip that occurrence.</p><label>Days<input key={`${selected.id}-month-days`} defaultValue={selected.recurrenceMonthDays?.join(", ") ?? ""} placeholder="1, 15, 31" required onChange={(event) => { const tokens = event.target.value.split(",").map((value) => value.trim()).filter(Boolean); const days = tokens.map(Number); const valid = days.length > 0 && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 31) && new Set(days).size === days.length; event.currentTarget.setCustomValidity(valid ? "" : "Enter unique month days from 1 to 31."); updateEvent(selected.id, { recurrenceMonthDays: valid ? days : [] }); }} /></label></fieldset>}

        <fieldset className="form-grid">
          <legend>Playback policies</legend>
          <label>DST gap<select value={selected.dstGapPolicy} onChange={(event) => updateEvent(selected.id, { dstGapPolicy: event.target.value as CalendarEvent["dstGapPolicy"] })}><option value="SKIP">Skip missing local time</option><option value="SHIFT_FORWARD">Shift forward to valid time</option></select></label>
          <label>DST fold<select value={selected.dstFoldPolicy} onChange={(event) => updateEvent(selected.id, { dstFoldPolicy: event.target.value as CalendarEvent["dstFoldPolicy"] })}><option value="EARLIER">Use earlier instant</option><option value="LATER">Use later instant</option></select></label>
          <label>Priority<input type="number" min="-1000000" max="1000000" step="1" value={selected.priority} onChange={(event) => updateEvent(selected.id, { priority: Number(event.target.value) })} required /></label>
          <label>Late join<select value={selected.lateJoinPolicy} onChange={(event) => updateEvent(selected.id, { lateJoinPolicy: event.target.value as CalendarEvent["lateJoinPolicy"] })}><option value="JOIN_IN_PROGRESS">Join in progress</option><option value="SKIP">Skip occurrence</option></select></label>
        </fieldset>
        <div className="cluster"><button disabled={Boolean(busy)}><Save size={16} aria-hidden="true" /> {busy === "save" ? "Saving..." : "Save full draft"}</button><button type="button" className="button-quiet" disabled={Boolean(busy) || !dirty} onClick={() => void loadDraft()}><RefreshCw size={15} aria-hidden="true" /> Discard local changes</button></div>
      </form> : <section className="card empty"><h2>Select an event</h2><p>Choose an event from the list or add a new one.</p></section>}
    </div>

    <section className="card stack">
      <div className="card-header"><div><p className="eyebrow">Validation horizon</p><h2>Preview occurrences and overlaps</h2><p className="meta">Preview saves local changes first, then compiles the server draft. Leave both fields empty for the default 90-day horizon; previews are limited to 366 days.</p></div></div>
      <div className="form-grid"><label>Preview from (optional)<input type="datetime-local" value={previewFrom} onChange={(event) => setPreviewFrom(event.target.value)} /></label><label>Preview through (optional)<input type="datetime-local" value={previewTo} onChange={(event) => setPreviewTo(event.target.value)} /></label></div>
      <div className="cluster"><button type="button" disabled={Boolean(busy) || events.length === 0} onClick={() => void previewCalendar()}><CalendarClock size={16} aria-hidden="true" /> {busy === "preview" ? "Previewing..." : "Save and preview horizon"}</button></div>
      {preview && <div className="stack">
        <div className={`notice ${preview.valid ? "notice-success" : "notice-error"}`} role={preview.valid ? "status" : "alert"}><strong>{preview.valid ? "No blocking issues" : `${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? "" : "s"}`}</strong><p className="meta">{new Date(preview.horizon.from).toLocaleString()} through {new Date(preview.horizon.to).toLocaleString()} · {preview.occurrences.length} occurrence{preview.occurrences.length === 1 ? "" : "s"}</p></div>
        {blockingIssues.length > 0 && <div className="notice notice-error" role="alert"><strong>Blocking issues</strong><ul>{blockingIssues.map((issue, index) => <li key={`${issue.code}-${issue.recurrenceKey ?? issue.eventId ?? index}`}><code>{issue.code}</code> {issueText(issue)}</li>)}</ul></div>}
        {warningIssues.length > 0 && <div className="notice notice-warning" role="status"><strong>Warnings and resolved overlaps</strong><ul>{warningIssues.map((issue, index) => <li key={`${issue.code}-${issue.recurrenceKey ?? issue.eventId ?? index}`}><code>{issue.code}</code> {issueText(issue)}</li>)}</ul></div>}
        {preview.issues.length === 0 && <div className="notice notice-success" role="status"><Check size={16} aria-hidden="true" /> The selected horizon has no overlap, source, recurrence, or DST issues.</div>}
        <details><summary>Occurrence list ({preview.occurrences.length})</summary><ol>{preview.occurrences.slice(0, 100).map((occurrence) => <li key={occurrence.recurrenceKey}><strong>{occurrence.title}</strong> · {new Date(occurrence.startsAt).toLocaleString()} to {occurrence.endsAt ? new Date(occurrence.endsAt).toLocaleString() : "source end"}{occurrence.isMoved ? " · moved" : ""} · priority {occurrence.priority}</li>)}</ol>{preview.occurrences.length > 100 && <p className="meta">Showing the first 100 occurrences.</p>}</details>
      </div>}
    </section>

    <section className="card stack">
      <div className="card-header"><div><p className="eyebrow">Release control</p><h2>Publish and activate</h2><p className="meta">Publication snapshots the expected draft version with an automatically generated idempotency UUID. Activation is a separate, explicit immediate action.</p></div><span className={`status ${profile.lifecycle === "ACTIVE" ? "status-success" : "status-warning"}`}>{profile.lifecycle.toLowerCase()} profile</span></div>
      {previewBlocksPublish && <div className="notice notice-error" role="alert">Resolve the blocking preview issues before publishing this draft version.</div>}
      <div className="cluster"><button type="button" disabled={Boolean(busy) || events.length === 0 || previewBlocksPublish} onClick={() => void publishCalendar()}><Send size={16} aria-hidden="true" /> {busy === "publish" ? "Publishing..." : dirty ? "Save and publish release" : `Publish draft v${draftVersion}`}</button>{release && <button type="button" className="button-secondary" disabled={Boolean(busy)} onClick={() => void activateRelease()}><Zap size={16} aria-hidden="true" /> {busy === "activate" ? "Activating..." : "Activate release now"}</button>}</div>
      {release && <div className="notice notice-success" role="status"><strong>Release {release.releaseNumber} is ready</strong><p className="meta"><code>{release.releaseId}</code> · draft v{release.sourceDraftVersion} · {release.occurrenceCount} materialized occurrence{release.occurrenceCount === 1 ? "" : "s"}{release.idempotent ? " · idempotent replay" : ""}</p></div>}
    </section>
  </div>;
}
