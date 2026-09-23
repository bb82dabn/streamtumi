import type { PoolClient } from "pg";

export async function snapshotRadioReleaseDelivery(client: PoolClient, releaseId: string): Promise<boolean> {
  await client.query(
    `INSERT INTO radio_release_item_delivery (release_item_id, audio_hls_key, segment_duration_ms)
     SELECT item.id, track.audio_hls_key, track.audio_hls_segment_ms
       FROM clock_release_items item
       JOIN clock_release_blocks block ON block.id = item.release_block_id
       JOIN radio_tracks track ON track.id = item.radio_track_id
      WHERE block.release_id = $1 AND item.media_kind = 'RADIO_TRACK' AND track.audio_hls_key IS NOT NULL
     ON CONFLICT (release_item_id) DO NOTHING`,
    [releaseId],
  );
  const missing = await client.query(
    `SELECT 1 FROM clock_release_items item
      JOIN clock_release_blocks block ON block.id = item.release_block_id
      LEFT JOIN radio_release_item_delivery delivery ON delivery.release_item_id = item.id
     WHERE block.release_id = $1 AND item.media_kind = 'RADIO_TRACK' AND delivery.release_item_id IS NULL
     LIMIT 1`,
    [releaseId],
  );
  return !missing.rowCount;
}

export async function insertRadioTimelineDelivery(client: PoolClient, releaseId: string, serviceWeek: string): Promise<boolean> {
  const timelineCount = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM clock_timeline_items WHERE release_id = $1 AND service_week = $2::date",
    [releaseId, serviceWeek],
  );
  const deliveryCount = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM radio_timeline_delivery WHERE release_id = $1 AND service_week = $2::date",
    [releaseId, serviceWeek],
  );
  if (Number(deliveryCount.rows[0]?.count ?? 0) === Number(timelineCount.rows[0]?.count ?? 0) && Number(timelineCount.rows[0]?.count ?? 0) > 0) return true;
  if (Number(deliveryCount.rows[0]?.count ?? 0) > 0) throw new Error("Radio timeline delivery is only partially populated.");
  const ready = await snapshotRadioReleaseDelivery(client, releaseId);
  if (!ready) return false;
  const baseResult = await client.query<{ sequence_base: string; discontinuity_base: string }>(
    `SELECT COALESCE(max(media_sequence_start + segment_count), 0)::text AS sequence_base,
            COALESCE(max(discontinuity_sequence) + 1, 0)::text AS discontinuity_base
       FROM radio_timeline_delivery WHERE release_id = $1`,
    [releaseId],
  );
  const inserted = await client.query(
    `WITH sliced AS (
       SELECT timeline.id, timeline.release_id, timeline.service_week, timeline.position,
              (timeline.source_offset_ms / delivery.segment_duration_ms)::int AS first_segment,
              (((timeline.source_offset_ms + timeline.playback_duration_ms + delivery.segment_duration_ms - 1) / delivery.segment_duration_ms)
                - (timeline.source_offset_ms / delivery.segment_duration_ms))::int AS segment_count
         FROM clock_timeline_items timeline
         JOIN radio_release_item_delivery delivery ON delivery.release_item_id = timeline.release_item_id
        WHERE timeline.release_id = $1 AND timeline.service_week = $2::date
     ), sequenced AS (
       SELECT sliced.*,
              $3::bigint + COALESCE(sum(segment_count) OVER (
                ORDER BY position ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ), 0)::bigint AS media_sequence_start,
              $4::bigint + row_number() OVER (ORDER BY position) - 1 AS discontinuity_sequence
         FROM sliced
     )
     INSERT INTO radio_timeline_delivery
       (timeline_item_id, release_id, service_week, media_sequence_start, discontinuity_sequence, first_segment, segment_count)
     SELECT id, release_id, service_week, media_sequence_start, discontinuity_sequence, first_segment, segment_count
       FROM sequenced ORDER BY position
     ON CONFLICT (timeline_item_id) DO NOTHING`,
    [releaseId, serviceWeek, baseResult.rows[0]?.sequence_base ?? "0", baseResult.rows[0]?.discontinuity_base ?? "0"],
  );
  return Number(inserted.rowCount ?? 0) === Number(timelineCount.rows[0]?.count ?? 0);
}
