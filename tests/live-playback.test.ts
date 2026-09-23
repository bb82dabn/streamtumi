import { describe, expect, it } from "vitest";
import { createPlaybackClockAnchor, livePlaybackPosition, phaseRemainingMs } from "@/lib/live-playback";

describe("browser station clock", () => {
  const schedule = {
    scheduleStartedAt: "1970-01-01T00:00:00.000Z",
    transitionMs: 0,
    playlist: [
      { id: "first", durationMs: 10_000 },
      { id: "second", durationMs: 20_000 },
    ],
  };

  it("compensates for API transit and player startup time", () => {
    const anchor = createPlaybackClockAnchor("1970-01-01T00:00:10.000Z", 0, 2_000);
    const position = livePlaybackPosition(schedule, anchor, 5_000);
    expect(position).toMatchObject({ itemId: "second", playbackOffsetMs: 4_000 });
    expect(phaseRemainingMs(position, schedule.playlist)).toBe(16_000);
  });

  it("uses transition remaining time as the next server boundary", () => {
    const withTransition = { ...schedule, transitionMs: 1_000 };
    const anchor = createPlaybackClockAnchor("1970-01-01T00:00:10.500Z", 0, 0);
    const position = livePlaybackPosition(withTransition, anchor, 0);
    expect(position).toMatchObject({ inTransition: true, transitionRemainingMs: 500 });
    expect(phaseRemainingMs(position, withTransition.playlist)).toBe(500);
  });

  it("reconstructs canonical positions from a current-cycle shuffled API playlist", () => {
    const shuffled = {
      ...schedule,
      playbackOrder: "SHUFFLE" as const,
      shuffleSeed: "88172645463325252",
      playlist: [
        { id: "second", durationMs: 20_000, schedulePosition: 1 },
        { id: "first", durationMs: 10_000, schedulePosition: 0 },
      ],
    };
    const anchor = createPlaybackClockAnchor("1970-01-01T00:01:00.000Z", 0, 0);
    expect(livePlaybackPosition(shuffled, anchor, 0)).toEqual(livePlaybackPosition({ ...shuffled, playlist: [...shuffled.playlist].reverse() }, anchor, 0));
  });
});
