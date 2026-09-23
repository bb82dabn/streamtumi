import { describe, expect, it } from "vitest";
import { playbackAt, resumedScheduleStart } from "@/lib/schedule";

describe("station resume epoch", () => {
  it("backdates the epoch by the saved cycle offset", () => {
    expect(resumedScheduleStart(50_000, 12_500).getTime()).toBe(37_500);
  });

  it("does not move the epoch into the future for an invalid negative offset", () => {
    expect(resumedScheduleStart(50_000, -10).getTime()).toBe(50_000);
  });

  it("preserves the saved shuffled cycle number and offset", () => {
    const items = [{ id: "a", durationMs: 10_000 }, { id: "b", durationMs: 20_000 }, { id: "c", durationMs: 5_000 }];
    const resumedAt = 500_000;
    const start = resumedScheduleStart(resumedAt, 12_500, 7, 35_000);
    expect(playbackAt(items, start.getTime(), resumedAt, 0, "SHUFFLE", "1234")).toMatchObject({
      ...playbackAt(items, 0, 7 * 35_000 + 12_500, 0, "SHUFFLE", "1234"),
      cycleNumber: 7,
      cycleOffsetMs: 12_500,
    });
  });
});
