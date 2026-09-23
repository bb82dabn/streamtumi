import type { PoolClient } from "pg";
import { publishStationEvent } from "@/lib/chat-events";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { insertRadioTimelineDelivery, snapshotRadioReleaseDelivery } from "@/lib/radio-delivery-publication";
import { compileWeeklyClock, localServiceWeekMonday, type WeeklyClockBlock } from "@/lib/weekly-clock";

type ClockStation = {
  id: string;
  owner_id: string;
  programming_mode: "LEGACY_LOOP" | "CLOCK";
  station_kind: "TV" | "RADIO";
  time_zone: string;
  clock_draft_version: number;
  active_clock_release_id: string | null;
  active_source_draft_version: number | null;
  radio_delivery_mode: "PLAYOUT" | "STATIC_HLS";
};

type DraftBlock = {
  id: string;
  start_minute: number;
  source_kind: "RADIO_ROTATION";
  radio_rotation_id: string;
  source_name: string;
  page: number;
  story_slug: string;
  segment_type: string;
  planned_duration_ms: string | null;
  editorial_status: string;
  technical_status: string;
  talent: string;
  camera_source_note: string;
  script: string;
  notes: string;
};

type DraftItem = {
  rotation_id: string;
  track_id: string;
  position: number;
  title: string;
  artist: string;
  album: string;
  status: string;
  duration_ms: string | null;
  mezzanine_key: string | null;
  artwork_key: string | null;
  audio_hls_key: string | null;
};

type ReleaseBlock = DraftBlock & { releaseBlockId: string; items: Array<DraftItem & { releaseItemId: string }> };

