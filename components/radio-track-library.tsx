"use client";

import { Disc3, FileAudio, Image as ImageIcon, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { aggregateChunkProgress, createConcurrencyLimiter, retryChunkUpload } from "@/lib/chunk-upload-client";
import { chunkCountForSize, chunkSizeForIndex, UPLOAD_CHUNK_CONCURRENCY, UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload-chunks";

type TrackStatus = "UPLOADING" | "QUEUED" | "PROCESSING" | "READY" | "FAILED";
type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  status: TrackStatus;
  source_file_name: string;
  mime_type: string;
  size_bytes: string;
  duration_ms: string | null;
  source_codec: string | null;
  source_sample_rate: number | null;
  source_channels: number | null;
  integrated_lufs: number | null;
  true_peak_db: number | null;
  has_artwork: boolean;
  processing_progress: number;
  processing_attempts: number;
  processing_error: string | null;
};
type UploadingTrack = { id: string; name: string; progress: number; error?: string };

function bytes(value: string | number): string {
  const amount = Number(value);
  if (amount < 1024 ** 2) return `${(amount / 1024).toFixed(1)} KB`;
  if (amount < 1024 ** 3) return `${(amount / 1024 ** 2).toFixed(1)} MB`;
  return `${(amount / 1024 ** 3).toFixed(1)} GB`;
}

function duration(value: string | null): string {
  if (!value) return "Pending";
  const total = Math.round(Number(value) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function declaredMime(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "flac" ? "audio/flac" : extension === "wav" ? "audio/wav" : extension === "m4a" ? "audio/mp4" : extension === "aac" ? "audio/aac" : "audio/mpeg";
}

function putChunk(url: string, chunk: Blob, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    request.open("PUT", url);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onerror = () => reject(new Error("The chunk could not be uploaded."));
    request.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    request.onload = () => {
      signal.removeEventListener("abort", abort);
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        try { reject(new Error(JSON.parse(request.responseText).error || "The chunk could not be uploaded.")); }
        catch { reject(new Error("The chunk could not be uploaded.")); }
      }
    };
    request.send(chunk);
  });
}

