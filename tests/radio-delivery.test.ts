import { Readable } from "node:stream";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getObject: vi.fn() }));

vi.mock("@/lib/storage", () => ({ bucket: "test", storage: { getObject: mocks.getObject } }));

import { buildVirtualRadioManifest, radioSegmentKey } from "@/lib/radio-delivery";

describe("virtual Radio delivery", () => {
  it("publishes only the clock window that has reached air time", async () => {
    const source = "#EXTM3U\n#EXTINF:4,\nsegment_0000000000.ts\n#EXTINF:4,\nsegment_0000000001.ts\n#EXTINF:4,\nsegment_0000000002.ts\n#EXTINF:4,\nsegment_0000000003.ts\n#EXTINF:4,\nsegment_0000000004.ts\n#EXT-X-ENDLIST\n";
    mocks.getObject.mockResolvedValue(Readable.from([source]));
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: "timeline-1",
      starts_at: new Date(0),
      ends_at: new Date(20_000),
      source_offset_ms: "0",
      audio_hls_key: "station/release/audio/index.m3u8",
      segment_duration_ms: 4000,
      target_duration_seconds: 5,
      media_sequence_start: "100",
      discontinuity_sequence: "4",
      first_segment: 0,
      segment_count: 5,
    }] });
    const manifest = await buildVirtualRadioManifest({ query } as unknown as PoolClient, "release-1", "token", new Date(8_000));
    expect(manifest).toContain("#EXT-X-MEDIA-SEQUENCE:100");
    expect(manifest).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:3");
    expect(manifest).toContain("items/timeline-1/segment_0000000000.ts");
    expect(manifest).toContain("items/timeline-1/segment_0000000002.ts");
    expect(manifest).not.toContain("segment_0000000003.ts");
  });

  it("confines segment objects to the prepared artifact directory", () => {
    expect(radioSegmentKey("station/audio/index.m3u8", "segment_0000000012.ts")).toBe("station/audio/segment_0000000012.ts");
    expect(() => radioSegmentKey("station/audio/index.m3u8", "../secret.ts")).toThrow(/Invalid/);
  });
});
