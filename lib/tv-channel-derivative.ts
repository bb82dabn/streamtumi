import path from "node:path";

export const TV_CHANNEL_PROFILE = "tv-channel-v1" as const;
export const TV_CHANNEL_SEGMENT_SECONDS = 2;

export type TvChannelRendition = "720p" | "360p";

export type TvChannelSegment = {
  index: number;
  name: string;
  startOffsetMs: number;
  durationMs: number;
  durationSeconds: number;
};

export type TvChannelSegmentInventory = {
  profile: typeof TV_CHANNEL_PROFILE;
  segmentDurationMs: 2000;
  segmentCount: number;
  durationMs: number;
  renditions: Record<TvChannelRendition, TvChannelSegment[]>;
};

type RenditionContract = {
  name: TvChannelRendition;
  width: number;
  height: number;
  bitrate: string;
  bufferSize: string;
};

const renditions: readonly RenditionContract[] = [
  { name: "720p", width: 1280, height: 720, bitrate: "2500k", bufferSize: "5000k" },
  { name: "360p", width: 640, height: 360, bitrate: "800k", bufferSize: "1600k" },
];

const segmentNamePattern = /^segment_(\d{10})\.ts$/;
const durationToleranceSeconds = 0.001;

function requirePath(value: string, description: string): void {
  if (!value.trim()) throw new Error(`${description} must not be empty.`);
}

function videoFilter(): string {
  const outputs = renditions.map((rendition) => {
    const input = `[${rendition.name}in]`;
    const output = `[${rendition.name}]`;
    return `${input}scale=${rendition.width}:${rendition.height}:force_original_aspect_ratio=decrease:force_divisible_by=2:out_color_matrix=bt709,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709,format=yuv420p${output}`;
  });
  return `[0:v:0]fps=fps=30:start_time=0,split=${renditions.length}${renditions.map((rendition) => `[${rendition.name}in]`).join("")};${outputs.join(";")}`;
}

function outputArgs(outputDirectory: string, audioMap: string): string[] {
  const args = ["-filter_complex", videoFilter()];
  for (const rendition of renditions) args.push("-map", `[${rendition.name}]`, "-map", audioMap);
  args.push("-map_metadata", "-1", "-map_chapters", "-1");

  for (const [index, rendition] of renditions.entries()) {
    const video = `v:${index}`;
    args.push(
      `-c:${video}`, "libx264", `-preset:${video}`, "medium",
      `-profile:${video}`, "main", `-level:${video}`, "3.1", `-pix_fmt:${video}`, "yuv420p",
      `-r:${video}`, "30", `-fps_mode:${video}`, "cfr",
      `-color_primaries:${video}`, "bt709", `-color_trc:${video}`, "bt709", `-colorspace:${video}`, "bt709",
      `-b:${video}`, rendition.bitrate, `-minrate:${video}`, rendition.bitrate,
      `-maxrate:${video}`, rendition.bitrate, `-bufsize:${video}`, rendition.bufferSize,
      `-g:${video}`, "60", `-keyint_min:${video}`, "60", `-sc_threshold:${video}`, "0",
      `-bf:${video}`, "0", `-flags:${video}`, "+cgop",
      `-force_key_frames:${video}`, "expr:gte(t,n_forced*2)",
      `-x264-params:${video}`, "nal-hrd=cbr:force-cfr=1",
    );
  }

  for (const index of renditions.keys()) {
    const audio = `a:${index}`;
    args.push(
      `-c:${audio}`, "aac", `-profile:${audio}`, "aac_low", `-b:${audio}`, "128k",
      `-ar:${audio}`, "48000", `-ac:${audio}`, "2",
      `-af:${audio}`, "aresample=48000:async=1:first_pts=0,apad",
    );
  }

  args.push(
    "-shortest", "-f", "hls", "-hls_segment_type", "mpegts",
    "-hls_time", String(TV_CHANNEL_SEGMENT_SECONDS), "-hls_playlist_type", "vod", "-hls_list_size", "0",
    "-hls_flags", "independent_segments+temp_file", "-master_pl_name", "master.m3u8",
    "-var_stream_map", "v:0,a:0,name:720p v:1,a:1,name:360p",
    "-hls_segment_filename", path.join(outputDirectory, "%v", "segment_%010d.ts"),
    path.join(outputDirectory, "%v", "index.m3u8"),
  );
  return args;
}

