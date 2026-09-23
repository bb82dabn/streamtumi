import { describe, expect, it } from "vitest";
import { displayDimensions, parseFrameRate, renditionsForSource } from "@/lib/transcode";

describe("adaptive transcode ladder", () => {
  it("never creates larger optional renditions for low-resolution sources", () => {
    expect(renditionsForSource(426, 240).map((item) => item.name)).toEqual(["360p"]);
    expect(renditionsForSource(640, 360).map((item) => item.name)).toEqual(["360p"]);
  });

  it("adds only renditions supported by source dimensions", () => {
    expect(renditionsForSource(1280, 720).map((item) => item.name)).toEqual(["360p", "720p"]);
    expect(renditionsForSource(1920, 1080).map((item) => item.name)).toEqual(["360p", "720p", "1080p"]);
  });

  it("accounts for portrait rotation metadata", () => {
    expect(displayDimensions(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(renditionsForSource(1920, 1080, 90).map((item) => item.name)).toEqual(["360p", "720p", "1080p"]);
  });

  it("preserves source frame rates without exceeding 30 fps", () => {
    expect(parseFrameRate("24000/1001")).toBeCloseTo(23.976, 3);
    expect(parseFrameRate("25/1")).toBe(25);
    expect(parseFrameRate("60/1")).toBe(30);
    expect(parseFrameRate("invalid")).toBe(30);
  });
});
