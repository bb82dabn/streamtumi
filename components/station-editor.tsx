"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  CircleStop,
  Clipboard,
  CopyPlus,
  Eye,
  ExternalLink,
  FileVideo,
  GripVertical,
  Image as ImageIcon,
  Layers3,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MediaPreview } from "@/components/media-preview";
import { StudioDashboardPanel } from "@/components/studio-dashboard-panel";
import { StationOperatingModel } from "@/components/station-operating-model";
import { StationRoomKeyControl } from "@/components/station-room-key-control";
import { StationSectionNav, type StationSection } from "@/components/station-section-nav";
import type { StationGenre } from "@/lib/genres";
import { aggregateChunkProgress, createConcurrencyLimiter, retryChunkUpload } from "@/lib/chunk-upload-client";
import {
  chunkCountForSize,
  chunkSizeForIndex,
  UPLOAD_CHUNK_CONCURRENCY,
  UPLOAD_CHUNK_RETRIES,
  UPLOAD_CHUNK_SIZE_BYTES,
} from "@/lib/upload-chunks";

type VideoStatus = "UPLOADING" | "QUEUED" | "PROCESSING" | "READY" | "FAILED";
type Video = {
  id: string;
  title: string;
  description: string;
  status: VideoStatus;
  source_file_name: string;
  mime_type: string;
  size_bytes: string;
  duration_ms: string | null;
  width: number | null;
  height: number | null;
  processing_progress: number;
  processing_attempts: number;
  processing_error: string | null;
  has_thumbnail: boolean;
  source_kind: "UPLOAD" | "YOUTUBE";
  normalized_source_url: string | null;
  ingestion_status: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED" | null;
  ingestion_error: string | null;
};
type PlaylistItem = {
  id: string;
  video_id: string;
  position: number;
  title: string;
  duration_ms: string;
  status: VideoStatus;
  has_thumbnail: boolean;
  page: number;
  story_slug: string;
  segment_type: "STORY" | "PACKAGE" | "VO" | "SOT" | "LIVE" | "BREAK" | "BUMP" | "GRAPHIC" | "AUDIO" | "COMMAND" | "NOTE";
  planned_duration_ms: string | null;
  timing_mode: "FOLLOW" | "FLOAT" | "HARD";
  hard_start_offset_ms: string | null;
  editorial_status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "KILLED";
  technical_status: "UNCHECKED" | "READY" | "WARNING" | "BLOCKED";
  talent: string;
  camera_source_note: string;
  script: string;
  notes: string;
};
type Station = {
  id: string;
  name: string;
  description: string;
  mode: "SYNCHRONIZED";
  transition_ms: number;
  playback_order: "SEQUENTIAL" | "SHUFFLE";
  auto_publish_next_loop: boolean;
  playlist_version: number;
  access_enabled: boolean;
  access_expires_at: string | null;
  hasPassword: boolean;
  viewerUrl: string;
  logo_key: string | null;
  offline_slate_key: string | null;
  active_schedule_id: string | null;
  pending_schedule_id: string | null;
  pending_activation_at: string | null;
  storage_bytes: string;
  broadcast_state: "RUNNING" | "STOPPED";
  paused_schedule_id: string | null;
  paused_cycle_offset_ms: string | null;
  paused_cycle_number: string | null;
  legal_hold_at: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  genre_id: string;
  owner_declared_explicit: boolean;
  explicit_enforced_at: string | null;
  explicit_enforcement_note: string | null;
  roomAccess: { enabled: boolean; rotatedAt: string | null };
};
type StationData = {
  station: Station;
  videos: Video[];
  playlist: PlaylistItem[];
  genres: StationGenre[];
  limits: { maxUploadBytes: number; maxStorageBytes: number; youtubeImportEnabled: boolean };
};
type UploadState = {
  id: string;
  file: File;
  replacementForId?: string;
  progress: number;
  phase: "uploading" | "queued" | "error";
  error?: string;
};
type InitiatedUpload = { videoId: string; chunkSize: number; chunkCount: number };

const limitChunkUpload = createConcurrencyLimiter(UPLOAD_CHUNK_CONCURRENCY);

function formatBytes(value: string | number): string {
  const bytes = Number(value);
  if (bytes < 1024 ** 2) return `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(value: string | number | null): string {
  if (!value) return "—";
  const totalSeconds = Math.round(Number(value) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Request failed."), { code: data.code, status: response.status });
  return data;
}

function uploadChunk(
  videoId: string,
  index: number,
  chunk: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    if (signal.aborted) {
      const error = new Error("Upload cancelled.");
      error.name = "AbortError";
      reject(error);
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", `/api/videos/${videoId}/upload/${index}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => onProgress(Math.min(event.loaded, chunk.size));
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(chunk.size);
        resolve();
        return;
      }
      let message = `Chunk ${index + 1} failed.`;
      try { message = JSON.parse(xhr.responseText).error || message; } catch { /* response was not JSON */ }
      reject(new Error(message));
    };
    xhr.onerror = () => fail(new Error(`Network error while uploading chunk ${index + 1}.`));
    xhr.onabort = () => {
      const error = new Error("Upload cancelled.");
      error.name = "AbortError";
      fail(error);
    };
    xhr.send(chunk);
  });
}

function formatHardStart(value: string | null): string {
  if (value === null) return "";
  const total = Math.floor(Number(value) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseHardStart(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parts = text.split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0) || parts[1] > 59 || parts[2] > 59) return Number.NaN;
  return ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000;
}

type RundownRowProps = {
  stationId: string;
  item: PlaylistItem;
  busy: boolean;
  onSave(item: PlaylistItem, form: FormData): void;
  onDuplicate(item: PlaylistItem): void;
  onRemove(item: PlaylistItem): void;
};

