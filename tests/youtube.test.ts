import { describe, expect, it } from "vitest";
import { youtubeImportSchema } from "@/lib/validation";
import { normalizeYouTubeUrl, selectYouTubeFormat } from "@/lib/youtube";

const id = "dQw4w9WgXcQ";

describe("YouTube URL normalization", () => {
  it.each([
    `https://www.youtube.com/watch?v=${id}&utm_source=test`,
    `https://youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=tracking`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
  ])("canonicalizes one direct video URL: %s", (url) => {
    expect(normalizeYouTubeUrl(url)).toEqual({ videoId: id, url: `https://www.youtube.com/watch?v=${id}` });
  });

  it.each([
    `http://www.youtube.com/watch?v=${id}`,
    `https://youtube.com.evil.example/watch?v=${id}`,
    `https://www.youtube.com@evil.example/watch?v=${id}`,
    `https://www.youtube.com:443/watch?v=${id}`,
    "https://www.youtube.com/playlist?list=example",
    `https://www.youtube.com/watch?v=${id}&list=example`,
    "https://www.youtube.com/redirect?q=https://example.com",
    "https://youtu.be/not-valid",
  ])("rejects non-canonical or unsafe input: %s", (url) => {
    expect(() => normalizeYouTubeUrl(url)).toThrow();
  });

  it("requires an explicit rights confirmation", () => {
    expect(() => youtubeImportSchema.parse({ url: `https://youtu.be/${id}`, rightsConfirmed: false, requestId: crypto.randomUUID() })).toThrow();
  });
});

describe("YouTube metadata policy", () => {
  const metadata = {
    id,
    extractor: "youtube",
    title: "  Example   program  ",
    duration: 120,
    is_live: false,
    live_status: "not_live",
    formats: [
      { format_id: "audio-only", ext: "webm", protocol: "https", vcodec: "none", acodec: "opus", height: 0 },
      { format_id: "18", ext: "mp4", protocol: "https", vcodec: "avc1", acodec: "mp4a", height: 360, filesize: 10_000 },
      { format_id: "22", ext: "mp4", protocol: "https", vcodec: "avc1", acodec: "mp4a", height: 720, filesize: 20_000 },
    ],
  };

  it("selects the best bounded progressive audio/video format", () => {
    expect(selectYouTubeFormat(metadata, id, 3_600, 25_000)).toEqual({
      formatId: "22",
      extension: "mp4",
      mimeType: "video/mp4",
      title: "Example program",
      durationSeconds: 120,
    });
  });

  it("rejects live, mismatched, excessive, and split-format media", () => {
    expect(() => selectYouTubeFormat({ ...metadata, id: "abcdefghijk" }, id, 3_600, 25_000)).toThrow(/different video/);
    expect(() => selectYouTubeFormat({ ...metadata, is_live: true }, id, 3_600, 25_000)).toThrow(/Live/);
    expect(() => selectYouTubeFormat({ ...metadata, duration: 3_601 }, id, 3_600, 25_000)).toThrow(/import limit/);
    expect(() => selectYouTubeFormat({ ...metadata, formats: [metadata.formats[0]] }, id, 3_600, 25_000)).toThrow(/combined/);
  });

  it("prefers a known bounded format over a higher unknown-size format", () => {
    const selected = selectYouTubeFormat({
      ...metadata,
      formats: [
        metadata.formats[1],
        { format_id: "unknown", ext: "mp4", protocol: "https", vcodec: "avc1", acodec: "mp4a", height: 1080 },
      ],
    }, id, 3_600, 25_000);
    expect(selected.formatId).toBe("18");
  });
});
