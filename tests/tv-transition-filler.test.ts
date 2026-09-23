import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { end: vi.fn() } }));
vi.mock("@/lib/tv-transition-filler", () => ({ prepareStaticTvTransition: vi.fn() }));

import { parseTvTransitionArguments } from "@/scripts/prepare-tv-transition";

describe("TV static transition preparation command", () => {
  it("accepts exactly one station UUID", () => {
    const stationId = "11111111-2222-4333-8444-555555555555";
    expect(parseTvTransitionArguments([stationId])).toBe(stationId);
    expect(() => parseTvTransitionArguments([])).toThrow(/Usage/);
    expect(() => parseTvTransitionArguments([stationId, "extra"])).toThrow(/Usage/);
    expect(() => parseTvTransitionArguments(["not-a-uuid"])).toThrow(/Usage/);
  });
});
