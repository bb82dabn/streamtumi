"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

export function MediaPreview({ source, captions, autoPlay = false }: { source: string; captions?: string | null; autoPlay?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: Hls | undefined;
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(source);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = source;
    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [source]);
  return <video ref={ref} className="preview-player" controls autoPlay={autoPlay} playsInline preload="metadata">
    {captions && <track kind="captions" src={captions} srcLang="en" label="Captions" default />}
  </video>;
}
