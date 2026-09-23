import type {
  TvChannelRendition,
  TvJournalWindowSegment,
  TvLoadedJournalWindowSegment,
} from "@/lib/tv-segment-journal";

const renditionContract: Record<TvChannelRendition, {
  bandwidth: number;
  averageBandwidth: number;
  resolution: string;
}> = {
  "720p": { bandwidth: 2_800_000, averageBandwidth: 2_628_000, resolution: "1280x720" },
  "360p": { bandwidth: 1_080_000, averageBandwidth: 928_000, resolution: "640x360" },
};

function safeUri(uri: string): string {
  if (!uri || /[\r\n]/.test(uri)) throw new Error("TV HLS URI must be a non-empty single line.");
  return uri;
}

export function buildTvHlsMasterManifest(
  uris: Partial<Record<TvChannelRendition, string>> = {
    "720p": "720p/index.m3u8",
    "360p": "360p/index.m3u8",
  },
  renditionMode: "DUAL" | "HD_ONLY" = "DUAL",
): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];
  const renditions: readonly TvChannelRendition[] = renditionMode === "DUAL" ? ["720p", "360p"] : ["720p"];
  for (const rendition of renditions) {
    const contract = renditionContract[rendition];
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${contract.bandwidth},AVERAGE-BANDWIDTH=${contract.averageBandwidth},CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=${contract.resolution},FRAME-RATE=30.000`,
      safeUri(uris[rendition] ?? ""),
    );
  }
  return `${lines.join("\n")}\n`;
}

function validateWindow(segments: readonly TvLoadedJournalWindowSegment[]): void {
  if (!segments.length) throw new Error("TV HLS delivery window is empty.");
  for (const [index, segment] of segments.entries()) {
    const maximumDurationMs = 2000;
    if (!Number.isSafeInteger(segment.mediaSequence) || segment.mediaSequence < 0) {
      throw new Error("TV HLS media sequence is invalid.");
    }
    if (!Number.isSafeInteger(segment.discontinuitySequence) || segment.discontinuitySequence < 0) {
      throw new Error("TV HLS discontinuity sequence is invalid.");
    }
    if (!Number.isInteger(segment.durationMs) || segment.durationMs < 1 || segment.durationMs > maximumDurationMs) {
      throw new Error("TV HLS segment duration is outside its source contract.");
    }
    const startsAt = segment.startsAt.getTime();
    const endsAt = segment.endsAt.getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt - startsAt !== segment.durationMs) {
      throw new Error("TV HLS segment timestamps are not an exact half-open interval.");
    }
    if (index === 0) continue;
    const previous = segments[index - 1];
    if (segment.mediaSequence !== previous.mediaSequence + 1) throw new Error("TV HLS media sequences must be contiguous.");
    const expectedDiscontinuitySequence = previous.discontinuitySequence + (previous.discontinuity ? 1 : 0);
    if (segment.discontinuitySequence !== expectedDiscontinuitySequence) {
      throw new Error("TV HLS discontinuity sequences are not monotonic.");
    }
    if (startsAt < previous.endsAt.getTime()) throw new Error("TV HLS segment timestamps overlap.");
    if (startsAt > previous.endsAt.getTime() && !segment.discontinuity) {
      throw new Error("A gap in the TV HLS timeline requires a discontinuity.");
    }
  }
}

function objectKeyForRendition(segment: TvLoadedJournalWindowSegment, rendition: TvChannelRendition): string {
  if (rendition === "720p") return segment.uris["720p"];
  return segment.uris["360p"];
}

function mediaManifest<T extends TvLoadedJournalWindowSegment>(
  segments: readonly T[],
  rendition: TvChannelRendition,
  resolveUri: (objectKey: string, rendition: TvChannelRendition, segment: T) => string,
): string {
  const first = segments[0];
  const targetDuration = Math.max(...segments.map((segment) => Math.ceil(segment.durationMs / 1000)));
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${first.mediaSequence}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${first.discontinuitySequence}`,
  ];
  for (const segment of segments) {
    const objectKey = objectKeyForRendition(segment, rendition);
    if (segment.discontinuity) lines.push("#EXT-X-DISCONTINUITY");
    lines.push(
      `#EXT-X-PROGRAM-DATE-TIME:${segment.startsAt.toISOString()}`,
      `#EXTINF:${(segment.durationMs / 1000).toFixed(3)},`,
      safeUri(resolveUri(safeUri(objectKey), rendition, segment)),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildTvHlsMediaManifest(
  segments: readonly TvLoadedJournalWindowSegment[],
  rendition: TvChannelRendition,
  resolveUri: (objectKey: string, rendition: TvChannelRendition, segment: TvLoadedJournalWindowSegment) => string = (objectKey) => objectKey,
): string {
  validateWindow(segments);
  return mediaManifest(segments, rendition, resolveUri);
}

export function buildTvHlsMediaManifests(
  segments: readonly TvJournalWindowSegment[],
  resolveUri: (objectKey: string, rendition: TvChannelRendition, segment: TvJournalWindowSegment) => string = (objectKey) => objectKey,
): Record<TvChannelRendition, string> {
  validateWindow(segments);
  return {
    "720p": mediaManifest(segments, "720p", resolveUri),
    "360p": mediaManifest(segments, "360p", resolveUri),
  };
}
