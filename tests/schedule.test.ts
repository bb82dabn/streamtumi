import { describe, expect, it } from "vitest";
import { nextLoopAt, playbackAt, playlistForCycle, scheduleDuration } from "@/lib/schedule";

const items = [{ id: "intro", durationMs: 10_000 }, { id: "feature", durationMs: 20_000 }, { id: "outro", durationMs: 5_000 }];

describe("continuous synchronized schedules", () => {
  it("calculates duration including a transition after every item", () => {
    expect(scheduleDuration(items, 1_000)).toBe(38_000);
  });

  it("selects exact loop boundaries without stopping", () => {
    expect(playbackAt(items, 1_000, 1_000 + 35_000).itemId).toBe("intro");
    expect(playbackAt(items, 1_000, 1_000 + 70_001).playbackOffsetMs).toBe(1);
  });

  it("calculates synchronized offsets and transition windows", () => {
    expect(playbackAt(items, 0, 12_500, 1_000)).toMatchObject({ itemId: "feature", playbackOffsetMs: 1_500, index: 1 });
    expect(playbackAt(items, 0, 10_500, 1_000)).toMatchObject({ itemId: "intro", inTransition: true, transitionRemainingMs: 500 });
  });

  it("puts a late visitor in the correct item, offset, and loop", () => {
    expect(playbackAt(items, 1_000, 92_000, 1_000)).toMatchObject({
      index: 1,
      itemId: "feature",
      playbackOffsetMs: 4_000,
      cycleOffsetMs: 15_000,
      cycleNumber: 2,
    });
  });

  it("queues changed schedules at the next loop boundary", () => {
    expect(nextLoopAt(1_000, 80_000, 35_000)).toBe(106_000);
  });

  it("resumes from persisted schedule data after a process restart", () => {
    const persisted = JSON.parse(JSON.stringify({ startedAt: "2026-08-15T12:00:00.000Z", items }));
    const now = Date.parse("2026-08-15T12:02:03.456Z");
    const positionBefore = playbackAt(items, Date.parse(persisted.startedAt), now);
    const positionAfterRestart = playbackAt(persisted.items, Date.parse(persisted.startedAt), now);
    expect(positionAfterRestart).toEqual(positionBefore);
    expect(positionAfterRestart.itemId).toBe("feature");
    expect(positionAfterRestart.playbackOffsetMs).toBe(8_456);
  });

  it("derives the same shuffle on every replica and changes every multi-item loop", () => {
    const replicaA = Array.from({ length: 12 }, (_, cycle) => playlistForCycle(items, "SHUFFLE", "-721991234567890", cycle).map((item) => item.id));
    const replicaB = Array.from({ length: 12 }, (_, cycle) => playlistForCycle(items, "SHUFFLE", "-721991234567890", cycle).map((item) => item.id));
    expect(replicaB).toEqual(replicaA);
    for (let cycle = 1; cycle < replicaA.length; cycle += 1) expect(replicaA[cycle]).not.toEqual(replicaA[cycle - 1]);
  });

  it("uses shuffled item durations for exact media, transition, and loop boundaries", () => {
    const seed = "42";
    const firstCycle = playlistForCycle(items, "SHUFFLE", seed, 0);
    const secondCycle = playlistForCycle(items, "SHUFFLE", seed, 1);
    const firstDuration = firstCycle[0].durationMs;
    expect(playbackAt(items, 0, firstDuration, 1_000, "SHUFFLE", seed)).toMatchObject({
      index: 0,
      itemId: firstCycle[0].id,
      inTransition: true,
      transitionRemainingMs: 1_000,
    });
    expect(playbackAt(items, 0, firstDuration + 1_000, 1_000, "SHUFFLE", seed)).toMatchObject({ index: 1, itemId: firstCycle[1].id, playbackOffsetMs: 0 });
    expect(playbackAt(items, 0, 38_000, 1_000, "SHUFFLE", seed)).toMatchObject({ index: 0, itemId: secondCycle[0].id, cycleNumber: 1, cycleOffsetMs: 0 });
  });

  it("handles one item and large cycle numbers without local randomness", () => {
    const one = [{ id: "only", durationMs: 1 }];
    expect(playlistForCycle(one, "SHUFFLE", "99", 2 ** 45)).toEqual(one);
    const largeCycle = 2n ** 70n;
    const large = playlistForCycle(items, "SHUFFLE", "99", largeCycle).map((item) => item.id);
    expect(playlistForCycle(items, "SHUFFLE", "99", largeCycle).map((item) => item.id)).toEqual(large);
    expect(new Set(large)).toEqual(new Set(items.map((item) => item.id)));
  });
});
