import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
import { serviceWeeksFrom } from "@/lib/clock-timeline";

describe("clock timeline rollover", () => {
  it("returns consecutive local service weeks across year boundaries", () => {
    expect(serviceWeeksFrom(new Date("2026-12-30T12:00:00Z"), "UTC", 3)).toEqual(["2026-12-28", "2027-01-04", "2027-01-11"]);
  });

  it("uses the station-local week rather than the UTC date", () => {
    expect(serviceWeeksFrom(new Date("2026-03-09T03:30:00Z"), "America/New_York", 2)).toEqual(["2026-03-02", "2026-03-09"]);
  });
});
