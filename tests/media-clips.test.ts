import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ lockActiveUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ transaction: vi.fn() }));
vi.mock("@/lib/queue", () => ({ getMediaProcessingQueue: vi.fn() }));
vi.mock("@/lib/storage-quota", () => ({ assertStationStorageAvailable: vi.fn() }));
import { createMediaClipSchema } from "@/lib/media-clips";

describe("owner media clips", () => {
  it("accepts one-second through two-hour ranges", () => {
    const base = { stationId: "00000000-0000-4000-8000-000000000002", title: "Clip", startMs: 0, idempotencyKey: "00000000-0000-4000-8000-000000000001" };
    expect(createMediaClipSchema.safeParse({ ...base, endMs: 1000 }).success).toBe(true);
    expect(createMediaClipSchema.safeParse({ ...base, endMs: 7_200_000 }).success).toBe(true);
    expect(createMediaClipSchema.safeParse({ ...base, endMs: 999 }).success).toBe(false);
    expect(createMediaClipSchema.safeParse({ ...base, endMs: 7_200_001 }).success).toBe(false);
  });
});
