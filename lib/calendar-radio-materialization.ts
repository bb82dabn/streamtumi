import type { PoolClient } from "pg";
import { HttpError } from "@/lib/http";

export const MAX_CALENDAR_RADIO_OCCURRENCE_ITEMS = 100_000;

export type CalendarRadioSourceRole = "PRIMARY" | "EVENT_FALLBACK";

export type CalendarRadioClockItem = Readonly<{
  id: string;
  position: number;
  durationMs: number;
}>;

export type CalendarRadioOccurrencePlan = Readonly<{
  occurrenceId: string;
  sourceRole: CalendarRadioSourceRole;
  releaseBlockId: string;
  startsAt: Date;
  endsAt: Date;
  items: readonly CalendarRadioClockItem[];
}>;

export type CalendarRadioOccurrenceItem = Readonly<{
  occurrenceId: string;
  sourceRole: CalendarRadioSourceRole;
  position: number;
  releaseBlockId: string;
  releaseItemId: string;
  startsAt: Date;
  endsAt: Date;
  sourceOffsetMs: number;
  playbackDurationMs: number;
}>;

export type CalendarRadioCompileOptions = Readonly<{
  maxRows?: number;
}>;

function requireId(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} requires a nonempty id`);
}

function dateMs(value: Date, label: string): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`${label} requires a valid Date`);
  return value.getTime();
}

export function compileCalendarRadioOccurrenceItems(
  input: CalendarRadioOccurrencePlan,
  options: CalendarRadioCompileOptions = {},
): readonly CalendarRadioOccurrenceItem[] {
  requireId(input?.occurrenceId, "Calendar Radio occurrence");
  requireId(input?.releaseBlockId, "Calendar Radio release block");
  if (input.sourceRole !== "PRIMARY" && input.sourceRole !== "EVENT_FALLBACK") {
    throw new Error("Calendar Radio sourceRole must be PRIMARY or EVENT_FALLBACK");
  }
  const startsAtMs = dateMs(input.startsAt, "Calendar Radio occurrence start");
  const endsAtMs = dateMs(input.endsAt, "Calendar Radio occurrence end");
  if (endsAtMs <= startsAtMs) throw new Error("Calendar Radio occurrence requires a finite end after its start");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error(`Calendar Radio release block ${input.releaseBlockId} requires at least one item`);
  }
  const maxRows = options.maxRows ?? MAX_CALENDAR_RADIO_OCCURRENCE_ITEMS;
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > MAX_CALENDAR_RADIO_OCCURRENCE_ITEMS) {
    throw new Error(`maxRows must be an integer from 1 through ${MAX_CALENDAR_RADIO_OCCURRENCE_ITEMS}`);
  }

  const items = [...input.items].sort((left, right) => left.position - right.position);
  for (const [index, item] of items.entries()) {
    requireId(item?.id, `Item ${index} in Calendar Radio release block ${input.releaseBlockId}`);
    if (!Number.isInteger(item.position) || item.position < 0) {
      throw new Error(`Item ${item.id} in Calendar Radio release block ${input.releaseBlockId} requires a nonnegative integer position`);
    }
    if (index > 0 && item.position === items[index - 1].position) {
      throw new Error(`Calendar Radio release block ${input.releaseBlockId} cannot contain duplicate item positions`);
    }
    if (!Number.isSafeInteger(item.durationMs) || item.durationMs <= 0) {
      throw new Error(`Item ${item.id} in Calendar Radio release block ${input.releaseBlockId} requires a positive integer durationMs`);
    }
  }

  const rows: CalendarRadioOccurrenceItem[] = [];
  let cursorMs = startsAtMs;
  let itemIndex = 0;
  while (cursorMs < endsAtMs) {
    if (rows.length >= maxRows) throw new Error(`Calendar Radio occurrence plan exceeds the ${maxRows} row limit`);
    const item = items[itemIndex];
    const playbackDurationMs = Math.min(item.durationMs, endsAtMs - cursorMs);
    const rowEndsAtMs = cursorMs + playbackDurationMs;
    rows.push(Object.freeze({
      occurrenceId: input.occurrenceId,
      sourceRole: input.sourceRole,
      position: rows.length,
      releaseBlockId: input.releaseBlockId,
      releaseItemId: item.id,
      startsAt: new Date(cursorMs),
      endsAt: new Date(rowEndsAtMs),
      sourceOffsetMs: 0,
      playbackDurationMs,
    }));
    cursorMs = rowEndsAtMs;
    itemIndex = (itemIndex + 1) % items.length;
  }
  return Object.freeze(rows);
}

type ReleaseRow = {
  station_id: string;
  station_kind: "TV" | "RADIO";
};

type ReleaseEventRow = {
  id: string;
  event_kind: "PROGRAM" | "PREMIERE" | "OFFLINE";
  duration_ms: string;
  source_kind: string;
  source_clock_release_id: string | null;
  source_clock_block_id: string | null;
  fallback_source_kind: string;
  fallback_clock_release_id: string | null;
  fallback_clock_block_id: string | null;
};

type BlockRow = { release_id: string; block_id: string };
type ItemRow = {
  id: string;
  release_block_id: string;
  position: number;
  duration_ms: string;
  media_key: string | null;
};
type OccurrenceRow = {
  id: string;
  release_event_id: string;
  starts_at: Date;
  ends_at: Date | null;
};
type SourceUse = {
  releaseEventId: string;
  sourceRole: CalendarRadioSourceRole;
  clockReleaseId: string;
  clockBlockId: string;
};

function sourceKey(releaseId: string, blockId: string): string {
  return `${releaseId}\u0000${blockId}`;
}

function toDate(value: Date, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new HttpError(409, `${label} is invalid.`, "CALENDAR_RADIO_MATERIALIZATION_INVALID");
  return date;
}

async function insertOccurrenceItems(
  client: PoolClient,
  stationId: string,
  releaseId: string,
  rows: readonly CalendarRadioOccurrenceItem[],
): Promise<number> {
  let insertedCount = 0;
  const batchSize = 500;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const offset = values.length;
      values.push(stationId, releaseId, row.occurrenceId, row.sourceRole, row.position,
        row.releaseBlockId, row.releaseItemId, row.startsAt, row.endsAt,
        row.sourceOffsetMs, row.playbackDurationMs);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`;
    });
    const result = await client.query(
      `INSERT INTO calendar_radio_occurrence_items
         (station_id, release_id, occurrence_id, source_role, position,
          release_block_id, release_item_id, starts_at, ends_at,
          source_offset_ms, playback_duration_ms)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (occurrence_id, source_role, position) DO NOTHING`,
      values,
    );
    insertedCount += result.rowCount ?? 0;
  }
  return insertedCount;
}

