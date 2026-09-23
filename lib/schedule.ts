export type TimelineItem = { id: string; durationMs: number };
export type PlaybackOrder = "SEQUENTIAL" | "SHUFFLE";
export type ShuffleSeed = string | number | bigint;

export type PlaybackPosition = {
  index: number;
  itemId: string;
  playbackOffsetMs: number;
  cycleOffsetMs: number;
  cycleNumber: number;
  inTransition: boolean;
  transitionRemainingMs: number;
};

export function scheduleDuration(items: TimelineItem[], transitionMs = 0): number {
  if (items.length === 0) return 0;
  return items.reduce((total, item) => {
    if (!Number.isFinite(item.durationMs) || item.durationMs <= 0) throw new Error("Schedule items require a positive duration");
    return total + item.durationMs + transitionMs;
  }, 0);
}

const UINT64_MASK = (1n << 64n) - 1n;
const SPLITMIX_INCREMENT = 0x9e3779b97f4a7c15n;

function uint64(value: bigint): bigint {
  return value & UINT64_MASK;
}

function seedValue(seed: ShuffleSeed): bigint {
  try {
    return uint64(BigInt(seed));
  } catch {
    let hash = 0xcbf29ce484222325n;
    for (const character of String(seed)) {
      hash ^= BigInt(character.charCodeAt(0));
      hash = uint64(hash * 0x100000001b3n);
    }
    return hash;
  }
}

function cycleValue(cycleNumber: number | bigint): bigint {
  if (typeof cycleNumber === "bigint") return cycleNumber < 0n ? 0n : cycleNumber;
  if (!Number.isFinite(cycleNumber) || cycleNumber <= 0) return 0n;
  return BigInt(Math.floor(cycleNumber));
}

function randomSequence(seed: bigint): () => bigint {
  let state = uint64(seed);
  return () => {
    state = uint64(state + SPLITMIX_INCREMENT);
    let value = state;
    value = uint64((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n);
    value = uint64((value ^ (value >> 27n)) * 0x94d049bb133111ebn);
    return uint64(value ^ (value >> 31n));
  };
}

function shuffled<T>(items: T[], seed: bigint): T[] {
  const result = [...items];
  const next = randomSequence(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Number(next() % BigInt(index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function playlistForCycle<T>(
  items: T[],
  playbackOrder: PlaybackOrder = "SEQUENTIAL",
  shuffleSeed: ShuffleSeed = 0,
  cycleNumber: number | bigint = 0,
): T[] {
  if (playbackOrder === "SEQUENTIAL" || items.length < 2) return [...items];
  const seed = seedValue(shuffleSeed);
  const cycle = cycleValue(cycleNumber);
  const base = shuffled(items, seed ^ 0xd1b54a32d192ed03n);
  const anchorIndex = Number(cycle % BigInt(base.length));
  const first = base[anchorIndex];
  const remaining = base.filter((_item, index) => index !== anchorIndex);
  return [first, ...shuffled(remaining, seed ^ uint64(cycle * SPLITMIX_INCREMENT) ^ 0x94d049bb133111ebn)];
}

export function playbackAt(
  items: TimelineItem[],
  startedAtMs: number,
  nowMs: number,
  transitionMs = 0,
  playbackOrder: PlaybackOrder = "SEQUENTIAL",
  shuffleSeed: ShuffleSeed = 0,
): PlaybackPosition {
  const total = scheduleDuration(items, transitionMs);
  if (!total) throw new Error("Cannot resolve an empty schedule");
  const elapsed = Math.max(0, nowMs - startedAtMs);
  const cycleOffsetMs = elapsed % total;
  const cycleNumber = Math.floor(elapsed / total);
  const cycleItems = playlistForCycle(items, playbackOrder, shuffleSeed, cycleNumber);
  let cursor = 0;
  for (let index = 0; index < cycleItems.length; index += 1) {
    const item = cycleItems[index];
    const mediaEnd = cursor + item.durationMs;
    const itemEnd = mediaEnd + transitionMs;
    if (cycleOffsetMs < mediaEnd) {
      return {
        index,
        itemId: item.id,
        playbackOffsetMs: cycleOffsetMs - cursor,
        cycleOffsetMs,
        cycleNumber,
        inTransition: false,
        transitionRemainingMs: 0,
      };
    }
    if (cycleOffsetMs < itemEnd) {
      return {
        index,
        itemId: item.id,
        playbackOffsetMs: item.durationMs,
        cycleOffsetMs,
        cycleNumber,
        inTransition: true,
        transitionRemainingMs: itemEnd - cycleOffsetMs,
      };
    }
    cursor = itemEnd;
  }
  return { index: 0, itemId: cycleItems[0].id, playbackOffsetMs: 0, cycleOffsetMs: 0, cycleNumber, inTransition: false, transitionRemainingMs: 0 };
}

export function nextLoopAt(startedAtMs: number, nowMs: number, totalDurationMs: number): number {
  if (totalDurationMs <= 0) throw new Error("Schedule duration must be positive");
  const elapsed = Math.max(0, nowMs - startedAtMs);
  return startedAtMs + (Math.floor(elapsed / totalDurationMs) + 1) * totalDurationMs;
}

export function resumedScheduleStart(nowMs: number, cycleOffsetMs: number, cycleNumber = 0, totalDurationMs = 0): Date {
  const completedDuration = Math.max(0, Math.floor(cycleNumber)) * Math.max(0, totalDurationMs);
  return new Date(nowMs - completedDuration - Math.max(0, cycleOffsetMs));
}
