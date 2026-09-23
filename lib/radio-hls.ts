import path from "node:path";
import { radioVisualizerFilter, type RadioVisualizerId } from "@/lib/radio-visualizers";

export type RadioOutputKind = "audio" | "waveform";

export type RadioVodSegment = {
  durationSeconds: number;
  name: string;
};

export type VirtualRadioSegment = RadioVodSegment & {
  mediaSequence: number;
  programDateTime: Date;
  uri: string;
  discontinuity: boolean;
};

export function hlsSegmentNames(playlist: string): string[] {
  if (!playlist.startsWith("#EXTM3U")) throw new Error("Invalid HLS playlist header.");
  const names = playlist.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (!names.length) throw new Error("HLS playlist does not contain any segments.");
  for (const name of names) {
    if (!/^segment_\d{10}\.ts$/.test(name) || path.posix.basename(name) !== name) throw new Error("HLS playlist contains an unsafe segment path.");
  }
  return names;
}

export function expiredHlsSegments(uploaded: Iterable<string>, current: readonly string[], graceSegments = 30): string[] {
  const currentNumbers = current.map((name) => Number(/^segment_(\d{10})\.ts$/.exec(name)?.[1])).filter(Number.isFinite);
  if (!currentNumbers.length) return [];
  const threshold = Math.min(...currentNumbers) - graceSegments;
  return [...uploaded].filter((name) => {
    const match = /^segment_(\d{10})\.ts$/.exec(name);
    return Boolean(match && Number(match[1]) < threshold);
  });
}

export function stableRadioMaster(sessionId: string, output: RadioOutputKind): string {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Invalid Radio session ID.");
  const streamInfo = output === "audio"
    ? 'BANDWIDTH=160000,AVERAGE-BANDWIDTH=128000,CODECS="mp4a.40.2"'
    : 'BANDWIDTH=2800000,AVERAGE-BANDWIDTH=2328000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=30.000';
  return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:${streamInfo}\n../sessions/${sessionId}/${output}/index.m3u8\n`;
}

export function staticRadioMaster(releaseId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(releaseId)) throw new Error("Invalid Radio release ID.");
  return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=160000,AVERAGE-BANDWIDTH=128000,CODECS="mp4a.40.2"\n../releases/${releaseId}/index.m3u8\n`;
}

export function audioVodPackagerArgs(input: string, directory: string, segmentSeconds: number): string[] {
  return [
    "-hide_banner", "-loglevel", "warning", "-nostats", "-nostdin", "-y",
    "-i", input, "-map", "0:a:0",
    "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-f", "hls", "-hls_segment_type", "mpegts", "-hls_time", String(segmentSeconds),
    "-hls_playlist_type", "vod", "-hls_flags", "independent_segments+temp_file",
    "-hls_segment_filename", path.join(directory, "segment_%010d.ts"), path.join(directory, "index.m3u8"),
  ];
}

export function parseRadioVodPlaylist(playlist: string): RadioVodSegment[] {
  if (!playlist.startsWith("#EXTM3U")) throw new Error("Radio VOD playlist is missing its HLS header.");
  if (!playlist.includes("#EXT-X-ENDLIST")) throw new Error("Radio VOD playlist is not complete.");
  const lines = playlist.split(/\r?\n/);
  const segments: RadioVodSegment[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const duration = /^#EXTINF:([0-9]+(?:\.[0-9]+)?),/.exec(lines[index]);
    if (!duration) continue;
    const name = lines[index + 1]?.trim();
    if (!name || !/^segment_\d{10}\.ts$/.test(name)) throw new Error("Radio VOD playlist contains an unsafe segment path.");
    const durationSeconds = Number(duration[1]);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Radio VOD playlist contains an invalid segment duration.");
    segments.push({ durationSeconds, name });
  }
  if (!segments.length) throw new Error("Radio VOD playlist contains no segments.");
  return segments;
}