async function insertTimelineRows(
  client: PoolClient,
  releaseId: string,
  serviceWeek: string,
  rows: readonly { blockId: string; itemId: string; startsAt: Date; endsAt: Date; sourceOffsetMs: number; playbackDurationMs: number }[],
): Promise<void> {
  const batchSize = 500;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row, index) => {
      const position = start + index;
      const offset = values.length;
      values.push(releaseId, serviceWeek, position, row.blockId, row.itemId, row.startsAt, row.endsAt, row.sourceOffsetMs, row.playbackDurationMs);
      return `($${offset + 1}, $${offset + 2}::date, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
    });
    await client.query(
      `INSERT INTO clock_timeline_items
       (release_id, service_week, position, release_block_id, release_item_id, starts_at, ends_at, source_offset_ms, playback_duration_ms)
       VALUES ${tuples.join(", ")}`,
      values,
    );
  }
}

export async function publishClockRelease(stationId: string, ownerId: string, expectedDraftVersion: number, now = new Date()): Promise<{ releaseId: string; releaseNumber: number; sourceDraftVersion: number; timeZone: string; compiledWeeks: string[] }> {
  const result = await transaction(async (client) => {
    const stationResult = await client.query<ClockStation>(
      `SELECT s.id, s.owner_id, s.programming_mode, s.station_kind, s.time_zone,
               s.clock_draft_version, s.active_clock_release_id, s.radio_delivery_mode,
              active.source_draft_version AS active_source_draft_version
         FROM stations s LEFT JOIN clock_releases active ON active.id = s.active_clock_release_id
        WHERE s.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL FOR UPDATE OF s`,
      [stationId, ownerId],
    );
    const station = stationResult.rows[0];
    if (!station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    if (station.programming_mode !== "CLOCK") throw new HttpError(409, "Convert this station to clock programming before publishing.", "CLOCK_NOT_ENABLED");
    if (station.clock_draft_version !== expectedDraftVersion) throw new HttpError(409, "The programming draft changed. Refresh and try again.", "PROGRAMMING_CONFLICT");
    if (station.active_source_draft_version === expectedDraftVersion) throw new HttpError(409, "This programming draft is already on air.", "NO_PROGRAMMING_CHANGES");

    const blocksResult = await client.query<DraftBlock>(
       `SELECT b.id, b.start_minute, b.source_kind, b.radio_rotation_id, r.name AS source_name,
               b.page, b.story_slug, b.segment_type, b.planned_duration_ms::text,
               b.editorial_status, b.technical_status, b.talent, b.camera_source_note,
               b.script, b.notes
         FROM clock_draft_blocks b JOIN radio_rotations r ON r.id = b.radio_rotation_id
        WHERE b.station_id = $1 AND b.source_kind = 'RADIO_ROTATION'
        ORDER BY b.start_minute`,
      [stationId],
    );
    if (!blocksResult.rows.length) throw new HttpError(409, "Add at least one weekly clock block before publishing.", "EMPTY_CLOCK");
    const rotationIds = [...new Set(blocksResult.rows.map((block) => block.radio_rotation_id))];
    const itemsResult = await client.query<DraftItem>(
      `SELECT i.rotation_id, i.track_id, i.position, t.title, t.artist, t.album, t.status,
               t.duration_ms::text, t.mezzanine_key, t.artwork_key, t.audio_hls_key
         FROM radio_rotation_items i JOIN radio_tracks t ON t.id = i.track_id
        WHERE i.rotation_id = ANY($1::uuid[]) ORDER BY i.rotation_id, i.position`,
      [rotationIds],
    );
    const itemsByRotation = new Map<string, DraftItem[]>();
    for (const item of itemsResult.rows) itemsByRotation.set(item.rotation_id, [...(itemsByRotation.get(item.rotation_id) ?? []), item]);
    for (const block of blocksResult.rows) {
      const items = itemsByRotation.get(block.radio_rotation_id) ?? [];
      if (!items.length) throw new HttpError(409, `Rotation "${block.source_name}" has no tracks.`, "EMPTY_ROTATION");
      if (items.some((item) => item.status !== "READY" || !item.duration_ms || !item.mezzanine_key)) {
        throw new HttpError(409, `Every track in "${block.source_name}" must finish processing before publication.`, "ROTATION_NOT_READY");
      }
      if (station.radio_delivery_mode === "STATIC_HLS" && items.some((item) => !item.audio_hls_key)) {
        throw new HttpError(409, `Every track in "${block.source_name}" must have prepared broadcast audio before publication.`, "RADIO_DELIVERY_NOT_READY");
      }
    }

    const numberResult = await client.query<{ release_number: number }>("SELECT COALESCE(max(release_number), 0)::int + 1 AS release_number FROM clock_releases WHERE station_id = $1", [stationId]);
    const releaseNumber = numberResult.rows[0].release_number;
    const release = await client.query<{ id: string }>(
      `INSERT INTO clock_releases (station_id, release_number, source_draft_version, time_zone, published_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [stationId, releaseNumber, expectedDraftVersion, station.time_zone, ownerId],
    );
    const releaseId = release.rows[0].id;
    const releaseBlocks: ReleaseBlock[] = [];
    for (const [position, block] of blocksResult.rows.entries()) {
      const insertedBlock = await client.query<{ id: string }>(
        `INSERT INTO clock_release_blocks
           (release_id, position, start_minute, source_kind, source_id, source_name,
            page, story_slug, segment_type, planned_duration_ms, editorial_status,
            technical_status, talent, camera_source_note, script, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
        [releaseId, position, block.start_minute, block.source_kind, block.radio_rotation_id, block.source_name,
          block.page, block.story_slug, block.segment_type, block.planned_duration_ms,
          block.editorial_status, block.technical_status, block.talent,
          block.camera_source_note, block.script, block.notes],
      );
      const releaseItems: ReleaseBlock["items"] = [];
      for (const item of itemsByRotation.get(block.radio_rotation_id) ?? []) {
        const insertedItem = await client.query<{ id: string }>(
          `INSERT INTO clock_release_items
           (release_block_id, position, media_kind, radio_track_id, title, artist, album, duration_ms, media_key, artwork_key)
           VALUES ($1, $2, 'RADIO_TRACK', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [insertedBlock.rows[0].id, item.position, item.track_id, item.title, item.artist, item.album, item.duration_ms, item.mezzanine_key, item.artwork_key],
        );
        releaseItems.push({ ...item, releaseItemId: insertedItem.rows[0].id });
      }
      releaseBlocks.push({ ...block, releaseBlockId: insertedBlock.rows[0].id, items: releaseItems });
    }
    if (station.radio_delivery_mode === "STATIC_HLS" && !(await snapshotRadioReleaseDelivery(client, releaseId))) {
      throw new HttpError(409, "The Radio release is missing prepared broadcast audio.", "RADIO_DELIVERY_NOT_READY");
    }

    const firstWeek = localServiceWeekMonday(now, station.time_zone);
    const nextWeekDate = new Date(`${firstWeek}T12:00:00.000Z`);
    nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);
    const weeks = [firstWeek, nextWeekDate.toISOString().slice(0, 10)];
    const compilerBlocks: WeeklyClockBlock[] = releaseBlocks.map((block) => ({
      id: block.releaseBlockId,
      startMinute: block.start_minute,
      items: block.items.map((item) => ({ id: item.releaseItemId, durationMs: Number(item.duration_ms) })),
    }));
    for (const week of weeks) {
      let timeline;
      try {
        timeline = compileWeeklyClock({ timeZone: station.time_zone, serviceWeek: week, blocks: compilerBlocks });
      } catch (error) {
        if (error instanceof Error && error.message.includes("row limit")) {
          throw new HttpError(409, "This clock changes tracks too frequently. Add longer programming or fewer short repeated items.", "CLOCK_TOO_DENSE");
        }
        throw error;
      }
      await insertTimelineRows(client, releaseId, week, timeline);
      if (station.radio_delivery_mode === "STATIC_HLS" && !(await insertRadioTimelineDelivery(client, releaseId, week))) {
        throw new HttpError(409, "The Radio release timeline could not be prepared for delivery.", "RADIO_DELIVERY_NOT_READY");
      }
    }
    await client.query(
      `UPDATE stations SET previous_clock_release_id = active_clock_release_id,
              active_clock_release_id = $1, radio_release_changed_at = now(), updated_at = now()
        WHERE id = $2`,
      [releaseId, stationId],
    );
    return { releaseId, releaseNumber, sourceDraftVersion: expectedDraftVersion, timeZone: station.time_zone, compiledWeeks: weeks };
  });
  await publishStationEvent(stationId, { type: "station.updated", data: { schedule: true } });
  return result;
}
