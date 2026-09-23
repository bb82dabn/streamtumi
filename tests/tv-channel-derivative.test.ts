import { describe, expect, it } from "vitest";
import {
  parseTvChannelPlaylist,
  normalizeTvChannelPlaylistTargetDuration,
  stationStaticTransitionFillerArgs,
  stationTransitionFillerArgs,
  tvChannelV1Args,
  validateTvChannelMasterPlaylist,
  validateTvChannelSegmentInventories,
} from "@/lib/tv-channel-derivative";

function playlist(finalDuration = "1.500000", finalName = "segment_0000000002.ts"): string {
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:2",
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    "#EXTINF:2.000000,",
    "segment_0000000000.ts",
    "#EXTINF:2.000000,",
    "segment_0000000001.ts",
    `#EXTINF:${finalDuration},`,
    finalName,
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");
}

describe("TV channel derivative contract", () => {
  it("builds both fixed TV renditions in one shared HLS invocation", () => {
    const args = tvChannelV1Args("/tmp/source.mp4", "/tmp/tv", true);
    expect(args.filter((argument) => argument === "/tmp/source.mp4")).toHaveLength(1);
    expect(args).toEqual(expect.arrayContaining([
      "main",
      "3.1",
      "yuv420p",
      "bt709",
      "2500k",
      "5000k",
      "800k",
      "1600k",
      "60",
      "+cgop",
      "0",
      "aac",
      "aac_low",
      "48000",
      "2",
      "mpegts",
      "independent_segments+temp_file",
      "v:0,a:0,name:720p v:1,a:1,name:360p",
    ]));
    const invocation = args.join(" ");
    expect(invocation).toContain("fps=fps=30:start_time=0,split=2[720pin][360pin]");
    expect(invocation).toContain("force_key_frames:v:0 expr:gte(t,n_forced*2)");
    expect(invocation).toContain("-hls_time 2");
    expect(args.at(-2)).toBe("/tmp/tv/%v/segment_%010d.ts");
    expect(args.at(-1)).toBe("/tmp/tv/%v/index.m3u8");
  });

  it("adds deterministic stereo silence when source audio is absent", () => {
    const args = tvChannelV1Args("/tmp/silent.mp4", "/tmp/tv", false);
    expect(args).toEqual(expect.arrayContaining([
      "lavfi",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "1:a:0",
    ]));
    expect(args.filter((argument) => argument === "1:a:0")).toHaveLength(2);
    expect(args.filter((argument) => argument.endsWith(",apad"))).toHaveLength(2);
  });

  it("uses the same profile for exact station transition fillers", () => {
    const args = stationTransitionFillerArgs("/tmp/filler", 3500, "#102030");
    expect(args).toEqual(expect.arrayContaining([
      "color=c=#102030:s=1280x720:r=30:d=3.500",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t",
      "3.500",
      "v:0,a:0,name:720p v:1,a:1,name:360p",
    ]));
    expect(() => stationTransitionFillerArgs("/tmp/filler", 0)).toThrow(/between 1 and 10000/);
    expect(() => stationTransitionFillerArgs("/tmp/filler", 1000, "black")).toThrow(/hex color/);
  });

  it("builds bounded audiovisual static for exact station transition fillers", () => {
    const args = stationStaticTransitionFillerArgs("/tmp/static", 500);
    expect(args).toEqual(expect.arrayContaining([
      "color=c=#808080:s=1280x720:r=30:d=0.500,noise=alls=100:allf=t+u",
      "anoisesrc=color=white:amplitude=0.060:sample_rate=48000:d=0.500,afade=t=in:st=0:d=0.010,afade=t=out:st=0.490:d=0.010",
      "-t",
      "0.500",
      "v:0,a:0,name:720p v:1,a:1,name:360p",
    ]));
    expect(args.filter((argument) => argument === "1:a:0")).toHaveLength(2);
    expect(() => stationStaticTransitionFillerArgs("/tmp/static", 0)).toThrow(/between 1 and 10000/);
    expect(() => stationStaticTransitionFillerArgs("/tmp/static", 500, 0.5)).toThrow(/no more than 0.25/);
  });

  it("parses completed local MPEGTS inventories and validates rendition alignment", () => {
    expect(parseTvChannelPlaylist(playlist())).toEqual([
      { index: 0, name: "segment_0000000000.ts", startOffsetMs: 0, durationMs: 2000, durationSeconds: 2 },
      { index: 1, name: "segment_0000000001.ts", startOffsetMs: 2000, durationMs: 2000, durationSeconds: 2 },
      { index: 2, name: "segment_0000000002.ts", startOffsetMs: 4000, durationMs: 1500, durationSeconds: 1.5 },
    ]);
    expect(validateTvChannelSegmentInventories({ "720p": playlist(), "360p": playlist() })).toMatchObject({
      profile: "tv-channel-v1",
      segmentDurationMs: 2000,
      segmentCount: 3,
      durationMs: 5500,
    });
  });

  it("normalizes sub-second HLS target duration without changing media duration", () => {
    const short = playlist("0.500000", "segment_0000000002.ts")
      .replace("#EXT-X-TARGETDURATION:2", "#EXT-X-TARGETDURATION:1");
    const normalized = normalizeTvChannelPlaylistTargetDuration(short);
    expect(normalized).toContain("#EXT-X-TARGETDURATION:2");
    expect(normalized).toContain("#EXTINF:0.500000,");
    expect(() => normalizeTvChannelPlaylistTargetDuration("#EXTM3U\n")).toThrow(/missing its target duration/);
  });

  it("rejects incomplete, unsafe, unaligned, and cross-rendition inventories", () => {
    expect(() => parseTvChannelPlaylist(playlist().replace("#EXT-X-ENDLIST", ""))).toThrow(/incomplete/);
    expect(() => parseTvChannelPlaylist(playlist("1.5", "../segment_0000000002.ts"))).toThrow(/unsafe/);
    expect(() => parseTvChannelPlaylist(playlist().replace("#EXTINF:2.000000,", "#EXTINF:1.900000,"))).toThrow(/not aligned/);
    expect(() => validateTvChannelSegmentInventories({ "720p": playlist(), "360p": playlist("1.000000") })).toThrow(/not aligned/);
  });

  it("accepts only the expected master renditions", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
      "720p/index.m3u8",
      '#EXT-X-STREAM-INF:BANDWIDTH=1080000,RESOLUTION=640x360,CODECS="avc1.4d401f,mp4a.40.2"',
      "360p/index.m3u8",
      "",
    ].join("\n");
    expect(validateTvChannelMasterPlaylist(master)).toEqual(["720p", "360p"]);
    expect(() => validateTvChannelMasterPlaylist(master.replace("640x360", "854x480"))).toThrow(/invalid 360p/);
  });
});
