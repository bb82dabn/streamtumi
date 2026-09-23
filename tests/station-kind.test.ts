import { describe, expect, it } from "vitest";
import { stationManagementPath, stationViewerPath, validTimeZone } from "@/lib/station-kind";
import { stationSchema } from "@/lib/validation";

describe("station kind", () => {
  it("keeps existing station creation TV-compatible", () => {
    const station = stationSchema.parse({ name: "Legacy channel" });
    expect(station).toMatchObject({ stationKind: "TV", timeZone: "UTC" });
    expect(stationManagementPath(station.stationKind, "station-1")).toBe("/stations/station-1");
    expect(stationViewerPath(station.stationKind, "token")).toBe("/watch/token");
  });

  it("uses shared management and kind-specific playback routes", () => {
    const station = stationSchema.parse({ name: "Night Radio", stationKind: "RADIO", timeZone: "America/New_York" });
    expect(stationManagementPath(station.stationKind, "station-2")).toBe("/stations/station-2");
    expect(stationViewerPath(station.stationKind, "token")).toBe("/listen/token");
  });

  it("rejects invalid time zones", () => {
    expect(validTimeZone("America/New_York")).toBe(true);
    expect(validTimeZone("not/a-time-zone")).toBe(false);
    expect(() => stationSchema.parse({ name: "Broken", timeZone: "not/a-time-zone" })).toThrow();
  });
});
