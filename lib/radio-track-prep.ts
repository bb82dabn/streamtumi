export type AudioProbe = {
  format?: { duration?: string; tags?: Record<string, string> };
  streams?: Array<{
    index: number;
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
    duration?: string;
    disposition?: { default?: number; attached_pic?: number };
    tags?: Record<string, string>;
  }>;
};

export type PreparedAudioMetadata = {
  durationSeconds: number;
  audioStreamIndex: number;
  artworkStreamIndex: number | null;
  codec: string;
  sampleRate: number;
  channels: number;
  title: string;
  artist: string;
  album: string;
};

export type LoudnessMeasurement = {
  inputI: number;
  inputTp: number;
  inputLra: number;
  inputThresh: number;
  targetOffset: number;
};

function cleanTag(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function tagsLower(tags?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(tags ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
}

export function parseAudioProbe(probe: AudioProbe, maxDurationSeconds: number): PreparedAudioMetadata {
  const streams = probe.streams ?? [];
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const audio = audioStreams.find((stream) => stream.disposition?.default === 1) ?? audioStreams[0];
  if (!audio) throw new Error("FFprobe did not find an audio stream.");
  const durationSeconds = Number(probe.format?.duration ?? audio.duration);
  const sampleRate = Number(audio.sample_rate);
  const channels = Number(audio.channels);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > maxDurationSeconds) throw new Error("The track duration is invalid or exceeds the Radio limit.");
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 384_000) throw new Error("The track sample rate is invalid.");
  if (!Number.isInteger(channels) || channels < 1 || channels > 32) throw new Error("The track channel count is invalid.");
  const formatTags = tagsLower(probe.format?.tags);
  const streamTags = tagsLower(audio.tags);
  return {
    durationSeconds,
    audioStreamIndex: audio.index,
    artworkStreamIndex: streams.find((stream) => stream.codec_type === "video" && stream.disposition?.attached_pic === 1)?.index ?? null,
    codec: cleanTag(audio.codec_name, 40) || "unknown",
    sampleRate,
    channels,
    title: cleanTag(formatTags.title ?? streamTags.title),
    artist: cleanTag(formatTags.artist ?? formatTags.album_artist ?? streamTags.artist),
    album: cleanTag(formatTags.album ?? streamTags.album),
  };
}

export function parseLoudnessMeasurement(output: string): LoudnessMeasurement {
  const objects = output.match(/\{[\s\S]*?\}/g) ?? [];
  for (const candidate of objects.reverse()) {
    try {
      const value = JSON.parse(candidate) as Record<string, string>;
      if (!("input_i" in value)) continue;
      const measurement = {
        inputI: Number(value.input_i),
        inputTp: Number(value.input_tp),
        inputLra: Number(value.input_lra),
        inputThresh: Number(value.input_thresh),
        targetOffset: Number(value.target_offset),
      };
      if (Object.values(measurement).every(Number.isFinite)) return measurement;
    } catch {
      // FFmpeg logs can contain unrelated brace-delimited text.
    }
  }
  throw new Error("FFmpeg could not measure track loudness.");
}

export function loudnessFilter(measurement: LoudnessMeasurement): string {
  return [
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    `measured_I=${measurement.inputI}`,
    `measured_LRA=${measurement.inputLra}`,
    `measured_TP=${measurement.inputTp}`,
    `measured_thresh=${measurement.inputThresh}`,
    `offset=${measurement.targetOffset}`,
    "linear=true:print_format=summary",
  ].join(":");
}