export function RadioTrackLibrary({ stationId, maxUploadBytes, maxStorageBytes }: { stationId: string; maxUploadBytes: number; maxStorageBytes: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uploads, setUploads] = useState<UploadingTrack[]>([]);
  const [stationStorageBytes, setStationStorageBytes] = useState("0");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/radio/stations/${stationId}/tracks`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The track library could not be loaded.");
    setTracks(result.tracks);
    setStationStorageBytes(result.stationStorageBytes);
  }

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/radio/stations/${stationId}/tracks`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "The track library could not be loaded.");
        if (active) {
          setTracks(result.tracks);
          setStationStorageBytes(result.stationStorageBytes);
        }
      }
      catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "The track library could not be loaded."); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [stationId]);

  async function uploadFile(file: File) {
    const localId = crypto.randomUUID();
    setUploads((current) => [...current, { id: localId, name: file.name, progress: 0 }]);
    let trackId: string | undefined;
    try {
      const initiated = await fetch(`/api/radio/stations/${stationId}/tracks/uploads/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: declaredMime(file), size: file.size, uploadRequestId: crypto.randomUUID(), rightsConfirmed: true }),
      });
      const reservation = await initiated.json();
      if (!initiated.ok) throw new Error(reservation.error || "The track upload could not be started.");
      trackId = reservation.trackId;
      const count = chunkCountForSize(file.size);
      const sizes = Array.from({ length: count }, (_, index) => chunkSizeForIndex(file.size, index));
      const loaded = new Array(count).fill(0) as number[];
      const controller = new AbortController();
      const limit = createConcurrencyLimiter(UPLOAD_CHUNK_CONCURRENCY);
      try {
        await Promise.all(sizes.map((size, index) => limit(async () => {
          const start = index * UPLOAD_CHUNK_SIZE_BYTES;
          const blob = file.slice(start, start + size);
          await retryChunkUpload(async () => {
            loaded[index] = 0;
            await putChunk(`/api/radio/tracks/${trackId}/upload/${index}`, blob, controller.signal, (value) => {
              loaded[index] = value;
              const progress = aggregateChunkProgress(sizes, loaded);
              setUploads((current) => current.map((upload) => upload.id === localId ? { ...upload, progress } : upload));
            });
          });
        })));
      } catch (caught) {
        controller.abort();
        throw caught;
      }
      const completed = await fetch(`/api/radio/tracks/${trackId}/upload/complete`, { method: "POST" });
      const completion = await completed.json();
      if (!completed.ok) throw new Error(completion.error || "The track could not be queued for preparation.");
      setUploads((current) => current.filter((upload) => upload.id !== localId));
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The track upload failed.";
      if (trackId) await fetch(`/api/radio/tracks/${trackId}/upload/fail`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) }).catch(() => undefined);
      setUploads((current) => current.map((upload) => upload.id === localId ? { ...upload, error: message } : upload));
    }
  }

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!rightsConfirmed) { setError("Confirm your rights before uploading audio."); return; }
    setError("");
    for (const file of files) await uploadFile(file);
  }

  async function retry(trackId: string) {
    const response = await fetch(`/api/radio/tracks/${trackId}/retry`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "The track could not be retried."); return; }
    await load();
  }

  async function archive(trackId: string) {
    if (!window.confirm("Archive this track? It will leave the library but its retained source still counts toward storage until cleanup.")) return;
    const response = await fetch(`/api/radio/tracks/${trackId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "The track could not be archived."); return; }
    await load();
  }

  async function edit(track: Track) {
    const title = window.prompt("Track title", track.title);
    if (title === null) return;
    const artist = window.prompt("Artist", track.artist);
    if (artist === null) return;
    const album = window.prompt("Album", track.album);
    if (album === null) return;
    const response = await fetch(`/api/radio/tracks/${track.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, artist, album }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Track metadata could not be updated."); return; }
    await load();
  }

  const ready = tracks.filter((track) => track.status === "READY").length;
  const storagePercent = Math.min(100, Math.round(Number(stationStorageBytes) / maxStorageBytes * 100));
  return <section className="card radio-library stack-lg" id="production-library" aria-labelledby="radio-library-title">
    <div className="radio-library-header"><div><p className="eyebrow">Audio library</p><h2 id="radio-library-title">Tracks</h2><p className="meta">{ready} ready · {tracks.length} total · {bytes(stationStorageBytes)} of {bytes(maxStorageBytes)} station storage</p></div><button disabled={!rightsConfirmed} onClick={() => input.current?.click()}><Upload size={17} /> Upload audio</button></div>
    <div className="progress" aria-label={`${storagePercent}% of station storage used`}><span style={{ width: `${storagePercent}%` }} /></div>
    <label className="radio-rights"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /><span>I confirm I own or control the rights needed to upload and broadcast this audio.</span></label>
    <input ref={input} className="visually-hidden" type="file" multiple accept=".mp3,.m4a,.aac,.wav,.flac,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/flac" onChange={chooseFiles} />
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {uploads.map((upload) => <div className="radio-upload-row" key={upload.id}><FileAudio size={20} /><div><strong>{upload.name}</strong>{upload.error ? <p className="meta radio-error">{upload.error}</p> : <div className="progress"><span style={{ width: `${upload.progress}%` }} /></div>}</div><span>{upload.error ? "Failed" : `${upload.progress}%`}</span></div>)}
    {tracks.length ? <div className="radio-track-list">{tracks.map((track) => <article className="radio-track-row" key={track.id}>
      <div className="radio-track-art">{track.has_artwork ? <img src={`/api/radio/tracks/${track.id}/artwork`} alt="" /> : <ImageIcon size={24} aria-hidden="true" />}</div>
      <div className="radio-track-main"><div className="cluster"><span className={`status status-${track.status.toLowerCase()}`}>{track.status.toLowerCase()}</span><strong>{track.title}</strong></div><p className="meta">{track.artist || "Unknown artist"}{track.album ? ` · ${track.album}` : ""}</p><p className="meta">{duration(track.duration_ms)} · {track.source_codec ?? track.mime_type} {track.source_sample_rate ? `· ${(track.source_sample_rate / 1000).toFixed(1)} kHz · ${track.source_channels} ch` : ""} · {bytes(track.size_bytes)}{track.integrated_lufs !== null ? ` · ${track.integrated_lufs.toFixed(1)} LUFS` : ""}</p>{track.processing_error && <p className="radio-error">{track.processing_error}</p>}{(track.status === "QUEUED" || track.status === "PROCESSING") && <div className="progress"><span style={{ width: `${track.processing_progress}%` }} /></div>}</div>
      <div className="radio-track-actions">{track.status === "FAILED" && track.processing_attempts > 0 && <button className="button-secondary" onClick={() => void retry(track.id)} aria-label={`Retry ${track.title}`}><RefreshCw size={16} /></button>}<button className="button-quiet" onClick={() => void edit(track)} aria-label={`Edit ${track.title}`}><Pencil size={16} /></button><button className="button-quiet" disabled={track.status === "PROCESSING"} onClick={() => void archive(track.id)} aria-label={`Archive ${track.title}`}><Trash2 size={16} /></button></div>
    </article>)}</div> : !uploads.length && <div className="empty"><Disc3 size={30} aria-hidden="true" /><h3>No tracks yet</h3><p>Confirm your rights, then upload MP3, M4A/AAC, WAV, or FLAC audio up to {bytes(maxUploadBytes)} per file.</p></div>}
  </section>;
}
