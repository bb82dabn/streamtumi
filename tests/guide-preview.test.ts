import { describe, expect, it } from "vitest";
import { resolveGuidePreview } from "@/lib/guide-preview";

const items = [
  { video_id: "first", duration_ms: "10000", thumbnail_key: "first.jpg" },
  { video_id: "second", duration_ms: "20000", thumbnail_key: "second.jpg" },
];

describe("Guide current-program preview", () => {
  it("selects the station-clock current item and offset", () => {
    expect(resolveGuidePreview(true, new Date(0), 0, items, 15_000)).toEqual({ item: items[1], offsetMs: 5_000 });
  });

  it("selects the upcoming item while in a transition", () => {
    expect(resolveGuidePreview(true, new Date(0), 2_000, items, 11_000)).toEqual({ item: items[1], offsetMs: 0 });
  });

  it("returns no preview for an empty schedule", () => {
    expect(resolveGuidePreview(true, new Date(0), 0, [], 1_000)).toEqual({ item: null, offsetMs: 0 });
  });

  it("uses the next shuffled cycle during the final transition", () => {
    const seed = "77";
    const cycleDuration = 34_000;
    const atFinalTransition = cycleDuration - 1_000;
    const preview = resolveGuidePreview(true, new Date(0), 2_000, items, atFinalTransition, "SHUFFLE", seed);
    const nextCycle = resolveGuidePreview(true, new Date(0), 2_000, items, cycleDuration, "SHUFFLE", seed);
    expect(preview).toEqual({ item: nextCycle.item, offsetMs: 0 });
  });
});