export function tvChannelV1Args(input: string, outputDirectory: string, hasAudio: boolean): string[] {
  requirePath(input, "TV channel input path");
  requirePath(outputDirectory, "TV channel output directory");
  const args = ["-hide_banner", "-loglevel", "warning", "-nostats", "-nostdin", "-y", "-i", input];
  if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  args.push(...outputArgs(outputDirectory, hasAudio ? "0:a:0" : "1:a:0"));
  return args;
}

export function stationTransitionFillerArgs(
  outputDirectory: string,
  durationMs: number,
  color = "#000000",
): string[] {
  requirePath(outputDirectory, "TV transition output directory");
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 10_000) {
    throw new Error("TV transition duration must be an integer between 1 and 10000 milliseconds.");
  }
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("TV transition color must be a six-digit hex color.");
  const seconds = (durationMs / 1000).toFixed(3);
  return [
    "-hide_banner", "-loglevel", "warning", "-nostats", "-nostdin", "-y",
    "-f", "lavfi", "-i", `color=c=${color}:s=1280x720:r=30:d=${seconds}`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", seconds,
    ...outputArgs(outputDirectory, "1:a:0"),
  ];
}

export function stationStaticTransitionFillerArgs(
  outputDirectory: string,
  durationMs: number,
  audioAmplitude = 0.06,
): string[] {
  requirePath(outputDirectory, "TV transition output directory");
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 10_000) {
    throw new Error("TV transition duration must be an integer between 1 and 10000 milliseconds.");
  }
  if (!Number.isFinite(audioAmplitude) || audioAmplitude <= 0 || audioAmplitude > 0.25) {
    throw new Error("TV static audio amplitude must be greater than zero and no more than 0.25.");
  }
  const seconds = (durationMs / 1000).toFixed(3);
  const fadeSeconds = Math.min(0.01, durationMs / 2000);
  const fadeOutAt = Math.max(0, durationMs / 1000 - fadeSeconds);
  const audio = [
    `anoisesrc=color=white:amplitude=${audioAmplitude.toFixed(3)}:sample_rate=48000:d=${seconds}`,
    `afade=t=in:st=0:d=${fadeSeconds.toFixed(3)}`,
    `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=${fadeSeconds.toFixed(3)}`,
  ].join(",");
  return [
    "-hide_banner", "-loglevel", "warning", "-nostats", "-nostdin", "-y",
    "-f", "lavfi", "-i", `color=c=#808080:s=1280x720:r=30:d=${seconds},noise=alls=100:allf=t+u`,
    "-f", "lavfi", "-i", audio,
    "-t", seconds,
    ...outputArgs(outputDirectory, "1:a:0"),
  ];
}

function requiredTag(lines: readonly string[], tag: string, description: string): string {
  const value = lines.find((line) => line.startsWith(tag));
  if (!value) throw new Error(`TV channel playlist is missing ${description}.`);
  return value.slice(tag.length);
}

