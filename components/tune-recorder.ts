"use client";

import { type RefCallback, useCallback, useEffect, useRef, useState } from "react";

export const WEB_TUNE_THRESHOLD_MS = 30_000;

export type TuneRecorderClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const browserClock: TuneRecorderClock = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

export class PlayedDurationTracker {
  private activeSince: number | null = null;
  private elapsedMs = 0;
  private timeout: unknown = null;
  private complete = false;

  constructor(
    private onThreshold: () => void,
    private readonly thresholdMs = WEB_TUNE_THRESHOLD_MS,
    private readonly clock = browserClock,
  ) {}

  setOnThreshold(onThreshold: () => void) {
    this.onThreshold = onThreshold;
  }

  start() {
    if (this.complete || this.activeSince !== null) return;
    this.activeSince = this.clock.now();
    this.schedule();
  }

  suspend() {
    if (this.activeSince === null) return;
    this.elapsedMs += Math.max(0, this.clock.now() - this.activeSince);
    this.activeSince = null;
    this.clearTimer();
    if (this.elapsedMs >= this.thresholdMs) this.finish();
  }

  private schedule() {
    this.timeout = this.clock.setTimeout(() => {
      this.timeout = null;
      if (this.activeSince === null || this.complete) return;
      const now = this.clock.now();
      this.elapsedMs += Math.max(0, now - this.activeSince);
      this.activeSince = now;
      if (this.elapsedMs >= this.thresholdMs) this.finish();
      else this.schedule();
    }, Math.max(0, this.thresholdMs - this.elapsedMs));
  }

  private finish() {
    if (this.complete) return;
    this.complete = true;
    this.activeSince = null;
    this.clearTimer();
    this.onThreshold();
  }

  private clearTimer() {
    if (this.timeout === null) return;
    this.clock.clearTimeout(this.timeout);
    this.timeout = null;
  }
}

async function submitTune(id: string, stationToken: string) {
  try {
    await fetch("/api/client/v1/tunes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stationToken }),
    });
  } catch {
    // Tune history is best-effort and must never affect playback.
  }
}

export function useTuneRecorder<T extends HTMLMediaElement>(stationToken: string | undefined, enabled = true): RefCallback<T> {
  const tuneIdRef = useRef<string | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const [tracker] = useState(() => new PlayedDurationTracker(() => undefined));
  useEffect(() => {
    tracker.setOnThreshold(() => {
      if (!enabled || !stationToken) return;
      tuneIdRef.current ??= crypto.randomUUID();
      void submitTune(tuneIdRef.current, stationToken);
    });
  }, [enabled, stationToken, tracker]);

  return useCallback((media) => {
    detachRef.current?.();
    detachRef.current = null;
    tracker.suspend();
    if (!media || !enabled) return;

    tuneIdRef.current ??= crypto.randomUUID();
    const start = () => tracker.start();
    const suspend = () => tracker.suspend();
    const suspendEvents = ["pause", "waiting", "stalled", "ended", "emptied", "error", "abort"];
    media.addEventListener("playing", start);
    for (const event of suspendEvents) media.addEventListener(event, suspend);
    detachRef.current = () => {
      media.removeEventListener("playing", start);
      for (const event of suspendEvents) media.removeEventListener(event, suspend);
    };
    if (!media.paused && !media.ended && media.readyState >= 3) start();
  }, [enabled, tracker]);
}