function SortablePlaylistItem({ stationId, item, busy, onSave, onDuplicate, onRemove }: RundownRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return <article ref={setNodeRef} className="station-rundown-row" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .55 : 1 }}>
    <div className="station-rundown-summary">
      <button className="drag-handle" aria-label={`Reorder ${item.story_slug}`} {...attributes} {...listeners}><GripVertical size={20} /></button>
      <strong className="station-rundown-page advanced-only">A{item.page}</strong>
      {item.has_thumbnail ? <img className="playlist-thumb" src={`/api/stations/${stationId}/media/${item.video_id}/thumbnail.jpg`} alt="" /> : <div className="playlist-thumb" />}
      <div className="station-rundown-story"><span className="advanced-only">{item.segment_type}</span><strong>{item.story_slug}</strong><small><span className="basic-only">{formatDuration(item.duration_ms)}</span><span className="advanced-only">{item.title} · source {formatDuration(item.duration_ms)}</span></small></div>
      <div className="station-rundown-timing advanced-only"><span>{item.timing_mode}</span><strong>{item.timing_mode === "HARD" ? formatHardStart(item.hard_start_offset_ms) : "Follows previous"}</strong><small>planned {formatDuration(item.planned_duration_ms ?? item.duration_ms)}</small></div>
      <div className="station-rundown-status advanced-only"><span className={`status ${item.editorial_status === "APPROVED" ? "status-success" : item.editorial_status === "KILLED" ? "status-error" : "status-warning"}`}>{item.editorial_status.replace("_", " ").toLowerCase()}</span><span className={`status ${item.technical_status === "READY" ? "status-success" : item.technical_status === "BLOCKED" ? "status-error" : ""}`}>{item.technical_status.toLowerCase()}</span></div>
      <details className="station-rundown-editor">
        <summary><span className="basic-only">Rename</span><span className="advanced-only">Edit row</span></summary>
        <form key={`${item.id}:${item.story_slug}:${item.editorial_status}:${item.technical_status}`} className="station-rundown-form" onSubmit={(event) => { event.preventDefault(); onSave(item, new FormData(event.currentTarget)); }}>
          <label className="advanced-only">Page<input name="page" type="number" min="1" max="9999" defaultValue={item.page} required /></label>
          <label className="station-rundown-form-wide"><span className="basic-only">Title</span><span className="advanced-only">Story slug</span><input name="storySlug" maxLength={160} defaultValue={item.story_slug} required /></label>
          <label className="advanced-only">Segment<select name="segmentType" defaultValue={item.segment_type}>{["STORY", "PACKAGE", "VO", "SOT", "LIVE", "BREAK", "BUMP", "GRAPHIC", "AUDIO", "COMMAND", "NOTE"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="advanced-only">Timing<select name="timingMode" defaultValue={item.timing_mode}><option value="FOLLOW">Follow</option><option value="FLOAT">Float</option><option value="HARD">Hard start</option></select></label>
          <label className="advanced-only">Hard start (HH:MM:SS)<input name="hardStart" defaultValue={formatHardStart(item.hard_start_offset_ms)} placeholder="00:00:00" /></label>
          <label className="advanced-only">Planned seconds<input name="plannedSeconds" type="number" min="0" max="86400" defaultValue={Math.round(Number(item.planned_duration_ms ?? item.duration_ms) / 1000)} /></label>
          <label className="advanced-only">Editorial<select name="editorialStatus" defaultValue={item.editorial_status}><option value="DRAFT">Draft</option><option value="IN_REVIEW">In review</option><option value="APPROVED">Approved</option><option value="KILLED">Killed</option></select></label>
          <label className="advanced-only">Technical<select name="technicalStatus" defaultValue={item.technical_status}><option value="UNCHECKED">Unchecked</option><option value="READY">Ready</option><option value="WARNING">Warning</option><option value="BLOCKED">Blocked</option></select></label>
          <label className="station-rundown-form-wide advanced-only">Talent<input name="talent" maxLength={500} defaultValue={item.talent} /></label>
          <label className="station-rundown-form-wide advanced-only">Camera / source note<textarea name="cameraSourceNote" maxLength={2000} defaultValue={item.camera_source_note} /></label>
          <label className="station-rundown-form-wide advanced-only">Script<textarea name="script" maxLength={50000} defaultValue={item.script} /></label>
          <label className="station-rundown-form-wide advanced-only">Producer notes<textarea name="notes" maxLength={50000} defaultValue={item.notes} /></label>
          <div className="station-rundown-actions"><button disabled={busy}><Save size={15} /> Save</button><button type="button" className="button-secondary advanced-only" disabled={busy} onClick={() => onDuplicate(item)}><CopyPlus size={15} /> Duplicate</button><button type="button" className="button-danger advanced-only" disabled={busy} onClick={() => onRemove(item)}><Trash2 size={15} /> Remove</button></div>
        </form>
      </details>
    </div>
  </article>;
}

export function StationEditor({ stationId, section = "overview" }: { stationId: string; section?: StationSection }) {
  const router = useRouter();
  const [data, setData] = useState<StationData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [password, setPassword] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeRightsConfirmed, setYoutubeRightsConfirmed] = useState(false);
  const [youtubeRequestId, setYoutubeRequestId] = useState("");
  const [showYoutubeImport, setShowYoutubeImport] = useState(false);
  const [dialog, setDialog] = useState<"start" | "delete" | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const uploadInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const load = useCallback(async (quiet = false) => {
    try {
      const result = await requestJson(`/api/stations/${stationId}`, { cache: "no-store" });
      setData(result);
      if (!quiet) setError("");
    } catch (caught) {
      if (!quiet) setError(caught instanceof Error ? caught.message : "Could not load the station.");
    }
  }, [stationId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!data?.videos.some((video) => ["UPLOADING", "QUEUED", "PROCESSING"].includes(video.status))) return;
    const timer = window.setInterval(() => void load(true), 2500);
    return () => window.clearInterval(timer);
  }, [data?.videos, load]);
  useEffect(() => {
    const loadCount = async () => {
      try {
        const response = await fetch("/api/stations/presence", { cache: "no-store" });
        if (response.ok) setViewerCount((await response.json()).counts[stationId] ?? 0);
      } catch { /* viewer counts are best effort */ }
    };
    void loadCount();
    const timer = window.setInterval(() => void loadCount(), 15_000);
    return () => window.clearInterval(timer);
  }, [stationId]);

  async function mutate(label: string, action: () => Promise<unknown>, success: string) {
    setBusy(label); setError(""); setNotice("");
    try { await action(); setNotice(success); await load(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Request failed."); }
    finally { setBusy(""); }
  }

  async function uploadFile(file: File, replacementForId?: string, existingUploadId?: string) {
    if (!data) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const types = new Set(["video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/x-msvideo", "video/mpeg"]);
    const extensions = new Set(["mp4", "mov", "mkv", "webm", "avi", "mpeg", "mpg", "m4v"]);
    const typeByExtension: Record<string, string> = {
      mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska",
      webm: "video/webm", avi: "video/x-msvideo", mpeg: "video/mpeg", mpg: "video/mpeg",
    };
    if (!extension || !extensions.has(extension)) { setError("Supported video types are MP4, MOV, MKV, WebM, AVI, and MPEG."); return; }
    const effectiveType = types.has(file.type) ? file.type : typeByExtension[extension];
    if (file.size <= 0) { setError("The video file is empty."); return; }
    if (file.size > data.limits.maxUploadBytes) { setError(`This file exceeds the ${formatBytes(data.limits.maxUploadBytes)} upload limit.`); return; }
    const uploadId = existingUploadId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextState: UploadState = { id: uploadId, file, replacementForId, progress: 0, phase: "uploading" };
    setUploads((current) => existingUploadId
      ? current.map((upload) => upload.id === uploadId ? nextState : upload)
      : [...current, nextState]);
    setError("");
    let videoId: string | undefined;
    try {
      const initiated = await requestJson(`/api/stations/${stationId}/uploads/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: effectiveType, size: file.size, replacementForId }),
      }) as InitiatedUpload;
      videoId = initiated.videoId;
      const expectedCount = chunkCountForSize(file.size);
      if (initiated.chunkSize !== UPLOAD_CHUNK_SIZE_BYTES || initiated.chunkCount !== expectedCount) {
        throw new Error("The server returned incompatible chunk upload settings.");
      }
      const chunkSizes = Array.from({ length: initiated.chunkCount }, (_, index) => chunkSizeForIndex(file.size, index));
      const loadedBytes = chunkSizes.map(() => 0);
      const updateProgress = () => {
        const progress = aggregateChunkProgress(chunkSizes, loadedBytes);
        setUploads((current) => current.map((upload) => upload.id === uploadId ? { ...upload, progress } : upload));
      };
      const controller = new AbortController();
      let nextIndex = 0;
      let primaryError: unknown;
      const worker = async () => {
        while (!controller.signal.aborted && nextIndex < initiated.chunkCount) {
          const index = nextIndex;
          nextIndex += 1;
          const start = index * initiated.chunkSize;
          const blob = file.slice(start, start + chunkSizes[index]);
          try {
            await retryChunkUpload(async () => {
              if (controller.signal.aborted) {
                const error = new Error("Upload cancelled.");
                error.name = "AbortError";
                throw error;
              }
              loadedBytes[index] = 0;
              updateProgress();
              await limitChunkUpload(() => uploadChunk(videoId as string, index, blob, controller.signal, (loaded) => {
                  loadedBytes[index] = loaded;
                  updateProgress();
                }));
            }, UPLOAD_CHUNK_RETRIES);
          } catch (caught) {
            if (!primaryError) {
              primaryError = caught;
              controller.abort();
            }
            return;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CHUNK_CONCURRENCY, initiated.chunkCount) }, worker));
      if (primaryError) throw primaryError;
      await requestJson(`/api/videos/${videoId}/upload/complete`, { method: "POST" });
      setUploads((current) => current.map((upload) => upload.id === uploadId ? { ...upload, progress: 100, phase: "queued" } : upload));
      setSelectedVideo(null);
      await load(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed.";
      if (videoId) {
        await requestJson(`/api/videos/${videoId}/upload/fail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: message }),
        }).catch(() => undefined);
        await load(true);
      }
      setUploads((current) => current.map((upload) => upload.id === uploadId ? { ...upload, phase: "error", error: message } : upload));
    }
  }

  async function reorder(event: DragEndEvent) {
    if (!data || event.active.id === event.over?.id || !event.over) return;
    const oldIndex = data.playlist.findIndex((item) => item.id === event.active.id);
    const newIndex = data.playlist.findIndex((item) => item.id === event.over?.id);
    const reordered = arrayMove(data.playlist, oldIndex, newIndex).map((item, position) => ({ ...item, position }));
    setData({ ...data, playlist: reordered });
    try {
      await requestJson(`/api/stations/${stationId}/playlist/reorder`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: reordered.map((item) => item.id) }) });
      setNotice(data.station.auto_publish_next_loop ? "Playlist order saved and queued for the next loop." : "Playlist order saved. Apply it when you are ready to update the channel.");
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the order."); await load(true); }
  }

  function saveRundownRow(item: PlaylistItem, form: FormData): void {
    if (!data) return;
    const timingMode = String(form.get("timingMode")) as PlaylistItem["timing_mode"];
    const parsedHardStart = parseHardStart(form.get("hardStart"));
    if (timingMode === "HARD" && (!Number.isFinite(parsedHardStart) || parsedHardStart === null)) {
      setError("Enter a hard start as HH:MM:SS.");
      return;
    }
    const plannedText = String(form.get("plannedSeconds") ?? "").trim();
    void mutate(`rundown-${item.id}`, () => requestJson(`/api/stations/${stationId}/playlist/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedPlaylistVersion: data.station.playlist_version,
        page: Number(form.get("page")),
        storySlug: form.get("storySlug"),
        segmentType: form.get("segmentType"),
        plannedDurationMs: plannedText ? Number(plannedText) * 1000 : null,
        timingMode,
        hardStartOffsetMs: timingMode === "HARD" ? parsedHardStart : null,
        editorialStatus: form.get("editorialStatus"),
        technicalStatus: form.get("technicalStatus"),
        talent: form.get("talent"),
        cameraSourceNote: form.get("cameraSourceNote"),
        script: form.get("script"),
        notes: form.get("notes"),
      }),
    }), "Rundown row saved.");
  }

  function duplicateRundownRow(item: PlaylistItem): void {
    if (!data) return;
    void mutate(`duplicate-${item.id}`, () => requestJson(`/api/stations/${stationId}/playlist/items/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedPlaylistVersion: data.station.playlist_version }),
    }), "Rundown row duplicated.");
  }

  function removeRundownRow(item: PlaylistItem): void {
    if (!data || !window.confirm(`Remove “${item.story_slug}” from the rundown? The media stays in your library.`)) return;
    void mutate(`remove-rundown-${item.id}`, () => requestJson(`/api/stations/${stationId}/playlist/items/${item.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedPlaylistVersion: data.station.playlist_version }),
    }), "Rundown row removed. The media remains in your library.");
  }

  async function importYouTube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!youtubeRightsConfirmed) return;
    const requestId = youtubeRequestId || crypto.randomUUID();
    setYoutubeRequestId(requestId);
    setBusy("youtube-import"); setError(""); setNotice("");
    try {
      await requestJson(`/api/stations/${stationId}/imports/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl, rightsConfirmed: true, requestId }),
      });
      setNotice("YouTube import queued. It will enter the playlist after download and processing.");
      setYoutubeUrl("");
      setYoutubeRightsConfirmed(false);
      setYoutubeRequestId("");
      setShowYoutubeImport(false);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The YouTube import could not be queued.");
    } finally {
      setBusy("");
    }
  }

  async function removeVideo(video: Video, force = false) {
    try {
      await requestJson(`/api/videos/${video.id}${force ? "?force=true" : ""}`, { method: "DELETE" });
      setSelectedVideo(null); setNotice("Video removed from the editable playlist and library."); await load(true);
    } catch (caught) {
      const typed = caught as Error & { code?: string };
      if (typed.code === "CURRENTLY_PLAYING" && window.confirm(`${typed.message}\n\nContinue? The current published schedule will keep playing the archived media until the next publication boundary.`)) return removeVideo(video, true);
      setError(typed.message);
    }
  }

  async function deleteStation() {
    if (!data || deleteName !== data.station.name) return;
    setBusy("delete-station"); setError("");
    try {
      await requestJson(`/api/stations/${stationId}`, { method: "DELETE" });
      router.replace("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The station could not be deleted.");
      setDialog(null);
      setBusy("");
    }
  }

  if (!data) return <main className="shell page stack"><div className="skeleton card" style={{ height: 110 }}>Loading</div><div className="editor-grid"><div className="skeleton card" style={{ height: 460 }}>Loading</div><div className="skeleton card" style={{ height: 330 }}>Loading</div></div>{error && <div className="notice notice-error">{error}</div>}</main>;
  const { station, videos, playlist, genres, limits } = data;
  const genreExplicit = genres.find((genre) => genre.id === station.genre_id)?.isExplicit ?? false;
  const effectiveExplicit = station.owner_declared_explicit || Boolean(station.explicit_enforced_at) || genreExplicit;
  const usagePercent = Math.min(100, Number(station.storage_bytes) / limits.maxStorageBytes * 100);
  const processing = videos.filter((video) => ["UPLOADING", "QUEUED", "PROCESSING"].includes(video.status));
  return <main className="shell page station-management" data-station-section={section}>
    <div className="page-header"><div><p className="eyebrow">Station control</p><h1>{station.name}</h1><div className="cluster station-live-summary"><span className={`status ${station.broadcast_state === "RUNNING" ? "status-success" : "status-warning"}`}>{station.broadcast_state === "RUNNING" ? "Running" : "Stopped"}</span><span className={`status ${station.visibility === "PUBLIC" ? "status-success" : ""}`}>{station.visibility.toLocaleLowerCase()}</span><span className="viewer-count"><Eye size={14} /> {viewerCount} tuned in</span><span className="meta">Continuous synchronized channel while running · viewers join the current position.</span></div></div><div className="cluster">{station.broadcast_state === "RUNNING" ? <button className="button-secondary" disabled={Boolean(busy)} onClick={() => void mutate("stop-station", () => requestJson(`/api/stations/${stationId}/broadcast/stop`, { method: "POST" }), "Station stopped. The viewer page and chat remain available.")}><CircleStop size={17} /> Stop</button> : <button disabled={Boolean(busy) || !station.active_schedule_id} title={station.active_schedule_id ? undefined : "Apply a playlist before starting"} onClick={() => setDialog("start")}><Play size={17} /> Start</button>}<a className="button" href={`/stations/${stationId}/production`}><Layers3 size={17} /> Production</a><a className="button button-secondary" href={station.viewerUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> View station</a><button className="button-quiet" onClick={() => navigator.clipboard.writeText(station.viewerUrl).then(() => setNotice("Viewer link copied."))}><Clipboard size={17} /> Copy link</button></div></div>
    <StationSectionNav stationId={stationId} active={section} />
    {error && <div className="notice notice-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
    {notice && <div className="notice notice-success" role="status" style={{ marginBottom: 16 }}><Check size={16} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />{notice}</div>}
    {(section === "overview" || section === "programming") && station.pending_schedule_id && <div className="notice notice-warning" style={{ marginBottom: 16 }}>A playlist update is queued for {station.pending_activation_at ? `the next loop at ${new Date(station.pending_activation_at).toLocaleString()}` : "the next loop after the station resumes"}.</div>}
    <div className="editor-grid">
      <div className="editor-main">
        <section className="station-section station-section-overview">
          <div className="station-overview-grid">
            <a className="card station-overview-card" href={`/stations/${stationId}/media`}><span className="station-task-number">1</span><span className="eyebrow">Add Media</span><h2>Build Your Library</h2><p>{videos.filter((video) => video.status === "READY").length} ready · {processing.length} processing</p><span className={`status ${videos.some((video) => video.status === "READY") ? "status-success" : "status-warning"}`}>{videos.some((video) => video.status === "READY") ? "Media ready" : "Upload media"}</span></a>
            <a className="card station-overview-card" href={`/stations/${stationId}/programming`}><span className="station-task-number">2</span><span className="eyebrow">Build Programming</span><h2>Channel Lineup</h2><p>{playlist.length} scheduled item{playlist.length === 1 ? "" : "s"}</p><span className={`status ${station.pending_schedule_id ? "status-warning" : station.active_schedule_id ? "status-success" : ""}`}>{station.pending_schedule_id ? "Update pending" : station.active_schedule_id ? "Published" : "Needs publishing"}</span></a>
            <a className="card station-overview-card" href={`/stations/${stationId}/production`}><span className="station-task-number">3</span><span className="eyebrow">Design programs</span><h2>Production Workspace</h2><p>Build reusable scenes, layouts, and published program versions.</p><span className="status">Continue setup</span></a>
            <a className="card station-overview-card" href={`/stations/${stationId}/production`}><span className="station-task-number">4</span><span className="eyebrow">Production</span><h2>Build Show Projects</h2><p>Prepare reusable scenes, media layouts, and rundowns.</p><span className="status">Open production</span></a>
          </div>
          <StationOperatingModel stationId={stationId} />
        </section>
        <section className="card station-section station-section-media" id="production-library">
          <div className="card-header"><div><h2>Media library</h2><p className="meta">Validated uploads and permitted YouTube imports are transcoded before they become schedulable.</p></div><div className="cluster"><button onClick={() => uploadInput.current?.click()}><Upload size={17} /> Upload videos</button>{limits.youtubeImportEnabled && <button className="button-secondary" onClick={() => { setShowYoutubeImport((current) => !current); if (!showYoutubeImport) setYoutubeRequestId(crypto.randomUUID()); }}><ExternalLink size={17} /> Import YouTube</button>}</div></div>
          <input ref={uploadInput} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo,video/mpeg,.m4v" multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; files.forEach((file) => void uploadFile(file)); }} />
          {showYoutubeImport && <form className="notice stack" onSubmit={(event) => void importYouTube(event)} style={{ marginBottom: 16 }}>
            <div><strong>Import one YouTube video</strong><p className="meta">Direct YouTube, Shorts, and youtu.be links are supported. Live streams, playlists, private content, cookies, and access-control bypasses are not.</p></div>
            <label>YouTube link<input type="url" value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); setYoutubeRequestId(crypto.randomUUID()); }} placeholder="https://www.youtube.com/watch?v=..." required maxLength={2048} /></label>
            <label className="guide-on-air"><input type="checkbox" checked={youtubeRightsConfirmed} onChange={(event) => setYoutubeRightsConfirmed(event.target.checked)} required /> I confirm that I own this video or have permission to download, import, and rebroadcast it.</label>
            <p className="meta">Your confirmation does not override copyright law or YouTube&apos;s Terms of Service. The source counts toward your storage allowance.</p>
            <div className="cluster"><button disabled={busy === "youtube-import" || !youtubeUrl.trim() || !youtubeRightsConfirmed}>{busy === "youtube-import" ? "Queueing…" : "Download and process"}</button><button type="button" className="button-quiet" disabled={busy === "youtube-import"} onClick={() => setShowYoutubeImport(false)}>Cancel</button></div>
          </form>}
          <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); Array.from(event.dataTransfer.files).forEach((file) => void uploadFile(file)); }}>
            <FileVideo size={30} aria-hidden="true" /><h3>Drop video files here</h3><p className="meta">MP4, MOV, MKV, WebM, AVI, or MPEG · up to {formatBytes(limits.maxUploadBytes)} each</p>
          </div>
          {uploads.length > 0 && <div className="stack" style={{ marginTop: 16 }}>{uploads.map((upload) => <div key={upload.id} className={`notice ${upload.phase === "error" ? "notice-error" : ""}`}><div className="storage-line"><strong>{upload.file.name}</strong><span className="meta">{upload.phase === "uploading" ? `${upload.progress}% uploaded` : upload.phase === "queued" ? "Queued for processing" : upload.error}</span></div><div className="progress" aria-label={`${upload.progress} percent uploaded`}><span style={{ width: `${upload.progress}%` }} /></div>{upload.phase === "error" && <button className="button-secondary" onClick={() => void uploadFile(upload.file, upload.replacementForId, upload.id)}><RotateCcw size={16} /> Retry upload</button>}</div>)}</div>}
          {processing.length > 0 && <div className="stack" style={{ marginTop: 16 }}>{processing.map((video) => <div key={video.id} className="notice"><div className="storage-line"><strong>{video.title}</strong><span className={`status status-${video.status.toLowerCase()}`}>{video.source_kind === "YOUTUBE" && video.ingestion_status !== "COMPLETE" ? "youtube import" : video.status.toLowerCase()}</span></div><div className="progress"><span style={{ width: `${video.processing_progress}%` }} /></div><span className="meta">{video.source_kind === "YOUTUBE" && video.ingestion_status !== "COMPLETE" ? "Downloading source" : "Processing"} · attempt {video.processing_attempts || 1}</span></div>)}</div>}
          <div style={{ marginTop: 18 }}>{videos.length ? <div className="library-grid">{videos.map((video) => <article className="video-card" key={video.id}>
            {video.has_thumbnail ? <img className="video-thumb" src={`/api/stations/${stationId}/media/${video.id}/thumbnail.jpg`} alt="" /> : <div className="video-thumb"><FileVideo size={28} /></div>}
            <div className="video-body"><div><div className="video-title" title={video.title}>{video.title}</div><span className="meta">{formatDuration(video.duration_ms)} · {formatBytes(video.size_bytes)}{video.source_kind === "YOUTUBE" ? " · YouTube import" : ""}</span></div><div className="cluster"><span className={`status status-${video.status.toLowerCase()}`}>{video.status.toLowerCase()}</span><button className="button-quiet" onClick={() => setSelectedVideo(video)}><Pencil size={16} /> Manage</button></div>{video.status === "FAILED" && <><p className="meta" title={video.ingestion_error ?? video.processing_error ?? ""}>{video.ingestion_error || video.processing_error || "Processing failed."}</p>{(video.processing_attempts > 0 || video.processing_progress > 0) && <button className="button-secondary" disabled={busy === `retry-${video.id}`} onClick={() => mutate(`retry-${video.id}`, () => requestJson(`/api/videos/${video.id}/retry`, { method: "POST" }), video.source_kind === "YOUTUBE" && video.ingestion_status === "FAILED" ? "YouTube import queued for another attempt." : "Video queued for another processing attempt.")}><RotateCcw size={16} /> {video.source_kind === "YOUTUBE" && video.ingestion_status === "FAILED" ? "Retry import" : "Retry processing"}</button>}</>}</div>
          </article>)}</div> : <div className="empty"><h2>Your media library is empty</h2><p>Upload a video to start building the channel rundown.</p></div>}</div>
        </section>
        <section className="card station-section station-section-programming" id="playlist-rundown">
          <div className="card-header"><div><p className="eyebrow">Station programming</p><h2><span className="basic-only">Channel Lineup</span><span className="advanced-only">ENPS Rundown</span></h2><p className="meta"><span className="basic-only">Drag videos into the order viewers should see them, then update the channel.</span><span className="advanced-only">The editable running order and source for immediate or next-loop publication. Open rows for timing, script, status, talent, and production notes.</span></p></div><span className="status">{playlist.length} items</span></div>
          {playlist.length ? <><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void reorder(event)}><SortableContext items={playlist.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="station-rundown">{playlist.map((item) => <SortablePlaylistItem key={item.id} stationId={stationId} item={item} busy={Boolean(busy)} onSave={saveRundownRow} onDuplicate={duplicateRundownRow} onRemove={removeRundownRow} />)}</div></SortableContext></DndContext>
           <div className="notice notice-warning advanced-only" style={{ marginTop: 16 }}>Immediate publication starts a new synchronized loop while running. Next-loop publication preserves the current loop until its boundary.</div>
           <label className="guide-on-air" style={{ marginTop: 16 }}><input type="checkbox" checked={station.auto_publish_next_loop} disabled={Boolean(busy)} onChange={(event) => void mutate("auto-publish", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoPublishNextLoop: event.target.checked }) }), event.target.checked ? "Automatic next-loop updates enabled." : "Automatic updates disabled.")} /> <span className="basic-only">Automatically update after the current loop</span><span className="advanced-only">Auto-publish playlist changes at the next loop</span></label>
           <p className="meta advanced-only">{station.auto_publish_next_loop ? "Uploads, replacements, order, removals, titles, transitions, and playback order replace the queued snapshot without moving its boundary." : "Edits stay private until you publish immediately or for the next loop."}</p>
           <div className="cluster station-publication-actions" style={{ marginTop: 16 }}><button disabled={Boolean(busy)} onClick={() => mutate("apply-now", () => requestJson(`/api/stations/${stationId}/playlist/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timing: "immediate" }) }), station.broadcast_state === "RUNNING" ? "Channel updated. A new loop begins now." : "Channel updated. It will begin when the station starts.")}><Play size={17} /> <span className="basic-only">Update Channel Now</span><span className="advanced-only">Publish Immediately</span></button>{!station.auto_publish_next_loop && <button className="button-secondary" disabled={Boolean(busy)} onClick={() => mutate("apply-next", () => requestJson(`/api/stations/${stationId}/playlist/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timing: "next-loop" }) }), "Update scheduled after the current loop.")}><RefreshCw size={17} /> <span className="basic-only">Update After Current Loop</span><span className="advanced-only">Publish Next Loop</span></button>}</div></> : <div className="empty"><h2>No ready videos</h2><p>Upload and process media before building the channel lineup.</p><a className="button" href={`/stations/${stationId}/media`}>Open Media</a></div>}
         </section>
         <div className="station-section station-section-production"><StudioDashboardPanel stationId={stationId} /></div>
      </div>
      <aside className="editor-side station-section station-section-settings">
         <section className="card"><div className="card-header"><div><h2>Station details</h2><p className="meta">Identity, genre, playback order, and transitions.</p></div></div><form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("settings", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), description: form.get("description"), genreId: form.get("genreId"), transitionMs: Number(form.get("transitionMs")), playbackOrder: form.get("playbackOrder") }) }), "Station details saved."); }}>
             <label>Name<input name="name" defaultValue={station.name} required maxLength={120} /></label><label>Description<textarea name="description" defaultValue={station.description} maxLength={2000} /></label><label>Genre<select name="genreId" defaultValue={station.genre_id}>{genres.map((genre) => <option key={genre.id} value={genre.id} disabled={!genre.active && genre.id !== station.genre_id}>{genre.name}{genre.active ? "" : " (archived)"}</option>)}</select></label><div className="notice">Always running · viewers join whatever is on air.</div><label>Playback order<select name="playbackOrder" defaultValue={station.playback_order}><option value="SEQUENTIAL">Sequential</option><option value="SHUFFLE">Shuffle every loop</option></select></label><p className="meta">Shuffle uses the published station clock, so every viewer sees the same deterministic order and a new order each loop.</p><label>Transition between videos<select name="transitionMs" defaultValue={station.transition_ms}><option value="0">None</option><option value="500">0.5 seconds</option><option value="1000">1 second</option><option value="2000">2 seconds</option><option value="3000">3 seconds</option></select></label><button disabled={busy === "settings"}>{busy === "settings" ? "Saving…" : "Save details"}</button>
         </form></section>
         <section className="card"><div className="card-header"><div><h2>Branding</h2><p className="meta">Logo and offline slate images.</p></div><ImageIcon size={19} color="#b8bcc4" /></div><div className="stack">{(["logo", "slate"] as const).map((kind) => <label key={kind}>{kind === "logo" ? "Station logo" : "Offline slate"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.set("file", file); await mutate(`asset-${kind}`, () => requestJson(`/api/stations/${stationId}/assets/${kind}`, { method: "POST", body: form }), `${kind === "logo" ? "Logo" : "Offline slate"} uploaded.`); }} />{(kind === "logo" ? station.logo_key : station.offline_slate_key) && <img src={`/api/stations/${stationId}/assets/${kind}?v=${Date.now()}`} alt={`${kind} preview`} style={{ width: "100%", maxHeight: 150, objectFit: "contain", background: "#08090a" }} />}</label>)}</div></section>
         <section className="card"><div className="card-header"><div><h2>Guide visibility</h2><p className="meta">Choose whether viewers can discover this station.</p></div><div className="cluster"><span className={`status ${effectiveExplicit ? "status-error" : ""}`}>{effectiveExplicit ? "Explicit" : "Standard"}</span><span className={`status ${station.visibility === "PUBLIC" ? "status-success" : ""}`}>{station.visibility.toLocaleLowerCase()}</span></div></div><div className="stack"><label>Visibility<select value={station.visibility} disabled={Boolean(busy)} onChange={(event) => void mutate("visibility", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility: event.target.value }) }), event.target.value === "PUBLIC" ? "Public visibility saved. Eligible stations appear in the Stream Guide." : "Station removed from the Stream Guide.")}><option value="PRIVATE">Private — unlisted viewer link</option><option value="PUBLIC" disabled={station.hasPassword}>Public — listed in Stream Guide</option></select></label><label className="guide-on-air"><input type="checkbox" checked={station.owner_declared_explicit} disabled={Boolean(busy)} onChange={(event) => void mutate("explicit", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerDeclaredExplicit: event.target.checked }) }), event.target.checked ? "Station marked explicit." : "Owner explicit label removed.")} /> Contains explicit content</label>{genreExplicit && <div className="notice notice-warning">The selected genre is classified as explicit by an administrator.</div>}{station.explicit_enforced_at && <div className="notice notice-warning">Moderation enforces the explicit label{station.explicit_enforcement_note ? `: ${station.explicit_enforcement_note}` : "."}</div>}{station.hasPassword && <div className="notice notice-warning">Remove the viewer password before making this station public.</div>}<p className="meta">Making a station private removes it from the Guide and fan lists. Existing viewer links continue to work until disabled or regenerated.</p></div></section>
         <section className="card"><div className="card-header"><div><h2>Viewer link access</h2><p className="meta">The dashboard is never exposed to viewers.</p></div><span className={`status ${station.access_enabled ? "status-success" : "status-warning"}`}>{station.access_enabled ? "Enabled" : "Disabled"}</span></div><div className="stack">
          <label className="cluster" style={{ display: "flex" }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={station.access_enabled} onChange={(event) => void mutate("access-enabled", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessEnabled: event.target.checked }) }), event.target.checked ? "Viewer access enabled." : "Viewer access disabled immediately.")} /> Allow viewer access</label>
           <label>Optional password<input type="password" value={password} disabled={station.visibility === "PUBLIC"} onChange={(event) => setPassword(event.target.value)} placeholder={station.visibility === "PUBLIC" ? "Make station private first" : station.hasPassword ? "Password is set" : "At least 6 characters"} minLength={6} maxLength={128} /></label><div className="cluster"><button className="button-secondary" disabled={station.visibility === "PUBLIC" || password.length < 6 || Boolean(busy)} onClick={() => void mutate("password", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessPassword: password }) }), "Viewer password updated.").then(() => setPassword(""))}>Set password</button>{station.hasPassword && <button className="button-quiet" disabled={Boolean(busy)} onClick={() => void mutate("password-remove", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessPassword: null }) }), "Viewer password removed.")}>Remove</button>}</div>
          <label>Expiration<input type="datetime-local" defaultValue={station.access_expires_at ? new Date(station.access_expires_at).toISOString().slice(0, 16) : ""} onChange={(event) => void mutate("expiration", () => requestJson(`/api/stations/${stationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessExpiresAt: event.target.value ? new Date(event.target.value).toISOString() : null }) }), event.target.value ? "Link expiration updated." : "Link expiration removed.")} /></label>
          <button className="button-secondary" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Regenerate the link? The current viewer link will stop working immediately.")) void mutate("regenerate", async () => { const result = await requestJson(`/api/stations/${stationId}/access/regenerate`, { method: "POST" }); await navigator.clipboard.writeText(result.viewerUrl); }, "New viewer link generated and copied. The old link is revoked."); }}><RefreshCw size={16} /> Regenerate and revoke old link</button>
         </div></section>
         <StationRoomKeyControl stationId={stationId} initialEnabled={station.roomAccess.enabled} initialRotatedAt={station.roomAccess.rotatedAt} hasLegacyPassword={station.hasPassword} />
         <section className="card stack"><div className="storage-line"><h2>Storage</h2><strong>{formatBytes(station.storage_bytes)} / {formatBytes(limits.maxStorageBytes)}</strong></div><div className="progress" aria-label={`${usagePercent.toFixed(1)} percent storage used`}><span style={{ width: `${usagePercent}%` }} /></div><p className="meta">Original uploads count toward storage. Processed renditions are managed by the service.</p></section>
        <details className="card station-danger-zone"><summary>Danger zone</summary><div className="stack"><h2>Delete station</h2><p className="meta">The station goes offline immediately and can be restored for seven days before its records and stored media are purged.</p>{station.legal_hold_at && <div className="notice notice-warning">Deletion is unavailable while a moderator legal hold is active.</div>}<button className="button-danger" disabled={Boolean(station.legal_hold_at)} onClick={() => { setDeleteName(""); setDialog("delete"); }}><Trash2 size={16} /> Delete station</button></div></details>
      </aside>
    </div>
    {dialog === "start" && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDialog(null)}><section className="dialog lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="start-dialog-title"><div className="card-header"><div><p className="eyebrow">Broadcast control</p><h2 id="start-dialog-title">Start {station.name}</h2></div><button className="button-quiet" aria-label="Close" onClick={() => setDialog(null)}><X size={20} /></button></div><div className="stack"><p>Restart begins the latest queued publication as a new loop. Resume restores the saved loop, order, and offset, then activates any queued update at the following boundary.</p><button onClick={() => { setDialog(null); void mutate("start-restart", () => requestJson(`/api/stations/${stationId}/broadcast/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: "restart" }) }), "Station restarted at the beginning of a new loop."); }}><Play size={17} /> Restart with latest publication</button>{station.paused_schedule_id === station.active_schedule_id && station.paused_cycle_offset_ms !== null && station.paused_cycle_number !== null && <button className="button-secondary" onClick={() => { setDialog(null); void mutate("start-resume", () => requestJson(`/api/stations/${stationId}/broadcast/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: "resume" }) }), "Station resumed from its saved loop and position."); }}><RefreshCw size={17} /> Resume paused position</button>}</div></section></div>}
    {dialog === "delete" && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDialog(null)}><section className="dialog lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title"><div className="card-header"><div><p className="eyebrow">Seven-day recovery window</p><h2 id="delete-dialog-title">Delete {station.name}</h2></div><button className="button-quiet" aria-label="Close" onClick={() => setDialog(null)}><X size={20} /></button></div><div className="stack"><div className="notice notice-warning">Viewer access stops now. Unless restored, all station media and records are purged after seven days.</div><label>Type <strong>{station.name}</strong> to confirm<input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} autoFocus /></label><button className="button-danger" disabled={deleteName !== station.name || busy === "delete-station"} onClick={() => void deleteStation()}><Trash2 size={16} /> {busy === "delete-station" ? "Deleting…" : "Delete station"}</button></div></section></div>}
    {selectedVideo && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedVideo(null)}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="video-dialog-title"><div className="card-header"><div><h2 id="video-dialog-title">Manage video</h2><p className="meta">{selectedVideo.source_file_name}</p></div><button className="button-quiet" aria-label="Close" onClick={() => setSelectedVideo(null)}><X size={20} /></button></div>{selectedVideo.status === "READY" && <MediaPreview source={`/api/stations/${stationId}/media/${selectedVideo.id}/master.m3u8`} captions={`/api/stations/${stationId}/media/${selectedVideo.id}/captions.vtt`} />}
      <form className="stack" style={{ marginTop: 18 }} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("video-edit", () => requestJson(`/api/videos/${selectedVideo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), description: form.get("description") }) }), "Video metadata saved.").then(() => setSelectedVideo(null)); }}><label>Title<input name="title" defaultValue={selectedVideo.title} required maxLength={120} /></label><label>Description<textarea name="description" defaultValue={selectedVideo.description} maxLength={2000} /></label><div className="cluster"><button disabled={Boolean(busy)}>Save metadata</button><button type="button" className="button-secondary" onClick={() => replacementInput.current?.click()}><RefreshCw size={16} /> Replace media</button><input ref={replacementInput} type="file" hidden accept="video/*,.mkv,.m4v" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadFile(file, selectedVideo.id); }} /><button type="button" className="button-danger" onClick={() => void removeVideo(selectedVideo)}><Trash2 size={16} /> Remove</button></div><p className="meta">Replacement preserves this item’s playlist position after processing. Published schedules stay immutable; with auto-publish on, the replacement queues for the next loop.</p></form></section></div>}
  </main>;
}