export async function materializeCalendarReleaseThrough(
  client: PoolClient,
  releaseId: string,
  from: Date,
  to: Date,
): Promise<{ compiledItemCount: number; insertedItemCount: number }> {
  requireId(releaseId, "Calendar release");
  const fromMs = dateMs(from, "Calendar materialization start");
  const toMs = dateMs(to, "Calendar materialization end");
  if (fromMs >= toMs) throw new Error("Calendar materialization requires a nonempty [from, to) interval");

  const releaseResult = await client.query<ReleaseRow>(
    `SELECT release.station_id, station.station_kind
       FROM calendar_releases release
       JOIN stations station ON station.id = release.station_id
      WHERE release.id = $1
      FOR SHARE OF release, station`,
    [releaseId],
  );
  const release = releaseResult.rows[0];
  if (!release) throw new HttpError(404, "Calendar release not found.", "CALENDAR_RELEASE_NOT_FOUND");
  if (release.station_kind !== "RADIO") return { compiledItemCount: 0, insertedItemCount: 0 };

  const eventsResult = await client.query<ReleaseEventRow>(
    `SELECT id, event_kind, duration_ms::text, source_kind,
            source_clock_release_id, source_clock_block_id, fallback_source_kind,
            fallback_clock_release_id, fallback_clock_block_id
       FROM calendar_release_events
      WHERE release_id = $1
        AND (source_kind = 'RADIO_CLOCK_BLOCK'
          OR fallback_source_kind = 'RADIO_CLOCK_BLOCK')
      ORDER BY id`,
    [releaseId],
  );
  const uses: SourceUse[] = [];
  for (const event of eventsResult.rows) {
    if ((event.event_kind === "PROGRAM" || event.event_kind === "PREMIERE")
      && event.source_kind === "RADIO_CLOCK_BLOCK") {
      if (!event.source_clock_release_id || !event.source_clock_block_id) {
        throw new HttpError(409, "A Radio calendar source is incomplete.", "CALENDAR_SOURCE_NOT_READY");
      }
      uses.push({
        releaseEventId: event.id,
        sourceRole: "PRIMARY",
        clockReleaseId: event.source_clock_release_id,
        clockBlockId: event.source_clock_block_id,
      });
    }
    if (event.fallback_source_kind === "RADIO_CLOCK_BLOCK") {
      if (event.duration_ms === null) {
        throw new HttpError(409, "An indefinite live event cannot use a Radio clock block fallback.", "CALENDAR_INDEFINITE_RADIO_FALLBACK");
      }
      if (!event.fallback_clock_release_id || !event.fallback_clock_block_id) {
        throw new HttpError(409, "A Radio calendar fallback source is incomplete.", "CALENDAR_SOURCE_NOT_READY");
      }
      uses.push({
        releaseEventId: event.id,
        sourceRole: "EVENT_FALLBACK",
        clockReleaseId: event.fallback_clock_release_id,
        clockBlockId: event.fallback_clock_block_id,
      });
    }
  }
  if (uses.length === 0) return { compiledItemCount: 0, insertedItemCount: 0 };

  const blockIds = [...new Set(uses.map((use) => use.clockBlockId))];
  const blocksResult = await client.query<BlockRow>(
    `SELECT release.id AS release_id, block.id AS block_id
       FROM clock_releases release
       JOIN clock_release_blocks block ON block.release_id = release.id
      WHERE release.station_id = $1 AND block.id = ANY($2::uuid[])
      FOR SHARE OF release, block`,
    [release.station_id, blockIds],
  );
  const ownedBlocks = new Set(blocksResult.rows.map((row) => sourceKey(row.release_id, row.block_id)));
  for (const use of uses) {
    if (!ownedBlocks.has(sourceKey(use.clockReleaseId, use.clockBlockId))) {
      throw new HttpError(409, "A published Radio clock block was not found in this station.", "CALENDAR_SOURCE_NOT_FOUND");
    }
  }

  const itemsResult = await client.query<ItemRow>(
    `SELECT id, release_block_id, position, duration_ms::text, media_key
       FROM clock_release_items
      WHERE release_block_id = ANY($1::uuid[])
      ORDER BY release_block_id, position
      FOR SHARE`,
    [blockIds],
  );
  const itemsByBlock = new Map<string, CalendarRadioClockItem[]>();
  for (const blockId of blockIds) itemsByBlock.set(blockId, []);
  for (const item of itemsResult.rows) {
    const durationMs = Number(item.duration_ms);
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || !item.media_key?.trim()) {
      throw new HttpError(409, "A published Radio clock block contains incomplete audio.", "CALENDAR_SOURCE_NOT_READY");
    }
    itemsByBlock.get(item.release_block_id)?.push({ id: item.id, position: item.position, durationMs });
  }
  for (const use of uses) {
    if (!itemsByBlock.get(use.clockBlockId)?.length) {
      throw new HttpError(409, "A published Radio clock block has no audio items.", "CALENDAR_SOURCE_NOT_READY");
    }
  }

  const occurrencesResult = await client.query<OccurrenceRow>(
    `SELECT id, release_event_id, starts_at, ends_at
       FROM calendar_occurrences
      WHERE release_id = $1 AND starts_at < $3
        AND (ends_at IS NULL OR ends_at > $2)
      ORDER BY starts_at, id`,
    [releaseId, from, to],
  );
  const usesByEvent = new Map<string, SourceUse[]>();
  for (const use of uses) usesByEvent.set(use.releaseEventId, [...(usesByEvent.get(use.releaseEventId) ?? []), use]);

  const rows: CalendarRadioOccurrenceItem[] = [];
  for (const occurrence of occurrencesResult.rows) {
    const occurrenceUses = usesByEvent.get(occurrence.release_event_id) ?? [];
    if (occurrenceUses.length === 0) continue;
    if (occurrence.ends_at === null) {
      throw new HttpError(409, "An indefinite occurrence cannot produce a Radio audio plan.", "CALENDAR_RADIO_OCCURRENCE_INDEFINITE");
    }
    for (const use of occurrenceUses) {
      if (rows.length >= MAX_CALENDAR_RADIO_OCCURRENCE_ITEMS) {
        throw new HttpError(409, "The Calendar Radio audio plan is too dense.", "CALENDAR_RADIO_TOO_DENSE");
      }
      try {
        rows.push(...compileCalendarRadioOccurrenceItems({
          occurrenceId: occurrence.id,
          sourceRole: use.sourceRole,
          releaseBlockId: use.clockBlockId,
          startsAt: toDate(occurrence.starts_at, "Calendar occurrence start"),
          endsAt: toDate(occurrence.ends_at, "Calendar occurrence end"),
          items: itemsByBlock.get(use.clockBlockId)!,
        }, { maxRows: MAX_CALENDAR_RADIO_OCCURRENCE_ITEMS - rows.length }));
      } catch (error) {
        if (error instanceof Error && error.message.includes("row limit")) {
          throw new HttpError(409, "The Calendar Radio audio plan is too dense.", "CALENDAR_RADIO_TOO_DENSE");
        }
        throw error;
      }
    }
  }

  return {
    compiledItemCount: rows.length,
    insertedItemCount: await insertOccurrenceItems(client, release.station_id, releaseId, rows),
  };
}
