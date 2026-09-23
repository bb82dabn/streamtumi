import path from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import { bucket, storage } from "@/lib/storage";
import { parseRadioVodPlaylist, virtualRadioPlaylist, type RadioVodSegment, type VirtualRadioSegment } from "@/lib/radio-hls";

const DELIVERY_WINDOW_MS = 60_000;
const playlistCache = new Map<string, Promise<RadioVodSegment[]>>();

type TimelineDeliveryRow = {
  id: string;
  starts_at: Date;
  ends_at: Date;
  source_offset_ms: string;
  audio_hls_key: string;
  segment_duration_ms: number;
  target_duration_seconds: number;
  media_sequence_start: string;
  discontinuity_sequence: string;
  first_segment: number;
  segment_count: number;
};

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
};

async function objectText(key: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const value of await storage.getObject(bucket, key)) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  return Buffer.concat(chunks).toString("utf8");
}

async function vodSegments(key: string): Promise<RadioVodSegment[]> {
  let pending = playlistCache.get(key);
  if (!pending) {
    pending = objectText(key).then(parseRadioVodPlaylist).catch((error) => {
      playlistCache.delete(key);
      throw error;
    });
    playlistCache.set(key, pending);
    if (playlistCache.size > 50) playlistCache.delete(playlistCache.keys().next().value as string);
  }
  return pending;
}

export async function buildVirtualRadioManifest(
  client: Queryable,
  releaseId: string,
  token: string,
  now = new Date(),
): Promise<string> {
  const rows = await client.query<TimelineDeliveryRow>(
    `SELECT timeline.id, timeline.starts_at, timeline.ends_at, timeline.source_offset_ms::text,
            item_delivery.audio_hls_key, item_delivery.segment_duration_ms,
            (SELECT ceil(max(release_delivery.segment_duration_ms) / 1000.0)::int + 1
               FROM radio_release_item_delivery release_delivery
               JOIN clock_release_items release_item ON release_item.id = release_delivery.release_item_id
               JOIN clock_release_blocks release_block ON release_block.id = release_item.release_block_id
              WHERE release_block.release_id = timeline.release_id) AS target_duration_seconds,
            timeline_delivery.media_sequence_start::text, timeline_delivery.discontinuity_sequence::text, timeline_delivery.first_segment,
            timeline_delivery.segment_count
       FROM clock_timeline_items timeline
       JOIN radio_timeline_delivery timeline_delivery ON timeline_delivery.timeline_item_id = timeline.id
       JOIN radio_release_item_delivery item_delivery ON item_delivery.release_item_id = timeline.release_item_id
      WHERE timeline.release_id = $1
        AND timeline.ends_at > $2
        AND timeline.starts_at <= $3
      ORDER BY timeline.starts_at`,
    [releaseId, new Date(now.getTime() - DELIVERY_WINDOW_MS), now],
  );
  const output: VirtualRadioSegment[] = [];
  const nowMs = now.getTime();
  let discontinuitySequence = 0;
  let targetDuration = 1;
  for (const row of rows.rows) {
    const source = await vodSegments(row.audio_hls_key);
    const sequenceStart = Number(row.media_sequence_start);
    const sourceOffsetMs = Number(row.source_offset_ms);
    const segmentStartsMs: number[] = [];
    let sourceCursorMs = 0;
    for (const segment of source) {
      segmentStartsMs.push(sourceCursorMs);
      sourceCursorMs += segment.durationSeconds * 1000;
    }
    targetDuration = Math.max(targetDuration, row.target_duration_seconds);
    for (let localIndex = 0; localIndex < row.segment_count; localIndex += 1) {
      const segmentIndex = row.first_segment + localIndex;
      const segment = source[segmentIndex];
      if (!segment) throw new Error(`Radio artifact ${row.audio_hls_key} is missing segment ${segmentIndex}.`);
      const scheduledAt = row.starts_at.getTime() + segmentStartsMs[segmentIndex] - sourceOffsetMs;
      const scheduledEnd = scheduledAt + segment.durationSeconds * 1000;
      if (scheduledEnd <= nowMs - DELIVERY_WINDOW_MS || scheduledAt > nowMs) continue;
      const startsTimelineItem = segmentIndex === row.first_segment;
      const discontinuity = output.length > 0 && output[output.length - 1].uri.split("/")[1] !== row.id;
      if (!output.length) discontinuitySequence = Number(row.discontinuity_sequence) - (startsTimelineItem && Number(row.discontinuity_sequence) > 0 ? 1 : 0);
      output.push({
        ...segment,
        mediaSequence: sequenceStart + localIndex,
        programDateTime: new Date(scheduledAt),
        uri: `items/${row.id}/${segment.name}`,
        discontinuity: discontinuity || (!output.length && startsTimelineItem && Number(row.discontinuity_sequence) > 0),
      });
    }
  }
  if (!output.length) throw new Error(`Radio release ${releaseId} has no deliverable segments for ${token}.`);
  return virtualRadioPlaylist(output, { targetDuration, discontinuitySequence });
}

export function radioSegmentKey(audioHlsKey: string, segmentName: string): string {
  if (!/^segment_\d{10}\.ts$/.test(segmentName)) throw new Error("Invalid Radio segment name.");
  return path.posix.join(path.posix.dirname(audioHlsKey), segmentName);
}
