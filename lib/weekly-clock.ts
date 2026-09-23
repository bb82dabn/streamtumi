import { Temporal } from "@js-temporal/polyfill";

const MINUTES_PER_WEEK = 7 * 24 * 60;
const PRIOR_WEEK_SEARCH_LIMIT = 520;

export const MAX_WEEKLY_CLOCK_ROWS = 20_000;

export type WeeklyClockItem = Readonly<{
  id: string;
  durationMs: number;
}>;

export type WeeklyClockBlock = Readonly<{
  id: string;
  startMinute: number;
  items: readonly WeeklyClockItem[];
}>;

export type WeeklyClockInput = Readonly<{
  timeZone: string;
  serviceWeek: string;
  blocks: readonly WeeklyClockBlock[];
}>;

export type WeeklyClockTimelineItem = Readonly<{
  blockId: string;
  itemId: string;
  startsAt: Date;
  endsAt: Date;
  sourceOffsetMs: number;
  playbackDurationMs: number;
}>;

export type WeeklyClockCompileOptions = Readonly<{
  maxRows?: number;
}>;

type PreparedBlock = Readonly<{
  block: WeeklyClockBlock;
  cycleDurationMs: number;
}>;

type BlockOccurrence = Readonly<{
  prepared: PreparedBlock;
  startsAtMs: number;
}>;

function validateTimeZone(timeZone: string): void {
  if (typeof timeZone !== "string" || timeZone.length === 0) throw new Error("Weekly clock requires an IANA time zone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`);
  }
}

function parseServiceMonday(serviceWeek: string): Temporal.PlainDate {
  if (typeof serviceWeek !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(serviceWeek)) {
    throw new Error("Service week must be an ISO date in YYYY-MM-DD format");
  }

  let monday: Temporal.PlainDate;
  try {
    monday = Temporal.PlainDate.from(serviceWeek, { overflow: "reject" });
  } catch {
    throw new Error(`Invalid service week: ${serviceWeek}`);
  }
  if (monday.toString() !== serviceWeek) throw new Error(`Invalid service week: ${serviceWeek}`);
  if (monday.dayOfWeek !== 1) throw new Error("Service week must be a Monday");
  return monday;
}

function validateId(id: string, label: string): void {
  if (typeof id !== "string" || id.length === 0) throw new Error(`${label} requires a nonempty id`);
}

function prepareBlocks(blocks: readonly WeeklyClockBlock[]): PreparedBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) throw new Error("Weekly clock requires at least one block");

  const prepared = blocks.map((block, blockIndex) => {
    validateId(block?.id, `Block ${blockIndex}`);
    if (!Number.isInteger(block.startMinute) || block.startMinute < 0 || block.startMinute >= MINUTES_PER_WEEK) {
      throw new Error(`Block ${block.id} startMinute must be an integer from 0 through ${MINUTES_PER_WEEK - 1}`);
    }
    if (!Array.isArray(block.items) || block.items.length === 0) throw new Error(`Block ${block.id} requires at least one item`);

    let cycleDurationMs = 0;
    for (const [itemIndex, item] of block.items.entries()) {
      validateId(item?.id, `Item ${itemIndex} in block ${block.id}`);
      if (!Number.isSafeInteger(item.durationMs) || item.durationMs <= 0) {
        throw new Error(`Item ${item.id} in block ${block.id} requires a positive integer durationMs`);
      }
      cycleDurationMs += item.durationMs;
      if (!Number.isSafeInteger(cycleDurationMs)) throw new Error(`Block ${block.id} cycle duration is too large`);
    }
    return { block, cycleDurationMs };
  }).sort((left, right) => left.block.startMinute - right.block.startMinute);

  for (let index = 1; index < prepared.length; index += 1) {
    if (prepared[index].block.startMinute === prepared[index - 1].block.startMinute) {
      throw new Error(`Weekly clock blocks cannot share startMinute ${prepared[index].block.startMinute}`);
    }
  }
  return prepared;
}

function occurrenceFor(
  monday: Temporal.PlainDate,
  prepared: PreparedBlock,
  timeZone: string,
): BlockOccurrence | null {
  const localStart = monday.toPlainDateTime().add({ minutes: prepared.block.startMinute });
  const earlier = localStart.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  if (!earlier.toPlainDateTime().equals(localStart)) return null;
  return { prepared, startsAtMs: earlier.epochMilliseconds };
}

