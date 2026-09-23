import { playbackAt, playlistForCycle, type PlaybackOrder } from "@/lib/schedule";

export type PreviewItem = { video_id: string; duration_ms: string; thumbnail_key: string | null };

export function resolveGuidePreview(
  online: boolean,
  scheduleStartedAt: Date | null,
  transitionMs: number,
  items: PreviewItem[],
  nowMs = Date.now(),
  playbackOrder: PlaybackOrder = "SEQUENTIAL",
  shuffleSeed = "0",
): { item: PreviewItem | null; offsetMs: number } {
  if (!items.length) return { item: null, offsetMs: 0 };
  const timeline = items.map((item) => ({ id: item.video_id, durationMs: Number(item.duration_ms) }));
  if (!online || !scheduleStartedAt) return { item: playlistForCycle(items, playbackOrder, shuffleSeed, 0)[0], offsetMs: 0 };
  const position = playbackAt(timeline, scheduleStartedAt.getTime(), nowMs, transitionMs, playbackOrder, shuffleSeed);
  const cycleItems = playlistForCycle(items, playbackOrder, shuffleSeed, position.cycleNumber);
  const upcoming = position.index === cycleItems.length - 1
    ? playlistForCycle(items, playbackOrder, shuffleSeed, position.cycleNumber + 1)[0]
    : cycleItems[position.index + 1];
  return {
    item: position.inTransition ? upcoming : cycleItems[position.index],
    offsetMs: position.inTransition ? 0 : position.playbackOffsetMs,
  };
}
