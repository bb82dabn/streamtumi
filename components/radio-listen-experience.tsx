"use client";

import Hls from "hls.js";
import { Headphones, Pause, Play, Radio } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { RadioBrand } from "@/components/brand";
import { StationChat } from "@/components/station-chat";
import { useTuneRecorder } from "@/components/tune-recorder";

type RadioState = {
  station: {
    name: string;
    description: string;
    stationKind: "RADIO";
    timeZone: string;
  };
  online: boolean;
  playback: {
    kind: "RADIO_CLOCK";
    status: "SETUP" | "STOPPED" | "UNAVAILABLE" | "ON_AIR";
    title?: string;
    artist?: string;
    album?: string;
    startsAt?: string;
    endsAt?: string;
    artworkUrl?: string;
    blockName?: string;
    playlistName?: string;
    artistPageUrl?: string;
    spotifyUrl?: string;
    youtubeUrl?: string;
  };
  next?: { title: string; artist: string; startsAt: string } | null;
  visual?: { mode: "COVER" | "VISUALIZER"; visualizerId: string };
  stream?: { status: "AVAILABLE" | "STARTING" | "FAILED"; sessionId?: string; audioHlsUrl?: string; waveformHlsUrl?: string; visualHlsUrl?: string };
};

export function RadioListenExperience({ token }: { token: string }) {
  const [state, setState] = useState<RadioState | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const attachTuneRecorder = useTuneRecorder<HTMLAudioElement>(token);
  const setAudioRef = useCallback((audio: HTMLAudioElement | null) => {
    audioRef.current = audio;
    attachTuneRecorder(audio);
  }, [attachTuneRecorder]);
  const visualRef = useRef<HTMLVideoElement>(null);
  const visualizerRef = useRef<HTMLCanvasElement>(null);
  const audioGraphRef = useRef<{ context: AudioContext; analyser: AnalyserNode; frame: number } | null>(null);
  const linkAccessReadyRef = useRef(false);
  const updateViewerCount = useCallback((count: number) => setViewerCount(count), []);
  const stationUpdated = useCallback(() => undefined, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setError("");
        if (!linkAccessReadyRef.current) {
          const accessResponse = await fetch(`/api/public/stations/${token}/link-access`, { method: "POST" });
          const accessResult = await accessResponse.json();
          if (!accessResponse.ok) throw new Error(accessResult.error || "The station link could not be opened.");
          linkAccessReadyRef.current = true;
        }
        let response = await fetch(`/api/public/stations/${token}`, { cache: "no-store" });
        let result = await response.json();
        if (response.status === 401 && result.code === "ACCESS_KEY_REQUIRED") {
          linkAccessReadyRef.current = false;
          const accessResponse = await fetch(`/api/public/stations/${token}/link-access`, { method: "POST" });
          const accessResult = await accessResponse.json();
          if (!accessResponse.ok) throw new Error(accessResult.error || "The station link could not be opened.");
          linkAccessReadyRef.current = true;
          response = await fetch(`/api/public/stations/${token}`, { cache: "no-store" });
          result = await response.json();
        }
        if (!active) return;
        if (response.status === 401 && result.code === "PASSWORD_REQUIRED") {
          setPasswordRequired(true);
          return;
        }
        if (!response.ok || result.station?.stationKind !== "RADIO") {
          setError(result.error || "This Radio station is unavailable.");
          return;
        }
        setPasswordRequired(false);
        setState(result);
      } catch {
        if (active) setError("The Radio station could not be reached.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token]);

  const sessionId = state?.stream?.sessionId;
  const audioHlsUrl = state?.stream?.audioHlsUrl;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !sessionId || !audioHlsUrl) return;
    let hls: Hls | undefined;
    setPlaybackError("");
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, backBufferLength: 20, liveSyncDurationCount: 3 });
      hls.attachMedia(audio);
      hls.loadSource(audioHlsUrl);
      hls.on(Hls.Events.ERROR, (_event, detail) => {
        if (!detail.fatal) return;
        if (detail.type === Hls.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
        else if (detail.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
        else { setPlaybackError("The live Radio stream could not be recovered."); hls?.destroy(); }
      });
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) audio.src = audioHlsUrl;
    else setPlaybackError("This browser cannot play HLS audio.");
    return () => { hls?.destroy(); audio.pause(); audio.removeAttribute("src"); audio.load(); };
  }, [audioHlsUrl, sessionId]);

  const visualHlsUrl = state?.stream?.visualHlsUrl ?? state?.stream?.waveformHlsUrl;
  useEffect(() => {
    const video = visualRef.current;
    if (!video || !sessionId || !visualHlsUrl) return;
    let hls: Hls | undefined;
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, backBufferLength: 8, liveSyncDurationCount: 3 });
      hls.attachMedia(video);
      hls.loadSource(visualHlsUrl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined));
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = visualHlsUrl;
      void video.play().catch(() => undefined);
    }
    return () => { hls?.destroy(); video.pause(); video.removeAttribute("src"); video.load(); };
  }, [sessionId, visualHlsUrl]);

  useEffect(() => () => {
    const graph = audioGraphRef.current;
    if (!graph) return;
    window.cancelAnimationFrame(graph.frame);
    void graph.context.close();
    audioGraphRef.current = null;
  }, []);

  function startLocalVisualizer(audio: HTMLAudioElement) {
    const canvas = visualizerRef.current;
    if (!canvas || audioGraphRef.current) return;
    const context = new AudioContext();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    analyser.connect(context.destination);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      const rendering = canvas.getContext("2d");
      if (!rendering) return;
      const width = canvas.width;
      const height = canvas.height;
      analyser.getByteFrequencyData(samples);
      const gradient = rendering.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#281b17");
      gradient.addColorStop(1, "#090b0e");
      rendering.fillStyle = gradient;
      rendering.fillRect(0, 0, width, height);
      const bars = 48;
      const gap = 4;
      const barWidth = (width - gap * (bars - 1)) / bars;
      for (let index = 0; index < bars; index += 1) {
        const level = samples[Math.floor(index * samples.length / bars)] / 255;
        const barHeight = Math.max(3, level * height * 0.72);
        rendering.fillStyle = index % 3 === 0 ? "#e66a5f" : "#e7b16f";
        rendering.fillRect(index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
      }
      const graph = audioGraphRef.current;
      if (graph) graph.frame = window.requestAnimationFrame(draw);
    };
    audioGraphRef.current = { context, analyser, frame: window.requestAnimationFrame(draw) };
  }

  async function toggleListening() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    try {
      if (!visualHlsUrl && state?.visual?.mode === "VISUALIZER") startLocalVisualizer(audio);
      await audioGraphRef.current?.context.resume();
      await audio.play();
      setPlaybackError("");
    }
    catch { setPlaybackError("Select Start listening again after the stream finishes loading."); }
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/public/stations/${token}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("credential") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "The station could not be unlocked.");
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("The station could not be unlocked.");
      setBusy(false);
    }
  }

  return <main className="radio-listen-page">
    <header className="radio-listen-header"><RadioBrand /><div className="cluster">{state && <span className="viewer-count">{viewerCount} {viewerCount === 1 ? "listener" : "listeners"}</span>}<Link className="button button-quiet" href="/guide">Radio Guide</Link></div></header>
    <div className="radio-listen-layout"><div className="radio-listen-content">{passwordRequired ? <section className="radio-access-card">
      <p className="eyebrow">Private Radio</p>
      <h1>Password required</h1>
      <p className="meta">Enter the station password to open its listening room.</p>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <form className="stack" onSubmit={unlock}><label>Station password<input name="credential" type="password" maxLength={128} required autoFocus /></label><button disabled={busy}>{busy ? "Opening..." : "Open station"}</button></form>
    </section> : error ? <section className="radio-access-card"><p className="eyebrow">StreamTumi Radio</p><h1>Station unavailable</h1><div className="notice notice-error" role="alert">{error}</div></section> : state ? <section className={`radio-listen-stage${visualHlsUrl || state.visual?.mode === "VISUALIZER" ? " radio-listen-stage-visual" : ""}`}>
      <div className={`radio-listen-art${visualHlsUrl || state.visual?.mode === "VISUALIZER" ? " radio-listen-art-video" : ""}`}>{visualHlsUrl ? <video ref={visualRef} muted playsInline aria-label={state.visual?.mode === "VISUALIZER" ? `${state.visual.visualizerId} audio visualizer` : `${state.station.name} live visual`} /> : state.visual?.mode === "VISUALIZER" ? <canvas ref={visualizerRef} width={1280} height={720} aria-label={`${state.visual.visualizerId} local audio visualizer`} /> : state.playback.artworkUrl ? <img src={state.playback.artworkUrl} alt={state.playback.title ? `Cover art for ${state.playback.title}` : "Current track cover art"} /> : <><Radio size={72} aria-hidden="true" /><div className="radio-listen-rings" aria-hidden="true"><span /><span /><span /></div></>}</div>
      <div className="radio-listen-copy">
        <p className="eyebrow">StreamTumi Radio</p>
        <h1>{state.station.name}</h1>
        <p>{state.station.description || "An independent Radio station on StreamTumi."}</p>
         <div className="radio-listen-status"><span className={`status ${state.playback.status === "ON_AIR" ? "status-success" : "status-warning"}`}>{state.playback.status === "ON_AIR" ? "Clock on air" : state.playback.status === "STOPPED" ? "Off air" : "Coming online"}</span><span>{state.station.timeZone}</span></div>
        {state.playback.status === "ON_AIR" && <div className="radio-now-playing"><span className="meta">Now programmed</span><strong>{state.playback.title}</strong><span>{state.playback.artist || "Unknown artist"}{state.playback.album ? ` · ${state.playback.album}` : ""}</span>{state.playback.blockName && <small>{state.playback.blockName}{state.playback.playlistName && state.playback.playlistName !== state.playback.blockName ? ` · ${state.playback.playlistName}` : ""}</small>}{state.next && <small>Next: {state.next.artist ? `${state.next.artist} — ` : ""}{state.next.title}</small>}<div className="cluster">{state.playback.artistPageUrl && <a href={state.playback.artistPageUrl} target="_blank" rel="noreferrer">Artist page</a>}{state.playback.spotifyUrl && <a href={state.playback.spotifyUrl} target="_blank" rel="noreferrer">Spotify</a>}{state.playback.youtubeUrl && <a href={state.playback.youtubeUrl} target="_blank" rel="noreferrer">YouTube</a>}</div></div>}
        <audio ref={setAudioRef} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        <button disabled={state.stream?.status !== "AVAILABLE"} onClick={() => void toggleListening()}>{state.stream?.status === "AVAILABLE" ? playing ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Start listening</> : <><Headphones size={18} /> {state.stream?.status === "FAILED" ? "Stream unavailable" : "Stream starting"}</>}</button>
        {playbackError && <div className="notice notice-error" role="alert">{playbackError}</div>}
        <p className="meta">Listening uses clock-derived audio prepared once at upload. Visuals are rendered on this device.</p>
      </div>
    </section> : <section className="radio-access-card"><p className="eyebrow">StreamTumi Radio</p><h1>Opening station</h1><p className="meta">Confirming access...</p></section>}</div>
    {state && !passwordRequired && !error ? <StationChat token={token} currentVideo={null} onViewerCount={updateViewerCount} onStationUpdated={stationUpdated} /> : <aside className="chat-panel chat-locked"><div className="empty"><h2>Radio chat</h2><p>Chat becomes available after station access is confirmed.</p></div></aside>}
    </div>
  </main>;
}
