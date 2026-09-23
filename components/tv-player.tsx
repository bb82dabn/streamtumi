"use client";

import Hls from "hls.js";
import { Captions, Maximize, Pause, Play, RefreshCw, Volume1, Volume2, VolumeX } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { StationEngagement } from "@/components/station-engagement";
import { useTuneRecorder } from "@/components/tune-recorder";
import { createPlaybackClockAnchor, livePlaybackPosition, livePlaylistForCycle, phaseRemainingMs, type PlaybackClockAnchor } from "@/lib/live-playback";
import type { PlaybackOrder, PlaybackPosition } from "@/lib/schedule";

type Item = { id: string; title: string; durationMs: number; schedulePosition?: number; hlsUrl: string; thumbnailUrl: string | null; captionsUrl: string | null };
type TvDelivery =
  | { mode: "LEGACY_VOD" }
  | { mode: "CHANNEL_HLS"; status: "AVAILABLE" | "STARTING" | "FAILED" | "STOPPED"; version: string; hlsUrl?: string };
type TvProgram = { kind: "TV_AUTOMATION"; itemId: string; title: string };
type ViewerData = {
  station: { name: string; description: string; mode: "SYNCHRONIZED"; playbackKind?: "SCHEDULED_TV" | "PERSONALIZED_WEATHER"; hasLogo?: boolean; hasOfflineSlate?: boolean; transitionMs?: number; broadcastState?: "RUNNING" | "STOPPED"; explicit?: boolean };
  online: boolean;
  serverTime: string;
  scheduleId?: string;
  scheduleStartedAt?: string;
  playbackOrder?: PlaybackOrder;
  shuffleSeed?: string;
  delivery?: TvDelivery;
  program?: TvProgram;
  playlist: Item[];
  position?: PlaybackPosition;
};
type WeatherPlayback = { kind: "PERSONALIZED_HLS"; sessionId: string; hlsUrl: string; expiresAt: string };
const weatherMusic = ["catch-the-sun", "crisp-day", "rolling-clouds", "strong-breeze"];

