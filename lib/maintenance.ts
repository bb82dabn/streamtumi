import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { bucket, removePrefix, storage } from "@/lib/storage";
import { removeOrphanedAvatarObjects } from "@/lib/avatar-image";
import { anonymizeUserIfEligible } from "@/lib/admin-user-maintenance";
import { releaseInactiveVideoSource } from "@/lib/video-source-lifecycle";
import { ensureClockTimeline } from "@/lib/clock-timeline";
import { ensureCalendarReleaseMaterialized } from "@/lib/calendar-maintenance";
import { promoteDueCalendarRelease } from "@/lib/calendar-publication";

const maintenanceLockId = 7_155_204_284;

async function removeRetiredRadioPlayoutSession(
  client: PoolClient,
  session: { id: string; station_id: string; object_prefix: string },
): Promise<boolean> {
  await client.query("BEGIN");
  try {
    const locked = await client.query(
      `SELECT id FROM radio_playout_sessions playout
        WHERE playout.id = $1 AND playout.station_id = $2 AND playout.object_prefix = $3
          AND playout.status IN ('RETIRED', 'FAILED')
          AND playout.retired_at <= clock_timestamp() - interval '2 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM radio_playout_state state WHERE state.active_session_id = playout.id
          )
        FOR UPDATE`,
      [session.id, session.station_id, session.object_prefix],
    );
    if (!locked.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await removePrefix(session.object_prefix);
    await client.query("DELETE FROM radio_playout_sessions WHERE id = $1 AND station_id = $2", [session.id, session.station_id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function purgeStation(client: PoolClient, stationId: string): Promise<boolean> {
  await client.query("BEGIN");
  try {
    const locked = await client.query(
      `SELECT id FROM stations
        WHERE id = $1 AND deleted_at IS NOT NULL AND purge_after <= now() AND legal_hold_at IS NULL
        FOR UPDATE`,
      [stationId],
    );
    if (!locked.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `INSERT INTO media_gc_tasks (task_kind, storage_authority, object_key, reason)
       VALUES ('DELETE_PREFIX', 'CANONICAL', $1, 'purged station objects')
       ON CONFLICT (storage_authority, object_key) DO UPDATE
         SET status = 'PENDING', not_before = now(), attempt_count = 0,
             completed_at = NULL, last_error = NULL, updated_at = now()`,
      [`stations/${stationId}/`],
    );
    await client.query("UPDATE stations SET active_schedule_id = NULL, pending_schedule_id = NULL, paused_schedule_id = NULL, active_clock_release_id = NULL WHERE id = $1", [stationId]);
    await client.query("SELECT public.purge_tv_station_runtime($1)", [stationId]);
    await client.query("DELETE FROM radio_playout_state WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM radio_playout_sessions WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM radio_playout_leases WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM clock_timeline_items WHERE release_id IN (SELECT id FROM clock_releases WHERE station_id = $1)", [stationId]);
    await client.query("DELETE FROM clock_release_items WHERE release_block_id IN (SELECT b.id FROM clock_release_blocks b JOIN clock_releases r ON r.id = b.release_id WHERE r.station_id = $1)", [stationId]);
    await client.query("DELETE FROM clock_release_blocks WHERE release_id IN (SELECT id FROM clock_releases WHERE station_id = $1)", [stationId]);
    await client.query("DELETE FROM clock_releases WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM clock_draft_blocks WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM radio_rotation_items WHERE rotation_id IN (SELECT id FROM radio_rotations WHERE station_id = $1)", [stationId]);
    await client.query("DELETE FROM radio_rotations WHERE station_id = $1", [stationId]);
    await client.query(
      `UPDATE media_asset_variants variant
          SET status = 'DELETED', deleted_at = now(), updated_at = now()
        WHERE variant.media_asset_id IN (
          SELECT media_asset_id FROM radio_tracks WHERE station_id = $1 AND media_asset_id IS NOT NULL
          UNION
          SELECT media_asset_id FROM videos WHERE station_id = $1 AND media_asset_id IS NOT NULL
        ) AND variant.storage_authority IN ('LEGACY_VIDEO', 'LEGACY_RADIO_TRACK')
          AND variant.status <> 'DELETED'`,
      [stationId],
    );
    await client.query(
      `UPDATE media_assets asset
          SET status = 'DELETED', quota_bytes = 0, deleted_at = now(), updated_at = now()
        WHERE asset.id IN (
          SELECT media_asset_id FROM radio_tracks WHERE station_id = $1 AND media_asset_id IS NOT NULL
          UNION
          SELECT media_asset_id FROM videos WHERE station_id = $1 AND media_asset_id IS NOT NULL
        ) AND asset.storage_authority IN ('LEGACY_VIDEO', 'LEGACY_RADIO_TRACK')`,
      [stationId],
    );
    await client.query("DELETE FROM radio_tracks WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM schedule_items WHERE schedule_id IN (SELECT id FROM schedules WHERE station_id = $1)", [stationId]);
    await client.query("DELETE FROM schedules WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM playlist_items WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM videos WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM chat_messages WHERE station_id = $1", [stationId]);
    await client.query("DELETE FROM stations WHERE id = $1", [stationId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMaintenance(): Promise<void> {
  const client = await db.connect();
  try {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1) AS acquired", [maintenanceLockId]);
    if (!lock.rows[0]?.acquired) return;

    await client.query(
      `DELETE FROM chat_messages
        WHERE pinned_at IS NULL AND created_at < now() - ($1 * interval '1 day')`,
      [env().CHAT_RETENTION_DAYS],
    );
    await client.query("DELETE FROM chat_guests WHERE expires_at < now()");
    await client.query("DELETE FROM sessions WHERE expires_at < now()");
    await client.query(
      `DELETE FROM mobile_refresh_tokens
        WHERE expires_at < now() - interval '1 day'
           OR revoked_at < now() - interval '30 days'`,
    );
    await client.query(
      `DELETE FROM password_reset_tokens
        WHERE expires_at < now() - interval '1 day'
           OR consumed_at < now() - interval '1 day'
           OR invalidated_at < now() - interval '1 day'`,
    );
    await client.query("DELETE FROM station_tunes WHERE tuned_at < now() - interval '90 days'");
    await client.query("DELETE FROM weather_playback_sessions WHERE expires_at < now() - interval '1 day'");

    const expiredUploads = await client.query<{ id: string; media_asset_id: string; owner_id: string; object_key: string }>(
      `UPDATE media_upload_sessions upload SET status = 'EXPIRED', updated_at = now()
        FROM media_assets asset
       WHERE upload.media_asset_id = asset.id AND upload.status IN ('INITIATED', 'UPLOADING', 'COMPLETING')
         AND upload.expires_at <= now()
       RETURNING upload.id, upload.media_asset_id, asset.owner_id, upload.object_key`,
    );
    for (const upload of expiredUploads.rows) {
      await client.query("UPDATE media_assets SET status = 'ARCHIVED', archived_at = COALESCE(archived_at, now()), version = version + 1, updated_at = now() WHERE id = $1 AND status IN ('UPLOADING', 'PENDING_UPLOAD')", [upload.media_asset_id]);
      await client.query(
        `INSERT INTO media_gc_tasks (owner_id, media_asset_id, task_kind, storage_authority, object_key, reason)
         VALUES ($1, $2, 'DELETE_PREFIX', 'CANONICAL', $3, 'expired canonical upload')
         ON CONFLICT (storage_authority, object_key) DO NOTHING`,
        [upload.owner_id, upload.media_asset_id, upload.object_key],
      );
    }

    const gcTasks = await client.query<{ id: string; media_asset_id: string | null; task_kind: string; object_key: string; reason: string }>(
      `SELECT id, media_asset_id, task_kind, object_key, reason FROM media_gc_tasks
        WHERE status IN ('PENDING', 'FAILED') AND not_before <= now()
        ORDER BY not_before, created_at LIMIT 20`,
    );
    for (const task of gcTasks.rows) {
      try {
        if (task.task_kind === "DELETE_PREFIX") await removePrefix(task.object_key);
        else if (task.task_kind === "DELETE_OBJECT") await storage.removeObject(bucket, task.object_key);
        else throw new Error("Unsupported media cleanup task.");
        await client.query("UPDATE media_gc_tasks SET status = 'SUCCEEDED', attempt_count = attempt_count + 1, completed_at = now(), last_error = NULL, updated_at = now() WHERE id = $1", [task.id]);
        if (task.media_asset_id && (task.reason === "owner aborted canonical upload" || task.reason === "expired canonical upload")) {
          await client.query("UPDATE media_assets SET status = 'DELETED', quota_bytes = 0, deleted_at = now(), version = version + 1, updated_at = now() WHERE id = $1 AND status = 'ARCHIVED'", [task.media_asset_id]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 4000) : "Media cleanup failed";
        await client.query("UPDATE media_gc_tasks SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = $2, updated_at = now() WHERE id = $1", [task.id, message]);
      }
    }

    const journalRetention = await client.query<{ cutoff_at: Date; deleted_rows: string }>(
      `SELECT cutoff_at, deleted_rows::text
         FROM public.prune_tv_segment_journal($1)`,
      [env().TV_SEGMENT_JOURNAL_RETENTION_DAYS],
    );
    const journalPrune = journalRetention.rows[0];
    const deletedJournalRows = Number(journalPrune?.deleted_rows ?? 0);
    if (deletedJournalRows > 0 && journalPrune) {
      console.info(
        `Pruned ${deletedJournalRows} TV segment journal rows ending before ${journalPrune.cutoff_at.toISOString()} `
        + `(retention ${env().TV_SEGMENT_JOURNAL_RETENTION_DAYS} days)`,
      );
    }

    const retiredPlayoutSessions = await client.query<{ id: string; station_id: string; object_prefix: string }>(
      `SELECT playout.id, playout.station_id, playout.object_prefix
         FROM radio_playout_sessions playout
        WHERE playout.status IN ('RETIRED', 'FAILED')
          AND playout.retired_at <= clock_timestamp() - interval '2 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM radio_playout_state state WHERE state.active_session_id = playout.id
          )
        ORDER BY playout.retired_at LIMIT 20`,
    );
    for (const session of retiredPlayoutSessions.rows) {
      try {
        if (await removeRetiredRadioPlayoutSession(client, session)) console.info(`Removed retired Radio playout session ${session.id}`);
      } catch (error) {
        console.error(`Could not remove retired Radio playout session ${session.id}:`, error instanceof Error ? error.message : "Playout cleanup failed");
      }
    }

    const calendarReleases = await client.query<{ id: string }>(
      `SELECT DISTINCT release.id
         FROM stations station
         JOIN calendar_releases release
           ON release.station_id = station.id
          AND (release.id = station.active_calendar_release_id
            OR release.id = station.pending_calendar_release_id)
         LEFT JOIN calendar_release_materialization_state state
           ON state.station_id = release.station_id AND state.release_id = release.id
        WHERE station.deleted_at IS NULL
          AND (state.release_id IS NULL OR state.status <> 'READY'
            OR state.horizon_from IS NULL OR state.materialized_through IS NULL
            OR state.materialized_through < clock_timestamp() + interval '30 days')
        ORDER BY release.id`,
    );
    for (const release of calendarReleases.rows) {
      try {
        await ensureCalendarReleaseMaterialized(release.id);
      } catch (error) {
        console.error(`Could not extend Calendar release ${release.id}:`, error instanceof Error ? error.message : "Calendar materialization failed");
      }
    }

    const dueCalendarStations = await client.query<{ id: string }>(
      `SELECT id FROM stations
        WHERE deleted_at IS NULL AND pending_calendar_release_id IS NOT NULL
          AND pending_calendar_activation_at IS NOT NULL
          AND pending_calendar_activation_at <= clock_timestamp()
        ORDER BY pending_calendar_activation_at, id`,
    );
    for (const station of dueCalendarStations.rows) {
      try {
        if (await promoteDueCalendarRelease(station.id)) console.info(`Promoted pending Calendar release for station ${station.id}`);
      } catch (error) {
        console.error(`Could not promote pending Calendar release for station ${station.id}:`, error instanceof Error ? error.message : "Calendar promotion failed");
      }
    }

    const staticReleases = await client.query<{ active_clock_release_id: string }>(
      `SELECT station.active_clock_release_id
         FROM stations station
         JOIN station_programming_profiles profile
           ON profile.station_id = station.id
          AND profile.id = station.active_programming_profile_id
        WHERE station.station_kind = 'RADIO'
          AND (station.radio_delivery_mode = 'STATIC_HLS'
            OR profile.strategy = 'CALENDAR_EVENTS')
          AND station.active_clock_release_id IS NOT NULL
          AND station.deleted_at IS NULL`,
    );
    for (const station of staticReleases.rows) {
      try {
        await ensureClockTimeline(station.active_clock_release_id);
      } catch (error) {
        console.error(`Could not extend static Radio release ${station.active_clock_release_id}:`, error instanceof Error ? error.message : "Timeline extension failed");
      }
    }
    await client.query(
      `DELETE FROM content_reports r
        WHERE r.status IN ('ACTIONED', 'DISMISSED')
          AND r.resolved_at < now() - ($1 * interval '1 day')
          AND NOT EXISTS (
            SELECT 1 FROM stations s WHERE s.id = r.station_id AND s.legal_hold_at IS NOT NULL
          )`,
      [env().REPORT_RETENTION_DAYS],
    );

    const inactiveVideos = await client.query<{ id: string }>(
      `SELECT v.id FROM videos v JOIN stations s ON s.id = v.station_id
        WHERE v.status IN ('ARCHIVED', 'REPLACED') AND v.size_bytes > 0
          AND s.legal_hold_at IS NULL
        ORDER BY v.updated_at LIMIT 20`,
    );
    for (const video of inactiveVideos.rows) {
      try {
        if (await releaseInactiveVideoSource(video.id)) console.info(`Released inactive video source ${video.id}`);
      } catch (error) {
        console.error(`Could not release inactive video source ${video.id}:`, error instanceof Error ? error.message : "Source cleanup failed");
      }
    }

    const due = await client.query<{ id: string }>(
      `SELECT id FROM stations
        WHERE deleted_at IS NOT NULL AND purge_after <= now() AND legal_hold_at IS NULL
        ORDER BY purge_after LIMIT 20`,
    );
    for (const station of due.rows) {
      try {
        if (await purgeStation(client, station.id)) console.info(`Purged deleted station ${station.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Station purge failed";
        await client.query(
          "UPDATE stations SET purge_attempts = purge_attempts + 1, purge_error = $2, updated_at = now() WHERE id = $1",
          [station.id, message],
        );
        console.error(`Could not purge station ${station.id}:`, message);
      }
    }

    const usersDue = await client.query<{ id: string }>(
      `SELECT u.id FROM users u
        WHERE u.deletion_requested_at IS NOT NULL
          AND u.anonymize_after <= now()
          AND u.anonymized_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM stations s WHERE s.owner_id = u.id)
        ORDER BY u.anonymize_after LIMIT 20`,
    );
    for (const user of usersDue.rows) {
      try {
        if (await anonymizeUserIfEligible(client, user.id)) console.info(`Anonymized deleted user ${user.id}`);
      } catch (error) {
        console.error(`Could not anonymize deleted user ${user.id}:`, error instanceof Error ? error.message : "User anonymization failed");
      }
    }

    try {
      const revisions = await client.query<{ avatar_revision: string }>(
        `SELECT avatar_revision FROM users
          WHERE avatar_revision IS NOT NULL
            AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
      );
      const removed = await removeOrphanedAvatarObjects(new Set(revisions.rows.map((row) => row.avatar_revision)));
      if (removed) console.info(`Removed ${removed} orphaned avatar objects`);
    } catch (error) {
      console.error("Could not clean orphaned avatars:", error instanceof Error ? error.message : "Avatar cleanup failed");
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [maintenanceLockId]).catch(() => undefined);
    client.release();
  }
}