function occurrencesFor(
  monday: Temporal.PlainDate,
  preparedBlocks: readonly PreparedBlock[],
  timeZone: string,
): BlockOccurrence[] {
  const occurrences: BlockOccurrence[] = [];
  for (const prepared of preparedBlocks) {
    const occurrence = occurrenceFor(monday, prepared, timeZone);
    if (occurrence) occurrences.push(occurrence);
  }
  return occurrences.sort((left, right) => left.startsAtMs - right.startsAtMs
    || left.prepared.block.startMinute - right.prepared.block.startMinute);
}

function priorOccurrence(
  monday: Temporal.PlainDate,
  weekStartMs: number,
  preparedBlocks: readonly PreparedBlock[],
  timeZone: string,
): BlockOccurrence {
  for (let weeksBack = 1; weeksBack <= PRIOR_WEEK_SEARCH_LIMIT; weeksBack += 1) {
    const priorMonday = monday.subtract({ weeks: weeksBack });
    const occurrences = occurrencesFor(priorMonday, preparedBlocks, timeZone)
      .filter((occurrence) => occurrence.startsAtMs < weekStartMs);
    if (occurrences.length > 0) return occurrences[occurrences.length - 1];
  }
  throw new Error("Could not find a valid prior weekly block start");
}

function appendBlockRows(
  rows: WeeklyClockTimelineItem[],
  occurrence: BlockOccurrence,
  intervalStartMs: number,
  intervalEndMs: number,
  maxRows: number,
): void {
  if (intervalStartMs >= intervalEndMs) return;

  const { block, cycleDurationMs } = occurrence.prepared;
  let cycleOffsetMs = (intervalStartMs - occurrence.startsAtMs) % cycleDurationMs;
  if (cycleOffsetMs < 0) cycleOffsetMs += cycleDurationMs;

  let itemIndex = 0;
  while (cycleOffsetMs >= block.items[itemIndex].durationMs) {
    cycleOffsetMs -= block.items[itemIndex].durationMs;
    itemIndex += 1;
  }

  let cursorMs = intervalStartMs;
  let sourceOffsetMs = cycleOffsetMs;
  while (cursorMs < intervalEndMs) {
    if (rows.length >= maxRows) throw new Error(`Weekly clock timeline exceeds the ${maxRows} row limit`);
    const item = block.items[itemIndex];
    const playbackDurationMs = Math.min(item.durationMs - sourceOffsetMs, intervalEndMs - cursorMs);
    const endsAtMs = cursorMs + playbackDurationMs;
    rows.push({
      blockId: block.id,
      itemId: item.id,
      startsAt: new Date(cursorMs),
      endsAt: new Date(endsAtMs),
      sourceOffsetMs,
      playbackDurationMs,
    });
    cursorMs = endsAtMs;
    sourceOffsetMs = 0;
    itemIndex = (itemIndex + 1) % block.items.length;
  }
}

export function compileWeeklyClock(
  input: WeeklyClockInput,
  options: WeeklyClockCompileOptions = {},
): readonly WeeklyClockTimelineItem[] {
  validateTimeZone(input?.timeZone);
  const monday = parseServiceMonday(input?.serviceWeek);
  const preparedBlocks = prepareBlocks(input?.blocks);
  const maxRows = options.maxRows ?? MAX_WEEKLY_CLOCK_ROWS;
  if (!Number.isInteger(maxRows) || maxRows <= 0 || maxRows > MAX_WEEKLY_CLOCK_ROWS) {
    throw new Error(`maxRows must be an integer from 1 through ${MAX_WEEKLY_CLOCK_ROWS}`);
  }

  const weekStartMs = monday.toZonedDateTime(input.timeZone).epochMilliseconds;
  const weekEndMs = monday.add({ weeks: 1 }).toZonedDateTime(input.timeZone).epochMilliseconds;
  const currentOccurrences = occurrencesFor(monday, preparedBlocks, input.timeZone)
    .filter((occurrence) => occurrence.startsAtMs >= weekStartMs && occurrence.startsAtMs < weekEndMs);

  let active = priorOccurrence(monday, weekStartMs, preparedBlocks, input.timeZone);
  let cursorMs = weekStartMs;
  const rows: WeeklyClockTimelineItem[] = [];
  for (const occurrence of currentOccurrences) {
    appendBlockRows(rows, active, cursorMs, occurrence.startsAtMs, maxRows);
    active = occurrence;
    cursorMs = occurrence.startsAtMs;
  }
  appendBlockRows(rows, active, cursorMs, weekEndMs, maxRows);
  return rows;
}

export function localServiceWeekMonday(date: Date, timeZone: string): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("A valid Date is required");
  validateTimeZone(timeZone);
  const localDate = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone).toPlainDate();
  return localDate.subtract({ days: localDate.dayOfWeek - 1 }).toString();
}