export function TvPlayer({
  token,
  viewerCount,
  refreshVersion = 0,
  onProgramChange,
  onAccessReady,
  stateUrl,
  diagnostic = false,
}: {
  token?: string;
  viewerCount?: number;
  refreshVersion?: number;
  onProgramChange: (item: { id: string; title: string } | null) => void;
  onAccessReady: () => void;
  stateUrl?: string;
  diagnostic?: boolean;
}) {
  const [data, setData] = useState<ViewerData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [position, setPosition] = useState<PlaybackPosition | null>(null);
  const [volume, setVolume] = useState(1);
  const [weatherPlayback, setWeatherPlayback] = useState<WeatherPlayback | null>(null);
  const [weatherLocationRequired, setWeatherLocationRequired] = useState(false);
  const [weatherTrackIndex, setWeatherTrackIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const weatherAudioRef = useRef<HTMLAudioElement>(null);
  const weatherModeRef = useRef(false);
  const volumeRef = useRef(1);
  const attachTuneRecorder = useTuneRecorder<HTMLVideoElement>(token, !diagnostic);
  const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    attachTuneRecorder(video);
  }, [attachTuneRecorder]);
  const stageRef = useRef<HTMLDivElement>(null);
  const boundaryTimer = useRef<number | null>(null);
  const dataRef = useRef<ViewerData | null>(null);
  const clockAnchorRef = useRef<PlaybackClockAnchor | null>(null);
  const loadedItemIdRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const desiredPlayingRef = useRef(true);
  const weatherRequestRef = useRef<Promise<void> | null>(null);
  const weatherPlaybackRef = useRef<WeatherPlayback | null>(null);
  const linkAccessReadyRef = useRef(false);

  useEffect(() => { weatherPlaybackRef.current = weatherPlayback; }, [weatherPlayback]);

  const provisionWeather = useCallback(async (force = false) => {
    if (!token || diagnostic || (!force && weatherPlaybackRef.current) || weatherRequestRef.current) return weatherRequestRef.current;
    const request = (async () => {
      const response = await fetch("/api/client/v1/tunes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), stationToken: token }),
      });
      const result = await response.json();
      if (!response.ok) {
        setWeatherLocationRequired(result.code === "WEATHER_LOCATION_REQUIRED");
        throw new Error(result.error || "Your local weather feed could not be started.");
      }
      if (!result.playback?.hlsUrl) throw new Error("The weather service did not return a playback stream.");
      setWeatherLocationRequired(false);
      setWeatherPlayback(result.playback);
    })().finally(() => { weatherRequestRef.current = null; });
    weatherRequestRef.current = request;
    return request;
  }, [diagnostic, token]);

  useEffect(() => {
    if (!weatherPlayback?.expiresAt) return;
    const renewInMs = Math.max(1_000, new Date(weatherPlayback.expiresAt).getTime() - Date.now() - 5 * 60_000);
    const timer = window.setTimeout(() => void provisionWeather(true).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Your local weather feed could not be renewed.");
    }), renewInMs);
    return () => window.clearTimeout(timer);
  }, [provisionWeather, weatherPlayback?.expiresAt]);

  const attemptPlay = useCallback((video: HTMLVideoElement) => {
    const weatherAudio = weatherModeRef.current ? weatherAudioRef.current : null;
    video.volume = volumeRef.current;
    video.muted = weatherAudio ? true : volumeRef.current === 0;
    if (weatherAudio) {
      weatherAudio.volume = volumeRef.current;
      weatherAudio.muted = volumeRef.current === 0;
    }
    const promise = Promise.all([
      video.play(),
      weatherAudio && volumeRef.current > 0 ? weatherAudio.play() : Promise.resolve(),
    ]);
    void promise.then(() => {
      setPlaying(true);
      setNeedsInteraction(false);
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (caught instanceof DOMException && caught.name === "NotAllowedError" && volumeRef.current > 0) {
        video.muted = true;
        weatherAudio?.pause();
        void video.play().then(() => {
          setPlaying(true);
          setNeedsInteraction(true);
        }).catch(() => setNeedsInteraction(true));
        return;
      }
      setNeedsInteraction(true);
    });
  }, []);

  const resolveLivePosition = useCallback((source = dataRef.current): PlaybackPosition | null => {
    const anchor = clockAnchorRef.current;
    if (!source?.online || !source.scheduleStartedAt || source.station.transitionMs === undefined || !source.playlist.length || !anchor) return null;
    return livePlaybackPosition({
      scheduleStartedAt: source.scheduleStartedAt,
      transitionMs: source.station.transitionMs,
      playbackOrder: source.playbackOrder,
      shuffleSeed: source.shuffleSeed,
      playlist: source.playlist,
    }, anchor, performance.now());
  }, []);

  const applyPosition = useCallback((nextPosition: PlaybackPosition, shouldPlay: boolean, driftToleranceSeconds = 0.75) => {
    const source = dataRef.current;
    if (!source) return;
    setPosition(nextPosition);
    setCurrentIndex(nextPosition.index);
    setTransitioning(nextPosition.inTransition);
    if (source.delivery?.mode === "CHANNEL_HLS") return;
    if (nextPosition.inTransition) {
      videoRef.current?.pause();
      setNeedsInteraction(false);
      return;
    }
    const item = livePlaylistForCycle({
      scheduleStartedAt: source.scheduleStartedAt ?? "",
      transitionMs: source.station.transitionMs ?? 0,
      playbackOrder: source.playbackOrder,
      shuffleSeed: source.shuffleSeed,
      playlist: source.playlist,
    }, nextPosition.cycleNumber)[nextPosition.index];
    const video = videoRef.current;
    if (!item || !video || loadedItemIdRef.current !== item.id || video.readyState < HTMLMediaElement.HAVE_METADATA || !Number.isFinite(video.duration)) return;
    const target = Math.min(nextPosition.playbackOffsetMs / 1000, Math.max(0, video.duration - 0.2));
    if (Math.abs(video.currentTime - target) > driftToleranceSeconds) video.currentTime = target;
    if (shouldPlay && desiredPlayingRef.current) attemptPlay(video);
  }, [attemptPlay]);

  const synchronizeFromClock = useCallback((shouldPlay = desiredPlayingRef.current, driftToleranceSeconds = 0.75) => {
    const nextPosition = resolveLivePosition();
    if (nextPosition) applyPosition(nextPosition, shouldPlay, driftToleranceSeconds);
    return nextPosition;
  }, [applyPosition, resolveLivePosition]);

  const ensureLinkAccess = useCallback(async (force = false) => {
    if (!token || stateUrl || (linkAccessReadyRef.current && !force)) return;
    const response = await fetch(`/api/public/stations/${token}/link-access`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The station link could not be opened.");
    linkAccessReadyRef.current = true;
  }, [stateUrl, token]);

  const load = useCallback(async (quiet = false, shouldPlay = desiredPlayingRef.current) => {
    const sequence = ++requestSequenceRef.current;
    const requestStartedAt = performance.now();
    try {
      await ensureLinkAccess();
      let response = await fetch(stateUrl ?? `/api/public/stations/${token}`, { cache: "no-store" });
      let result = await response.json();
      if (response.status === 401 && result.code === "ACCESS_KEY_REQUIRED") {
        await ensureLinkAccess(true);
        response = await fetch(stateUrl ?? `/api/public/stations/${token}`, { cache: "no-store" });
        result = await response.json();
      }
      const receivedAt = performance.now();
      if (sequence !== requestSequenceRef.current) return;
      if (response.status === 401 && result.code === "PASSWORD_REQUIRED") {
        setPasswordRequired(true);
        return;
      }
      if (!response.ok) throw new Error(result.error || "The station could not be loaded.");
      setPasswordRequired(false);
      dataRef.current = result;
      setData(result);
      onAccessReady();
      if (result.station.playbackKind === "PERSONALIZED_WEATHER") await provisionWeather();
      if (result.online && result.position && result.scheduleStartedAt) {
        clockAnchorRef.current = createPlaybackClockAnchor(result.serverTime, requestStartedAt, receivedAt);
        const nextPosition = livePlaybackPosition({
          scheduleStartedAt: result.scheduleStartedAt,
          transitionMs: result.station.transitionMs ?? 0,
          playbackOrder: result.playbackOrder,
          shuffleSeed: result.shuffleSeed,
          playlist: result.playlist,
        }, clockAnchorRef.current, receivedAt);
        applyPosition(nextPosition, shouldPlay);
      } else {
        clockAnchorRef.current = null;
        setPosition(null);
        setCurrentIndex(0);
        setTransitioning(false);
        setNeedsInteraction(false);
      }
      if (!quiet) setError("");
    } catch (caught) {
      if (sequence !== requestSequenceRef.current) return;
      if (!quiet) setError(caught instanceof Error ? caught.message : "The station could not be loaded.");
    }
  }, [applyPosition, ensureLinkAccess, onAccessReady, provisionWeather, stateUrl, token]);

  useEffect(() => { void load(); return () => { if (boundaryTimer.current) window.clearTimeout(boundaryTimer.current); }; }, [load]);
  useEffect(() => { if (refreshVersion > 0) void load(true); }, [load, refreshVersion]);
  useEffect(() => {
    if (!data?.online || !position) return;
    if (boundaryTimer.current) window.clearTimeout(boundaryTimer.current);
    const remainingMs = phaseRemainingMs(position, livePlaylistForCycle({
      scheduleStartedAt: data.scheduleStartedAt ?? "",
      transitionMs: data.station.transitionMs ?? 0,
      playbackOrder: data.playbackOrder,
      shuffleSeed: data.shuffleSeed,
      playlist: data.playlist,
    }, position.cycleNumber));
    boundaryTimer.current = window.setTimeout(() => void load(true), remainingMs + 250);
    return () => { if (boundaryTimer.current) window.clearTimeout(boundaryTimer.current); };
  }, [data?.online, data?.playbackOrder, data?.playlist, data?.scheduleStartedAt, data?.shuffleSeed, data?.station.transitionMs, position, load]);
  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [data, load]);
  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load]);

  const cyclePlaylist = data && position ? livePlaylistForCycle({
    scheduleStartedAt: data.scheduleStartedAt ?? "",
    transitionMs: data.station.transitionMs ?? 0,
    playbackOrder: data.playbackOrder,
    shuffleSeed: data.shuffleSeed,
    playlist: data.playlist,
  }, position.cycleNumber) : data?.playlist ?? [];
  const current = cyclePlaylist[currentIndex];
  const currentId = current?.id;
  const currentUrl = current?.hlsUrl;
  const channelDelivery = data?.delivery?.mode === "CHANNEL_HLS" ? data.delivery : null;
  const weatherMode = data?.station.playbackKind === "PERSONALIZED_WEATHER";
  useEffect(() => { weatherModeRef.current = weatherMode; }, [weatherMode]);
  const channelUrl = channelDelivery?.status === "AVAILABLE" ? channelDelivery.hlsUrl : undefined;
  const channelMode = Boolean(channelDelivery) || weatherMode;
  const channelProgram = channelMode ? data?.program : undefined;
  const showingTransition = !channelMode && transitioning;
  const programTitle = channelProgram?.title ?? (showingTransition ? "Transition" : current?.title || data?.station.name);
  const playbackId = channelMode ? channelDelivery?.version : currentId;
  const resolvedPlaybackId = weatherMode ? weatherPlayback?.sessionId : playbackId;
  const playbackUrl = weatherMode ? weatherPlayback?.hlsUrl : channelMode ? channelUrl : currentUrl;
  const playbackBlocked = channelMode ? !data?.online || !playbackUrl : transitioning;
  const attributedItemId = channelProgram?.kind === "TV_AUTOMATION"
    ? channelProgram.itemId
    : !channelMode && current && !transitioning ? current.id : undefined;
  useEffect(() => {
    onProgramChange(attributedItemId && programTitle ? { id: attributedItemId, title: programTitle } : null);
  }, [attributedItemId, onProgramChange, programTitle]);
  useEffect(() => {
    const video = videoRef.current;
    const weatherAudio = weatherAudioRef.current;
    if (!video || !resolvedPlaybackId || !playbackUrl || playbackBlocked) return;
    let hls: Hls | undefined;
    loadedItemIdRef.current = channelMode ? null : resolvedPlaybackId;
    setNeedsInteraction(false);
    const initialPosition = channelMode ? null : resolveLivePosition();
    const startPosition = initialPosition?.itemId === resolvedPlaybackId && !initialPosition.inTransition
      ? initialPosition.playbackOffsetMs / 1000
      : channelMode ? -1 : 0;
    const seekAndPlay = () => {
      if (channelMode) {
        if (desiredPlayingRef.current) attemptPlay(video);
        return;
      }
      const nextPosition = resolveLivePosition();
      if (nextPosition) applyPosition(nextPosition, desiredPlayingRef.current, 0);
    };
    video.addEventListener("loadedmetadata", seekAndPlay);
    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        backBufferLength: weatherMode ? 10 : 30,
        startPosition,
        ...(weatherMode ? {
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5,
          maxLiveSyncPlaybackRate: 1.5,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          levelLoadingTimeOut: 70_000,
          levelLoadingMaxRetry: 10,
          levelLoadingRetryDelay: 1_000,
          levelLoadingMaxRetryTimeout: 5_000,
        } : {}),
      });
      hls.attachMedia(video);
      hls.loadSource(playbackUrl);
      hls.on(Hls.Events.ERROR, (_event, detail) => {
        if (!detail.fatal) return;
        if (detail.type === Hls.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
        else if (detail.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
        else { setError("Playback stopped because the stream could not be recovered."); hls?.destroy(); }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playbackUrl;
    } else setError("This browser cannot play HLS video.");
    return () => {
      if (loadedItemIdRef.current === resolvedPlaybackId) loadedItemIdRef.current = null;
      hls?.destroy();
      video.removeEventListener("loadedmetadata", seekAndPlay);
      video.pause();
      weatherAudio?.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [applyPosition, attemptPlay, channelMode, playbackBlocked, playbackUrl, resolveLivePosition, resolvedPlaybackId, weatherMode]);

  useEffect(() => {
    volumeRef.current = volume;
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = weatherModeRef.current || volume === 0;
    }
    if (weatherAudioRef.current) {
      weatherAudioRef.current.volume = volume;
      weatherAudioRef.current.muted = volume === 0;
    }
  }, [volume]);

  function resumeLive() {
    desiredPlayingRef.current = true;
    if (dataRef.current?.delivery?.mode === "CHANNEL_HLS" || dataRef.current?.station.playbackKind === "PERSONALIZED_WEATHER") {
      if (videoRef.current) attemptPlay(videoRef.current);
    } else synchronizeFromClock(true, 0);
    void load(true, true);
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (video && !video.paused) {
      desiredPlayingRef.current = false;
      setNeedsInteraction(false);
      video.pause();
      weatherAudioRef.current?.pause();
      return;
    }
    resumeLive();
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!token) { setError("This preview does not use viewer passwords."); return; }
    const credential = new FormData(event.currentTarget).get("credential");
    const response = await fetch(`/api/public/stations/${token}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: credential }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Password was not accepted."); return; }
    await load();
  }

  if (passwordRequired) return <section className="tv-page" style={{ display: "grid", placeItems: "center" }}><form className="password-panel stack-lg" onSubmit={submitPassword}><div><p className="eyebrow">Private station</p><h1>Password required</h1><p className="meta">Enter the password shared by the station owner.</p></div>{error && <div className="notice notice-error" role="alert">{error}</div>}<label>Station password<input name="credential" type="password" maxLength={128} required autoFocus /></label><button>Watch station</button></form></section>;
  if (!data) return <section className="tv-page" style={{ display: "grid", placeItems: "center" }}><div className="stack" style={{ textAlign: "center" }}><RefreshCw className="skeleton" size={32} /><p>{error || "Tuning station…"}</p>{error && <button onClick={() => void load()}>Try again</button>}</div></section>;
  const nextCyclePlaylist = position && currentIndex === cyclePlaylist.length - 1 ? livePlaylistForCycle({
    scheduleStartedAt: data.scheduleStartedAt ?? "",
    transitionMs: data.station.transitionMs ?? 0,
    playbackOrder: data.playbackOrder,
    shuffleSeed: data.shuffleSeed,
    playlist: data.playlist,
  }, position.cycleNumber + 1) : cyclePlaylist;
  const next = cyclePlaylist.length ? currentIndex === cyclePlaylist.length - 1 ? nextCyclePlaylist[0] : cyclePlaylist[currentIndex + 1] : null;
  const slateStyle = data.station.hasOfflineSlate && token ? { backgroundImage: `url(/api/public/stations/${token}/assets/slate)` } : undefined;
  const showVideo = channelMode ? Boolean(data.online && playbackUrl) : Boolean(data.online && current && !transitioning);
  const weatherSetup = weatherMode && !weatherPlayback;
  return <section className="tv-page"><div className="tv-shell">
    <header className="tv-header"><div className="cluster">{data.station.hasLogo && token && <img className="tv-logo" src={`/api/public/stations/${token}/assets/logo`} alt="" />}<div><div className="cluster">{data.station.explicit && <span className="status status-error">Explicit</span>}<h1>{data.station.name}</h1></div><p className="meta">{data.station.description}</p></div></div><div className="cluster tv-status">{viewerCount !== undefined && <span className="viewer-count">{viewerCount} {viewerCount === 1 ? "viewer" : "viewers"}</span>}<span className="mode-label">{diagnostic ? "Read-only diagnostic stream" : "Always running · viewers join whatever is on air"}</span></div></header>
    {!diagnostic && token && <StationEngagement token={token} returnTo={`/watch/${token}`} />}
    <div className="tv-stage" ref={stageRef}>
        {weatherMode && <audio ref={weatherAudioRef} src={`/api/public/weather/music/${weatherMusic[weatherTrackIndex]}`} preload="auto" onEnded={() => setWeatherTrackIndex((index) => (index + 1) % weatherMusic.length)} onCanPlay={() => { const video = videoRef.current; if (video && !video.paused && desiredPlayingRef.current && volumeRef.current > 0) void weatherAudioRef.current?.play().catch(() => setNeedsInteraction(true)); }} />}
        {showVideo ? <video ref={setVideoRef} className="tv-video" playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => void load(true)}>{!channelMode && current?.captionsUrl && <track kind="captions" src={current.captionsUrl} srcLang="en" label="Captions" default />}</video> : weatherSetup ? <div className="tv-slate"><div className="stack"><p className="eyebrow">{weatherLocationRequired ? "Location needed" : "Preparing local forecast"}</p><h1>{weatherLocationRequired ? "Set your ZIP code" : "Starting StreamTumi Weather"}</h1><p>{weatherLocationRequired ? "Your private account ZIP code selects the local WeatherStar forecast shown on this channel." : error || "Connecting to the 16:9 WeatherStar renderer..."}</p>{weatherLocationRequired && <a className="button" href="/account/settings">Set ZIP code</a>}</div></div> : <div className="tv-slate" style={slateStyle}><div><p className="eyebrow">{transitioning ? "Stand by" : "Off air"}</p><h1>{transitioning ? "Next program begins shortly" : data.station.name}</h1><p>{transitioning ? next?.title : data.station.broadcastState === "STOPPED" ? "The host has paused this station. Chat remains open." : "The owner has not published a playlist yet. Please check back soon."}</p></div></div>}
        {needsInteraction && showVideo && <div style={{ position: "absolute", inset: 0, zIndex: 4, display: "grid", placeItems: "center", background: "rgba(0,0,0,.2)" }}><button onClick={resumeLive}><Volume2 size={20} /> Enable sound</button></div>}
       {error && <div className="notice notice-error" role="alert" style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>{error}{weatherLocationRequired && <> <a href="/account/settings">Set ZIP code</a></>}</div>}
    </div>
    <footer className="tv-controls"><div className="now-playing"><span className="on-air">{data.online ? "ON AIR" : "OFF AIR"}</span><div style={{ minWidth: 0 }}><div className="now-title">{programTitle}</div><div className="meta">{next ? `Next: ${next.title}` : "No programs scheduled"}</div></div></div><div className="player-controls" aria-label="Playback controls"><button aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause /> : <Play />}</button><button aria-label={volume === 0 ? "Unmute" : "Mute"} onClick={() => setVolume((value) => value === 0 ? 1 : 0)}>{volume === 0 ? <VolumeX /> : volume < .5 ? <Volume1 /> : <Volume2 />}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />{!channelMode && current?.captionsUrl && <button aria-label="Captions available" title="Captions are available"><Captions /></button>}<button aria-label="Enter fullscreen" onClick={() => stageRef.current?.requestFullscreen()}><Maximize /></button></div></footer>
  </div></section>;
}
