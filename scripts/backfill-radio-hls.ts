import { db, query, transaction } from "@/lib/db";
import { getRadioPrepQueue } from "@/lib/queue";
import { insertRadioTimelineDelivery, snapshotRadioReleaseDelivery } from "@/lib/radio-delivery-publication";
import { ensureClockTimeline } from "@/lib/clock-timeline";

async function queueMissingArtifacts(): Promise<number> {
  const tracks = await query<{ id: string }>(
    `SELECT track.id FROM radio_tracks track JOIN stations station ON station.id = track.station_id
      WHERE track.status IN ('READY', 'ARCHIVED') AND track.mezzanine_key IS NOT NULL AND track.audio_hls_key IS NULL
        AND station.deleted_at IS NULL
        AND (track.status = 'READY' OR EXISTS (
          SELECT 1 FROM clock_release_items item
          JOIN clock_release_blocks block ON block.id = item.release_block_id
          JOIN stations active_station ON active_station.active_clock_release_id = block.release_id
          WHERE item.radio_track_id = track.id AND active_station.id = track.station_id
        ))
      ORDER BY track.created_at`,
  );
  const queue = getRadioPrepQueue();
  let queued = 0;
  for (const track of tracks.rows) {
    const jobId = `radio-hls-${track.id}`;
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "completed" || state === "failed") await existing.remove();
      else continue;
    }
    await queue.add("backfill-radio-hls", { trackId: track.id, kind: "BACKFILL_HLS" }, { jobId });
    queued += 1;
  }
  await queue.close();
  return queued;
}

async function activateReadyStations(): Promise<number> {
  const stations = await query<{ id: string; release_id: string }>(
    `SELECT station.id, station.active_clock_release_id AS release_id
       FROM stations station
      WHERE station.station_kind = 'RADIO' AND station.radio_delivery_mode = 'PLAYOUT'
        AND station.active_clock_release_id IS NOT NULL AND station.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM clock_release_items item
          JOIN clock_release_blocks block ON block.id = item.release_block_id
          JOIN radio_tracks track ON track.id = item.radio_track_id
          WHERE block.release_id = station.active_clock_release_id
            AND item.media_kind = 'RADIO_TRACK' AND track.audio_hls_key IS NULL
        )
      ORDER BY station.created_at`,
  );
  let activated = 0;
  for (const station of stations.rows) {
    const preparedWeeks = await ensureClockTimeline(station.release_id, new Date(Date.now() - 7 * 86_400_000), 4);
    let prepared = true;
    for (const week of preparedWeeks) {
      const weekReady = await transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`radio-delivery:${station.release_id}:${week}`]);
        return snapshotRadioReleaseDelivery(client, station.release_id)
          .then((ready) => ready ? insertRadioTimelineDelivery(client, station.release_id, week) : false);
      });
      if (!weekReady) { prepared = false; break; }
    }
    if (!prepared) continue;
    const changed = await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`radio-delivery:${station.id}`]);
      const current = await client.query(
        `SELECT 1 FROM clock_timeline_items timeline
          JOIN radio_timeline_delivery delivery ON delivery.timeline_item_id = timeline.id
         WHERE timeline.release_id = $1 AND timeline.starts_at <= clock_timestamp() AND timeline.ends_at > clock_timestamp()
         LIMIT 1`,
        [station.release_id],
      );
      if (!current.rowCount) return false;
      const result = await client.query(
        `UPDATE stations SET radio_delivery_mode = 'STATIC_HLS', updated_at = now()
          WHERE id = $1 AND active_clock_release_id = $2 AND radio_delivery_mode = 'PLAYOUT'`,
        [station.id, station.release_id],
      );
      return Boolean(result.rowCount);
    });
    if (changed) activated += 1;
  }
  return activated;
}

async function main() {
  if (process.argv.includes("--activate-ready")) {
    const activated = await activateReadyStations();
    console.info(`Activated static HLS delivery for ${activated} Radio station(s).`);
  } else {
    const queued = await queueMissingArtifacts();
    console.info(`Queued ${queued} Radio track HLS backfill job(s).`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
