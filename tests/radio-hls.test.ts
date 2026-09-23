import { describe, expect, it } from "vitest";
import { artworkPackagerArgs, audioPackagerArgs, audioVodPackagerArgs, expiredHlsSegments, hlsSegmentNames, parseRadioVodPlaylist, stableRadioMaster, staticRadioMaster, virtualRadioPlaylist, waveformPackagerArgs } from "@/lib/radio-hls";

describe("Radio HLS publication", () => {
  it("accepts only generation-local deterministic segment names", () => {
    expect(hlsSegmentNames("#EXTM3U\n#EXTINF:4,\nsegment_0000000001.ts\n#EXTINF:4,\nsegment_0000000002.ts\n")).toEqual(["segment_0000000001.ts", "segment_0000000002.ts"]);
    expect(() => hlsSegmentNames("#EXTM3U\n../secret.ts\n")).toThrow(/unsafe/);
    expect(() => hlsSegmentNames("not-hls")).toThrow(/header/);
  });

  it("prunes only segments older than the rolling client grace window", () => {
    const uploaded = ["segment_0000000001.ts", "segment_0000000039.ts", "segment_0000000040.ts", "segment_0000000050.ts"];
    expect(expiredHlsSegments(uploaded, ["segment_0000000050.ts", "segment_0000000051.ts"], 10)).toEqual(["segment_0000000001.ts", "segment_0000000039.ts"]);
  });

  it("points stable masters at fenced session playlists", () => {
    const sessionId = "00000000-0000-4000-8000-000000000015";
    expect(stableRadioMaster(sessionId, "audio")).toContain(`../sessions/${sessionId}/audio/index.m3u8`);
    expect(stableRadioMaster(sessionId, "waveform")).toContain(`../sessions/${sessionId}/waveform/index.m3u8`);
    expect(stableRadioMaster(sessionId, "audio")).toContain('CODECS="mp4a.40.2"');
    expect(stableRadioMaster(sessionId, "waveform")).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
    expect(stableRadioMaster(sessionId, "waveform")).toContain("RESOLUTION=1280x720,FRAME-RATE=30.000");
    expect(stableRadioMaster(sessionId, "waveform")).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
    expect(() => stableRadioMaster("bad", "audio")).toThrow(/session/);
  });

  it("uses paced AAC and synchronized waveform packagers", () => {
    const audio = audioPackagerArgs("/tmp/audio", 4);
    expect(audio).toEqual(expect.arrayContaining(["-re", "aac", "-hls_time", "4", "delete_segments+program_date_time+temp_file"]));
    const waveform = waveformPackagerArgs("/tmp/waveform", 4);
    expect(waveform.join(" ")).toContain("showwaves=s=1280x720");
    expect(waveform).toEqual(expect.arrayContaining(["libx264", "main", "delete_segments+program_date_time+temp_file+independent_segments"]));
    expect(waveform).toEqual(expect.arrayContaining(["veryfast", "3.1", "2200k", "2400k", "4800k"]));
  });

  it("prepares immutable AAC VOD and parses only local completed segments", () => {
    const args = audioVodPackagerArgs("/tmp/mezzanine.flac", "/tmp/audio", 4);
    expect(args).toEqual(expect.arrayContaining(["/tmp/mezzanine.flac", "aac", "128k", "vod", "independent_segments+temp_file"]));
    expect(args.join(" ")).not.toContain(" -re ");
    const playlist = "#EXTM3U\n#EXTINF:4.010667,\nsegment_0000000000.ts\n#EXTINF:1.002667,\nsegment_0000000001.ts\n#EXT-X-ENDLIST\n";
    expect(parseRadioVodPlaylist(playlist)).toEqual([
      { durationSeconds: 4.010667, name: "segment_0000000000.ts" },
      { durationSeconds: 1.002667, name: "segment_0000000001.ts" },
    ]);
    expect(() => parseRadioVodPlaylist(playlist.replace("#EXT-X-ENDLIST", ""))).toThrow(/complete/);
    expect(() => parseRadioVodPlaylist(playlist.replace("segment_0000000001.ts", "../secret.ts"))).toThrow(/unsafe/);
  });

  it("builds stable static masters and contiguous clock-derived windows", () => {
    const releaseId = "00000000-0000-4000-8000-000000000029";
    expect(staticRadioMaster(releaseId)).toContain(`../releases/${releaseId}/index.m3u8`);
    const playlist = virtualRadioPlaylist([
      { name: "segment_0000000001.ts", durationSeconds: 4, mediaSequence: 11, programDateTime: new Date("2026-08-18T12:00:04Z"), uri: "items/b/segment_0000000001.ts", discontinuity: true },
      { name: "segment_0000000000.ts", durationSeconds: 4, mediaSequence: 10, programDateTime: new Date("2026-08-18T12:00:00Z"), uri: "items/a/segment_0000000000.ts", discontinuity: false },
    ]);
    expect(playlist).toContain("#EXT-X-MEDIA-SEQUENCE:10");
    expect(playlist).toContain("#EXT-X-DISCONTINUITY");
    expect(playlist.indexOf("items/a/")).toBeLessThan(playlist.indexOf("items/b/"));
    expect(() => virtualRadioPlaylist([
      { name: "segment_0000000000.ts", durationSeconds: 4, mediaSequence: 10, programDateTime: new Date(), uri: "a", discontinuity: false },
      { name: "segment_0000000002.ts", durationSeconds: 4, mediaSequence: 12, programDateTime: new Date(), uri: "b", discontinuity: false },
    ])).toThrow(/contiguous/);
  });

  it("accepts a JPEG artwork pipe for local track visuals", () => {
    const args = artworkPackagerArgs("/tmp/cover", 4);
    expect(args).toEqual(expect.arrayContaining(["image2pipe", "mjpeg", "pipe:3", "libx264"]));
    expect(args.join(" ")).toContain("scale=720:720");
  });

});
