import { playbackAt, playlistForCycle, type PlaybackOrder, type PlaybackPosition, type TimelineItem } from "@/lib/schedule";

export type PlaybackClockAnchor = {
  serverTimeAtReceiptMs: number;
  receivedAtMs: number;
};

export type LiveSchedule = {
  scheduleStartedAt: string;
  transitionMs: number;
  playbackOrder?: PlaybackOrder;
  shuffleSeed?: string;
  playlist: Array<TimelineItem & { schedulePosition?: number }>;
};

function canonicalPlaylist<T extends TimelineItem & { schedulePosition?: number }>(playlist: T[]): T[] {
  return playlist.map((item, index) => ({ item, index }))
    .sort((left, right) => (left.item.schedulePosition ?? left.index) - (right.item.schedulePosition ?? right.index))
    .map(({ item }) => item);
}

export function livePlaylistForCycle<T extends TimelineItem & { schedulePosition?: number }>(schedule: LiveSchedule & { playlist: T[] }, cycleNumber: number): T[] {
  return playlistForCycle(canonicalPlaylist(schedule.playlist), schedule.playbackOrder, schedule.shuffleSeed, cycleNumber);
}

export function createPlaybackClockAnchor(serverTime: string, requestStartedAtMs: number, receivedAtMs: number): PlaybackClockAnchor {
  const serverTimeMs = Date.parse(serverTime);
  if (!Number.isFinite(serverTimeMs)) throw new Error("The station returned an invalid server clock.");
  const estimatedOneWayDelayMs = Math.max(0, receivedAtMs - requestStartedAtMs) / 2;
  return { serverTimeAtReceiptMs: serverTimeMs + estimatedOneWayDelayMs, receivedAtMs };
}

export function livePlaybackPosition(schedule: LiveSchedule, anchor: PlaybackClockAnchor, nowMs: number): PlaybackPosition {
  const scheduleStartedAtMs = Date.parse(schedule.scheduleStartedAt);
  if (!Number.isFinite(scheduleStartedAtMs)) throw new Error("The station returned an invalid schedule clock.");
  const estimatedServerNowMs = anchor.serverTimeAtReceiptMs + Math.max(0, nowMs - anchor.receivedAtMs);
  return playbackAt(canonicalPlaylist(schedule.playlist), scheduleStartedAtMs, estimatedServerNowMs, schedule.transitionMs, schedule.playbackOrder, schedule.shuffleSeed);
}

export function phaseRemainingMs(position: PlaybackPosition, playlist: TimelineItem[]): number {
  if (position.inTransition) return position.transitionRemainingMs;
  return Math.max(0, (playlist[position.index]?.durationMs ?? 0) - position.playbackOffsetMs);
}
