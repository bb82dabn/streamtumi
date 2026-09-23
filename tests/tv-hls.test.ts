import { describe, expect, it } from "vitest";
import { buildTvHlsMasterManifest, buildTvHlsMediaManifests } from "@/lib/tv-hls";
import type { TvJournalWindowSegment } from "@/lib/tv-segment-journal";

function windowSegments(): TvJournalWindowSegment[] {
  return [
    {
      mediaSequence: 42,
      discontinuitySequence: 7,
      discontinuity: false,
      startsAt: new Date("2026-08-19T12:00:00.000Z"),
      endsAt: new Date("2026-08-19T12:00:02.000Z"),
      durationMs: 2000,
      uris: { "720p": "asset-a/720p/segment_0000000000.ts", "360p": "asset-a/360p/segment_0000000000.ts" },
    },
    {
      mediaSequence: 43,
      discontinuitySequence: 7,
      discontinuity: true,
      startsAt: new Date("2026-08-19T12:00:02.000Z"),
      endsAt: new Date("2026-08-19T12:00:04.000Z"),
      durationMs: 2000,
      uris: { "720p": "asset-b/720p/segment_0000000000.ts", "360p": "asset-b/360p/segment_0000000000.ts" },
    },
    {
      mediaSequence: 44,
      discontinuitySequence: 8,
      discontinuity: false,
      startsAt: new Date("2026-08-19T12:00:04.000Z"),
      endsAt: new Date("2026-08-19T12:00:05.500Z"),
      durationMs: 1500,
      uris: { "720p": "asset-b/720p/segment_0000000001.ts", "360p": "asset-b/360p/segment_0000000001.ts" },
    },
  ];
}

describe("TV HLS manifests", () => {
  it("builds the fixed aligned 720p and 360p master", () => {
    const master = buildTvHlsMasterManifest();
    expect(master).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
    expect(master).toContain('CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=30.000');
    expect(master).toContain('CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=640x360,FRAME-RATE=30.000');
    expect(master).toContain("720p/index.m3u8");
    expect(master).toContain("360p/index.m3u8");
  });

  it("advertises only 720p for an HD-only window", () => {
    const master = buildTvHlsMasterManifest({ "720p": "720p/index.m3u8" }, "HD_ONLY");
    expect(master.match(/#EXT-X-STREAM-INF:/g)).toHaveLength(1);
    expect(master).toContain("720p/index.m3u8");
    expect(master).not.toContain("360p");
    expect(master).not.toContain("640x360");
  });

  it("builds aligned rolling media windows with PDT and no ENDLIST", () => {
    const manifests = buildTvHlsMediaManifests(windowSegments(), (key, rendition) => `/tv/${rendition}/${key}`);
    for (const manifest of Object.values(manifests)) {
      expect(manifest).toContain("#EXT-X-TARGETDURATION:2");
      expect(manifest).toContain("#EXT-X-MEDIA-SEQUENCE:42");
      expect(manifest).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:7");
      expect(manifest.match(/#EXT-X-PROGRAM-DATE-TIME:/g)).toHaveLength(3);
      expect(manifest.match(/#EXT-X-DISCONTINUITY\n/g)).toHaveLength(1);
      expect(manifest).toContain("#EXTINF:1.500,");
      expect(manifest).not.toContain("#EXT-X-ENDLIST");
    }
    const highTimeline = manifests["720p"].split("\n").filter((line) => line.startsWith("#"));
    const lowTimeline = manifests["360p"].split("\n").filter((line) => line.startsWith("#"));
    expect(highTimeline).toEqual(lowTimeline);
    expect(manifests["720p"]).toContain("/tv/720p/asset-a/720p/");
    expect(manifests["360p"]).toContain("/tv/360p/asset-a/360p/");
  });

  it("rejects sequence and timestamp misalignment", () => {
    const sequenceGap = windowSegments();
    sequenceGap[1] = { ...sequenceGap[1], mediaSequence: 45 };
    expect(() => buildTvHlsMediaManifests(sequenceGap)).toThrow(/media sequences must be contiguous/);

    const timestampDrift = windowSegments();
    timestampDrift[2] = { ...timestampDrift[2], endsAt: new Date("2026-08-19T12:00:05.501Z") };
    expect(() => buildTvHlsMediaManifests(timestampDrift)).toThrow(/exact half-open interval/);
  });
});
