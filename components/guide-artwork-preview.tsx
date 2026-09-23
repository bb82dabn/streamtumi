"use client";

import Hls from "hls.js";
import { Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stationResourceUrl } from "@/lib/guide-query";

type Connection = { saveData?: boolean };

export function GuideArtworkPreview({
  token,
  stationName,
  genreName,
  hasSlate,
  hasLogo,
  previewVideoId,
  previewThumbnailAvailable,
  previewOffsetMs,
  online,
  radioArtworkUrl,
  watchUrl,
  sourceUrl,
  thumbnailUrl,
  logoUrl,
  slateUrl,
  autoActive = false,
  muted = true,
  authorizationHeader,
  loopDurationSeconds = 8,
}: {
  token?: string;
  stationName: string;
  genreName: string;
  hasSlate: boolean;
  hasLogo: boolean;
  previewVideoId: string | null;
  previewThumbnailAvailable: boolean;
  previewOffsetMs: number;
  online: boolean;
  radioArtworkUrl?: string | null;
  watchUrl?: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  logoUrl?: string | null;
  slateUrl?: string | null;
  autoActive?: boolean;
  muted?: boolean;
  authorizationHeader?: string;
  loopDurationSeconds?: number | null;
}) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const previewEligible = online && Boolean(sourceUrl || previewVideoId);
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = Boolean((navigator as Navigator & { connection?: Connection }).connection?.saveData);
    if (!previewEligible || reducedMotion || saveData) { setActive(false); return; }
    if (autoActive) { setActive(true); return; }
    if (!hovered) { setActive(false); return; }
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!finePointer) return;
    const timer = window.setTimeout(() => setActive(true), 300);
    return () => window.clearTimeout(timer);
  }, [autoActive, hovered, previewEligible]);

  useEffect(() => {
    if (!active || (!sourceUrl && !previewVideoId)) return;
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    let loopStart = Math.max(0, previewOffsetMs / 1000);
    const source = sourceUrl ?? stationResourceUrl(watchUrl ?? "", `/api/public/stations/${token}/media/${previewVideoId}/360p/index.m3u8`);
    const play = () => {
      if (Number.isFinite(video.duration)) loopStart = Math.min(loopStart, Math.max(0, video.duration - 8));
      video.currentTime = loopStart;
      void video.play().catch(() => setActive(false));
    };
    const loop = () => {
      if (loopDurationSeconds !== null && (video.currentTime >= loopStart + loopDurationSeconds || video.ended)) video.currentTime = loopStart;
    };
    if (loopDurationSeconds !== null) video.addEventListener("timeupdate", loop);
    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        startLevel: 0,
        maxBufferLength: 12,
        backBufferLength: 0,
        ...(authorizationHeader ? {
          xhrSetup: (request) => request.setRequestHeader("Authorization", authorizationHeader),
        } : {}),
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_event, detail) => { if (detail.fatal) setActive(false); });
    } else if (!authorizationHeader && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
      video.addEventListener("loadedmetadata", play, { once: true });
    }
    return () => {
      if (loopDurationSeconds !== null) video.removeEventListener("timeupdate", loop);
      video.pause();
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [active, authorizationHeader, loopDurationSeconds, previewOffsetMs, previewVideoId, sourceUrl, token, watchUrl]);

  const thumbnail = thumbnailUrl ?? (online && previewVideoId && previewThumbnailAvailable
    ? stationResourceUrl(watchUrl ?? "", `/api/public/stations/${token}/media/${previewVideoId}/thumbnail.jpg`)
    : null);
  const radioArtwork = radioArtworkUrl && watchUrl ? stationResourceUrl(watchUrl, radioArtworkUrl) : radioArtworkUrl;
  const resolvedSlate = slateUrl ?? (hasSlate && token && watchUrl ? stationResourceUrl(watchUrl, `/api/public/stations/${token}/assets/slate`) : null);
  const resolvedLogo = logoUrl ?? (hasLogo && token && watchUrl ? stationResourceUrl(watchUrl, `/api/public/stations/${token}/assets/logo`) : null);
  return <div className="guide-preview" onPointerEnter={() => setHovered(true)} onPointerLeave={() => { setHovered(false); if (!autoActive) setActive(false); }}>
    {radioArtwork ? <img src={radioArtwork} alt={`Current track artwork on ${stationName}`} />
      : !online && resolvedSlate ? <img src={resolvedSlate} alt="" />
      : thumbnail ? <img src={thumbnail} alt={`Current program on ${stationName}`} />
        : resolvedLogo ? <img className="guide-logo-art" src={resolvedLogo} alt="" />
          : resolvedSlate ? <img src={resolvedSlate} alt="" />
          : <div className="guide-art-placeholder"><Radio size={34} aria-hidden="true" /><span>{genreName}</span></div>}
    {previewEligible && <video ref={videoRef} className={`guide-preview-video ${active ? "active" : ""}`} muted={muted} playsInline preload="none" aria-label={`Preview of ${stationName}`} />}
  </div>;
}
