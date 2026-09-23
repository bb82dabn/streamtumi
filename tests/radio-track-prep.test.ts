import { describe, expect, it } from "vitest";
import { loudnessFilter, parseAudioProbe, parseLoudnessMeasurement } from "@/lib/radio-track-prep";

describe("Radio track preparation", () => {
  it("selects default audio, sanitizes metadata, and finds attached artwork", () => {
    const metadata = parseAudioProbe({
      format: { duration: "125.25", tags: { TITLE: " Test\u0000 Track ", ARTIST: "Artist", ALBUM: "Album" } },
      streams: [
        { index: 0, codec_type: "audio", codec_name: "aac", sample_rate: "44100", channels: 2, disposition: { default: 1 } },
        { index: 1, codec_type: "video", codec_name: "mjpeg", disposition: { attached_pic: 1 } },
      ],
    }, 1_000);
    expect(metadata).toMatchObject({ durationSeconds: 125.25, audioStreamIndex: 0, artworkStreamIndex: 1, codec: "aac", sampleRate: 44_100, channels: 2, title: "Test Track", artist: "Artist", album: "Album" });
  });

  it("rejects missing audio and excessive duration", () => {
    expect(() => parseAudioProbe({ format: { duration: "5" }, streams: [] }, 10)).toThrow(/audio stream/);
    expect(() => parseAudioProbe({ format: { duration: "20" }, streams: [{ index: 0, codec_type: "audio", sample_rate: "48000", channels: 2 }] }, 10)).toThrow(/duration/);
  });

  it("parses finite loudness measurements into the second-pass filter", () => {
    const measured = parseLoudnessMeasurement(`log\n{\n"input_i":"-18.20",\n"input_tp":"-2.10",\n"input_lra":"4.00",\n"input_thresh":"-28.00",\n"target_offset":"0.10"\n}`);
    expect(measured).toEqual({ inputI: -18.2, inputTp: -2.1, inputLra: 4, inputThresh: -28, targetOffset: 0.1 });
    expect(loudnessFilter(measured)).toContain("measured_I=-18.2");
    expect(() => parseLoudnessMeasurement('{"input_i":"-inf"}')).toThrow(/measure/);
  });
});
