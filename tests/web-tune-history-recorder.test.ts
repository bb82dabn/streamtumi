import { describe, expect, it, vi } from "vitest";
import { PlayedDurationTracker, WEB_TUNE_THRESHOLD_MS, type TuneRecorderClock } from "@/components/tune-recorder";

function controlledClock() {
  let now = 0;
  let callback: (() => void) | null = null;
  const clock: TuneRecorderClock = {
    now: () => now,
    setTimeout: (next) => { callback = next; return next; },
    clearTimeout: (handle) => { if (callback === handle) callback = null; },
  };
  return {
    clock,
    advance(ms: number) { now += ms; },
    fire() { const pending = callback; callback = null; pending?.(); },
  };
}

describe("web tune played-duration tracker", () => {
  it("records only after 30 seconds of reliable playback", () => {
    const controlled = controlledClock();
    const record = vi.fn();
    const tracker = new PlayedDurationTracker(record, WEB_TUNE_THRESHOLD_MS, controlled.clock);

    tracker.start();
    controlled.advance(WEB_TUNE_THRESHOLD_MS - 1);
    expect(record).not.toHaveBeenCalled();
    controlled.advance(1);
    controlled.fire();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("suspends while paused and completes the remaining played duration after resume", () => {
    const controlled = controlledClock();
    const record = vi.fn();
    const tracker = new PlayedDurationTracker(record, WEB_TUNE_THRESHOLD_MS, controlled.clock);

    tracker.start();
    controlled.advance(12_000);
    tracker.suspend();
    controlled.advance(60_000);
    expect(record).not.toHaveBeenCalled();

    tracker.start();
    controlled.advance(18_000);
    tracker.suspend();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a completed station session across later starts or source changes", () => {
    const controlled = controlledClock();
    const record = vi.fn();
    const tracker = new PlayedDurationTracker(record, WEB_TUNE_THRESHOLD_MS, controlled.clock);

    tracker.start();
    controlled.advance(WEB_TUNE_THRESHOLD_MS);
    tracker.suspend();
    tracker.start();
    controlled.advance(WEB_TUNE_THRESHOLD_MS);
    tracker.suspend();

    expect(record).toHaveBeenCalledTimes(1);
  });
});
