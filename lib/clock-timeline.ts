import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/db";
import { insertRadioTimelineDelivery } from "@/lib/radio-delivery-publication";
import { compileWeeklyClock, localServiceWeekMonday, type WeeklyClockBlock } from "@/lib/weekly-clock";

type ReleaseRow = { time_zone: string; radio_delivery_mode: "PLAYOUT" | "STATIC_HLS" };
type ReleaseBlockRow = { id: string; start_minute: number };
type ReleaseItemRow = { id: string; release_block_id: string; duration_ms: string };

async function insertRows(client: PoolClient, releaseId: string, serviceWeek: string, rows: ReturnType<typeof compileWeeklyClock>): Promise<void> {
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    const values: unknown[] = [];
    const tuples = batch.map((row, index) => {
      const offset = values.length;
      values.push(releaseId, serviceWeek, start + index, row.blockId, row.itemId, row.startsAt, row.endsAt, row.sourceOffsetMs, row.playbackDurationMs);
      return `($${offset + 1}, $${offset + 2}::date, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
    });
    await client.query(
      `INSERT INTO clock_timeline_items
       (release_id, service_week, position, release_block_id, release_item_id, starts_at, ends_at, source_offset_ms, playback_duration_ms)
       VALUES ${tuples.join(", ")} ON CONFLICT (release_id, service_week, position) DO NOTHING`,
      values,
    );
  }
}

export function serviceWeeksFrom(date: Date, timeZone: string, count: number): string[] {
  const first = Temporal.PlainDate.from(localServiceWeekMonday(date, timeZone));
  return Array.from({ length: count }, (_, index) => first.add({ weeks: index }).toString());
}

export async function ensureClockTimeline(releaseId: string, now = new Date(), weekCount = 3): Promise<string[]> {
  const release = await query<ReleaseRow>(
    "SELECT release.time_zone, station.radio_delivery_mode FROM clock_releases release JOIN stations station ON station.id = release.station_id WHERE release.id = $1",
    [releaseId],
  );
  if (!release.rows[0]) throw new Error("Clock release not found.");
  const weeks = serviceWeeksFrom(now, release.rows[0].time_zone, weekCount);
  for (const week of weeks) {
    await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${releaseId}:${week}`]);
      const existing = await client.query("SELECT 1 FROM clock_timeline_items WHERE release_id = $1 AND service_week = $2::date LIMIT 1", [releaseId, week]);
      if (existing.rowCount) {
        if (release.rows[0].radio_delivery_mode === "STATIC_HLS" && !(await insertRadioTimelineDelivery(client, releaseId, week))) {
          throw new Error("Radio release delivery artifacts are incomplete.");
        }
        return;
      }
      const [blocksResult, itemsResult] = await Promise.all([
        client.query<ReleaseBlockRow>("SELECT id, start_minute FROM clock_release_blocks WHERE release_id = $1 ORDER BY start_minute", [releaseId]),
        client.query<ReleaseItemRow>(
          `SELECT i.id, i.release_block_id, i.duration_ms::text
             FROM clock_release_items i JOIN clock_release_blocks b ON b.id = i.release_block_id
            WHERE b.release_id = $1 ORDER BY i.release_block_id, i.position`,
          [releaseId],
        ),
      ]);
      const compilerBlocks: WeeklyClockBlock[] = blocksResult.rows.map((block) => ({
        id: block.id,
        startMinute: block.start_minute,
        items: itemsResult.rows.filter((item) => item.release_block_id === block.id).map((item) => ({ id: item.id, durationMs: Number(item.duration_ms) })),
      }));
      const rows = compileWeeklyClock({ timeZone: release.rows[0].time_zone, serviceWeek: week, blocks: compilerBlocks });
      await insertRows(client, releaseId, week, rows);
      if (release.rows[0].radio_delivery_mode === "STATIC_HLS" && !(await insertRadioTimelineDelivery(client, releaseId, week))) {
        throw new Error("Radio release delivery artifacts are incomplete.");
      }
    });
  }
  return weeks;
}