export function virtualRadioPlaylist(
  segments: readonly VirtualRadioSegment[],
  options: { targetDuration: number; discontinuitySequence: number } = { targetDuration: 5, discontinuitySequence: 0 },
): string {
  if (!segments.length) throw new Error("The Radio delivery window is empty.");
  const ordered = [...segments].sort((left, right) => left.mediaSequence - right.mediaSequence);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].mediaSequence !== ordered[index - 1].mediaSequence + 1) throw new Error("Radio media sequences must be contiguous.");
  }
  const targetDuration = Math.max(1, Math.ceil(options.targetDuration));
  if (ordered.some((segment) => segment.durationSeconds > targetDuration)) throw new Error("Radio target duration is shorter than a media segment.");
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${ordered[0].mediaSequence}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${Math.max(0, Math.floor(options.discontinuitySequence))}`,
  ];
  for (const segment of ordered) {
    if (segment.discontinuity) lines.push("#EXT-X-DISCONTINUITY");
    lines.push(`#EXT-X-PROGRAM-DATE-TIME:${segment.programDateTime.toISOString()}`);
    lines.push(`#EXTINF:${segment.durationSeconds.toFixed(6)},`);
    lines.push(segment.uri);
  }
  return `${lines.join("\n")}\n`;
}

export function audioPackagerArgs(directory: string, segmentSeconds: number): string[] {
  return [
    "-hide_banner", "-loglevel", "warning", "-nostats", "-nostdin", "-y", "-re",
    "-f", "f32le", "-ar", "48000", "-ac", "2", "-i", "pipe:0", "-map", "0:a:0",
    "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-f", "hls", "-hls_segment_type", "mpegts", "-hls_time", String(segmentSeconds), "-hls_list_size", "12",
    "-hls_delete_threshold", "30", "-hls_flags", "delete_segments+program_date_time+temp_file",
    "-hls_segment_filename", path.join(directory, "segment_%010d.ts"), path.join(directory, "index.m3u8"),
  ];
}

export function waveformPackagerArgs(directory: string, segmentSeconds: number): string[] {
  return [
    "-hide_banner", "-loglevel", "warning", "-nostats", "-nostdin", "-y", "-re",
    "-f", "f32le", "-ar", "48000", "-ac", "2", "-i", "pipe:0",
    "-filter_complex", "[0:a:0]asplit=2[wavein][audio];[wavein]aformat=sample_fmts=s16,showwaves=s=1280x720:mode=cline:rate=30:colors=#e66a5f|#e7b16f,fps=30,format=yuv420p,setsar=1[video]",
    "-map", "[video]", "-map", "[audio]", "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-profile:v", "main", "-level:v", "3.1", "-pix_fmt", "yuv420p", "-r", "30", "-g", "120", "-keyint_min", "120", "-sc_threshold", "0", "-bf", "0", "-flags:v", "+cgop",
    "-b:v", "2200k", "-maxrate:v", "2400k", "-bufsize:v", "4800k", "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-f", "hls", "-hls_segment_type", "mpegts", "-hls_time", String(segmentSeconds), "-hls_list_size", "12",
    "-hls_delete_threshold", "30", "-hls_flags", "delete_segments+program_date_time+temp_file+independent_segments",
    "-hls_segment_filename", path.join(directory, "segment_%010d.ts"), path.join(directory, "index.m3u8"),
  ];
}

export function visualizerPackagerArgs(directory: string, segmentSeconds: number, visualizerId: RadioVisualizerId): string[] {
  const args = waveformPackagerArgs(directory, segmentSeconds);
  const filterIndex = args.indexOf("-filter_complex") + 1;
  args[filterIndex] = radioVisualizerFilter(visualizerId);
  return args;
}

export function artworkPackagerArgs(directory: string, segmentSeconds: number): string[] {
  return [
    "-hide_banner", "-loglevel", "warning", "-nostats", "-nostdin", "-y", "-re",
    "-f", "f32le", "-ar", "48000", "-ac", "2", "-i", "pipe:0",
    "-thread_queue_size", "64", "-framerate", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-i", "pipe:3",
    "-filter_complex", "[1:v]scale=720:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#120000,fps=30,format=yuv420p,setsar=1[video]",
    "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-profile:v", "main", "-level:v", "3.1", "-pix_fmt", "yuv420p", "-r", "30", "-g", "120", "-keyint_min", "120", "-sc_threshold", "0", "-bf", "0", "-flags:v", "+cgop",
    "-b:v", "2200k", "-maxrate:v", "2400k", "-bufsize:v", "4800k", "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-f", "hls", "-hls_segment_type", "mpegts", "-hls_time", String(segmentSeconds), "-hls_list_size", "12",
    "-hls_delete_threshold", "30", "-hls_flags", "delete_segments+program_date_time+temp_file+independent_segments",
    "-hls_segment_filename", path.join(directory, "segment_%010d.ts"), path.join(directory, "index.m3u8"),
  ];
}
