import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  release: "00000000-0000-4000-8000-000000000029",
  timeline: "00000000-0000-4000-8000-000000000030",
};

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolvePublicStation: vi.fn(),
  rateLimit: vi.fn(),
  buildManifest: vi.fn(),
  objectResponse: vi.fn(),
  resolveCalendarRuntime: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/calendar-runtime", () => ({ resolveCalendarRuntime: mocks.resolveCalendarRuntime }));
vi.mock("@/lib/public-access", () => ({ resolvePublicStation: mocks.resolvePublicStation }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/radio-delivery", () => ({
  buildVirtualRadioManifest: mocks.buildManifest,
  radioSegmentKey: (key: string, segment: string) => `${key.slice(0, key.lastIndexOf("/") + 1)}${segment}`,
}));
vi.mock("@/lib/media", () => ({ rewriteHlsPlaylist: (playlist: string) => playlist, objectResponse: mocks.objectResponse }));

import { GET as master } from "@/app/api/public/stations/[token]/radio/[output]/master.m3u8/route";
import { GET as manifest } from "@/app/api/public/stations/[token]/radio/releases/[releaseId]/index.m3u8/route";
import { GET as segment } from "@/app/api/public/stations/[token]/radio/releases/[releaseId]/items/[timelineItemId]/[segment]/route";

describe("stateless Radio routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePublicStation.mockResolvedValue({
      id: "station-1",
      station_kind: "RADIO",
      broadcast_state: "RUNNING",
      radio_delivery_mode: "STATIC_HLS",
      active_clock_release_id: ids.release,
      access_password_hash: null,
    });
    mocks.resolveCalendarRuntime.mockResolvedValue(null);
  });

  it("points the stable audio master at the active immutable release", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    const response = await master(new Request("http://localhost/radio/audio/master.m3u8"), {
      params: Promise.resolve({ token: "token", output: "audio" }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`../releases/${ids.release}/index.m3u8`);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("radio_playout_state"))).toBe(false);
  });

  it("does not publish a stable Radio master during a Calendar offline occurrence", async () => {
    mocks.resolveCalendarRuntime.mockResolvedValueOnce({ plannedStatus: "OFFLINE" });
    const response = await master(new Request("http://localhost/radio/audio/master.m3u8"), {
      params: Promise.resolve({ token: "token", output: "audio" }),
    });
    expect(response.status).toBe(409);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.resolveCalendarRuntime).toHaveBeenCalledTimes(1);
  });

  it("builds a request-time delivery window without holding a database client", async () => {
    mocks.buildManifest.mockResolvedValue("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:10\n");
    const response = await manifest(new Request("http://localhost/radio/release/index.m3u8"), {
      params: Promise.resolve({ token: "token", releaseId: ids.release }),
    });
    expect(response.status).toBe(200);
    expect(mocks.buildManifest).toHaveBeenCalledWith(expect.objectContaining({ query: mocks.query }), ids.release, "token");
  });

  it("serves only segments inside the published timeline slice", async () => {
    mocks.query.mockResolvedValue({ rows: [{ audio_hls_key: "station/audio/index.m3u8", first_segment: 2, segment_count: 3 }] });
    mocks.objectResponse.mockResolvedValue(new Response("segment"));
    const response = await segment(new Request("http://localhost/radio/segment.ts"), {
      params: Promise.resolve({ token: "token", releaseId: ids.release, timelineItemId: ids.timeline, segment: "segment_0000000003.ts" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.objectResponse).toHaveBeenCalledWith(
      "station/audio/segment_0000000003.ts",
      expect.any(Request),
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );
    expect(String(mocks.query.mock.calls[0][0])).toContain("item.segment_duration_ms + 1000");
    expect(String(mocks.query.mock.calls[0][0])).toContain("clock_timestamp() - interval '2 minutes'");
  });
});