export function normalizeTvChannelPlaylistTargetDuration(playlist: string): string {
  if (!/^#EXT-X-TARGETDURATION:\d+$/m.test(playlist)) {
    throw new Error("TV channel playlist is missing its target duration.");
  }
  return playlist.replace(/^#EXT-X-TARGETDURATION:\d+$/m, `#EXT-X-TARGETDURATION:${TV_CHANNEL_SEGMENT_SECONDS}`);
}

export function parseTvChannelPlaylist(playlist: string): TvChannelSegment[] {
  const lines = playlist.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") throw new Error("TV channel playlist is missing its HLS header.");
  if (!lines.includes("#EXT-X-ENDLIST")) throw new Error("TV channel playlist is incomplete.");
  if (!lines.includes("#EXT-X-PLAYLIST-TYPE:VOD")) throw new Error("TV channel playlist is not VOD.");
  if (!lines.includes("#EXT-X-INDEPENDENT-SEGMENTS")) throw new Error("TV channel playlist does not declare independent segments.");
  if (requiredTag(lines, "#EXT-X-TARGETDURATION:", "its target duration") !== "2") {
    throw new Error("TV channel playlist target duration must be two seconds.");
  }
  if (requiredTag(lines, "#EXT-X-MEDIA-SEQUENCE:", "its media sequence") !== "0") {
    throw new Error("TV channel playlist media sequence must begin at zero.");
  }
  if (lines.some((line) => /^#EXT-X-(?:KEY|MAP|BYTERANGE|DISCONTINUITY)(?::|$)/.test(line))) {
    throw new Error("TV channel playlist contains unsupported segment state.");
  }

  const segments: TvChannelSegment[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const durationMatch = /^#EXTINF:([0-9]+(?:\.[0-9]+)?),$/.exec(lines[lineIndex]);
    if (!durationMatch) {
      if (!lines[lineIndex].startsWith("#")) throw new Error("TV channel playlist contains an unbound segment URI.");
      continue;
    }
    const durationSeconds = Number(durationMatch[1]);
    const name = lines[lineIndex + 1];
    const nameMatch = segmentNamePattern.exec(name ?? "");
    if (!nameMatch || path.posix.basename(name) !== name) {
      throw new Error("TV channel playlist contains an unsafe segment path.");
    }
    const index = segments.length;
    if (Number(nameMatch[1]) !== index) throw new Error("TV channel playlist segment numbers must be contiguous from zero.");
    const durationMs = Math.round(durationSeconds * 1000);
    if (!Number.isFinite(durationSeconds) || durationMs < 1 || durationMs > TV_CHANNEL_SEGMENT_SECONDS * 1000) {
      throw new Error("TV channel playlist contains an invalid segment duration.");
    }
    segments.push({
      index,
      name,
      startOffsetMs: index * TV_CHANNEL_SEGMENT_SECONDS * 1000,
      durationMs,
      durationSeconds,
    });
    lineIndex += 1;
  }

  if (!segments.length) throw new Error("TV channel playlist contains no segments.");
  for (const segment of segments.slice(0, -1)) {
    if (Math.abs(segment.durationSeconds - TV_CHANNEL_SEGMENT_SECONDS) > durationToleranceSeconds) {
      throw new Error("TV channel playlist has a segment that is not aligned to two seconds.");
    }
  }
  return segments;
}

export function validateTvChannelMasterPlaylist(master: string): TvChannelRendition[] {
  const lines = master.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") throw new Error("TV channel master playlist is missing its HLS header.");
  const found: TvChannelRendition[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const uri = lines[index + 1];
    const rendition = renditions.find((candidate) => uri === `${candidate.name}/index.m3u8`);
    if (!rendition || found.includes(rendition.name)) throw new Error("TV channel master playlist contains an unexpected rendition URI.");
    const attributes = lines[index];
    if (!attributes.includes(`RESOLUTION=${rendition.width}x${rendition.height}`)
       || !attributes.includes("avc1.4d401f")
       || !attributes.includes("mp4a.40.2")) {
      throw new Error(`TV channel master playlist has invalid ${rendition.name} stream attributes.`);
    }
    found.push(rendition.name);
    index += 1;
  }
  if (found.length !== renditions.length || renditions.some((rendition) => !found.includes(rendition.name))) {
    throw new Error("TV channel master playlist must contain the 720p and 360p renditions.");
  }
  return found;
}

export function validateTvChannelSegmentInventories(
  playlists: Record<TvChannelRendition, string>,
): TvChannelSegmentInventory {
  const parsed = {
    "720p": parseTvChannelPlaylist(playlists["720p"]),
    "360p": parseTvChannelPlaylist(playlists["360p"]),
  };
  if (parsed["720p"].length !== parsed["360p"].length) {
    throw new Error("TV channel rendition segment inventories have different lengths.");
  }
  for (let index = 0; index < parsed["720p"].length; index += 1) {
    const high = parsed["720p"][index];
    const low = parsed["360p"][index];
    if (high.name !== low.name || high.durationMs !== low.durationMs) {
      throw new Error("TV channel rendition segment inventories are not aligned.");
    }
  }
  return {
    profile: TV_CHANNEL_PROFILE,
    segmentDurationMs: 2000,
    segmentCount: parsed["720p"].length,
    durationMs: parsed["720p"].reduce((total, segment) => total + segment.durationMs, 0),
    renditions: parsed,
  };
}
