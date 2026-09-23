import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import type { CalendarRuntimeSourceRole } from "@/lib/calendar-runtime";

export type RadioLease = { stationId: string; holderId: string; fence: number; leaseUntil: Date };
export type RadioSession = { id: string; stationId: string; fence: number; objectPrefix: string; audioManifestKey: string; waveformManifestKey: string };

export async function acquireRadioLease(stationId: string, holderId: string, leaseSeconds: number): Promise<RadioLease | null> {
  const result = await query<{ station_id: string; holder_id: string; fence: string; lease_until: Date }>(
    `INSERT INTO radio_playout_leases (station_id, holder_id, fence, lease_until)
     VALUES ($1, $2, 1, clock_timestamp() + ($3 * interval '1 second'))
     ON CONFLICT (station_id) DO UPDATE
       SET holder_id = EXCLUDED.holder_id,
           fence = CASE WHEN radio_playout_leases.holder_id = EXCLUDED.holder_id THEN radio_playout_leases.fence ELSE radio_playout_leases.fence + 1 END,
           lease_until = clock_timestamp() + ($3 * interval '1 second'),
           updated_at = now()
       WHERE radio_playout_leases.lease_until <= clock_timestamp()
          OR radio_playout_leases.holder_id = EXCLUDED.holder_id
     RETURNING station_id, holder_id, fence::text, lease_until`,
    [stationId, holderId, leaseSeconds],
  );
  const row = result.rows[0];
  return row ? { stationId: row.station_id, holderId: row.holder_id, fence: Number(row.fence), leaseUntil: row.lease_until } : null;
}

export async function renewRadioLease(lease: RadioLease, leaseSeconds: number): Promise<RadioLease | null> {
  const result = await query<{ lease_until: Date }>(
    `UPDATE radio_playout_leases
        SET lease_until = clock_timestamp() + ($4 * interval '1 second'), updated_at = now()
      WHERE station_id = $1 AND holder_id = $2 AND fence = $3
        AND lease_until > clock_timestamp()
      RETURNING lease_until`,
    [lease.stationId, lease.holderId, lease.fence, leaseSeconds],
  );
  return result.rows[0] ? { ...lease, leaseUntil: result.rows[0].lease_until } : null;
}

export async function releaseRadioLease(lease: RadioLease): Promise<void> {
  await query(
    `UPDATE radio_playout_leases SET lease_until = clock_timestamp(), updated_at = now()
      WHERE station_id = $1 AND holder_id = $2 AND fence = $3`,
    [lease.stationId, lease.holderId, lease.fence],
  );
}

export async function createRadioSession(lease: RadioLease, releaseId: string | null): Promise<RadioSession> {
  const sessionId = randomUUID();
  const objectPrefix = `stations/${lease.stationId}/radio/playout/${lease.fence}-${sessionId}`;
  return transaction(async (client) => {
    const valid = await client.query(
      `SELECT 1 FROM radio_playout_leases l JOIN stations s ON s.id = l.station_id
       WHERE l.station_id = $1 AND l.holder_id = $2 AND l.fence = $3
          AND l.lease_until > clock_timestamp() AND s.broadcast_state = 'RUNNING'
          AND $4::uuid IS NOT NULL AND s.active_clock_release_id = $4
        FOR UPDATE OF l, s`,
      [lease.stationId, lease.holderId, lease.fence, releaseId],
    );
    if (!valid.rowCount) throw new Error("Radio playout lease or desired state changed before session creation.");
    await client.query("UPDATE radio_playout_sessions SET status = 'RETIRED', retired_at = now() WHERE station_id = $1 AND status IN ('STARTING', 'ACTIVE')", [lease.stationId]);
    await client.query(
      `INSERT INTO radio_playout_sessions
       (id, station_id, lease_fence, object_prefix, audio_manifest_key, waveform_manifest_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, lease.stationId, lease.fence, objectPrefix, `${objectPrefix}/audio/index.m3u8`, `${objectPrefix}/waveform/index.m3u8`],
    );
    await client.query(
       `INSERT INTO radio_playout_state
         (station_id, status, lease_fence, active_session_id, current_release_id, program_source,
          calendar_release_id, occurrence_id, source_role, current_calendar_item_id,
          source_changed_at, heartbeat_at, started_at, stopped_at, last_error, updated_at)
         VALUES ($1, 'STARTING', $2, NULL, $3, 'CLOCK',
                 NULL, NULL, NULL, NULL, now(), now(), now(), NULL, NULL, now())
         ON CONFLICT (station_id) DO UPDATE SET status = 'STARTING', lease_fence = EXCLUDED.lease_fence,
           active_session_id = NULL, current_release_id = EXCLUDED.current_release_id,
           program_source = EXCLUDED.program_source, source_changed_at = now(),
           calendar_release_id = NULL, occurrence_id = NULL, source_role = NULL,
           current_timeline_item_id = NULL, current_calendar_item_id = NULL,
           heartbeat_at = now(), started_at = now(), stopped_at = NULL,
          last_error = NULL, restart_count = radio_playout_state.restart_count + 1, updated_at = now()`,
      [lease.stationId, lease.fence, releaseId],
    );
    return { id: sessionId, stationId: lease.stationId, fence: lease.fence, objectPrefix, audioManifestKey: `${objectPrefix}/audio/index.m3u8`, waveformManifestKey: `${objectPrefix}/waveform/index.m3u8` };
  });
}

export async function activateRadioSession(lease: RadioLease, session: RadioSession): Promise<boolean> {
  return transaction(async (client) => {
    const sessionUpdate = await client.query(
      `UPDATE radio_playout_sessions p SET status = 'ACTIVE', published_at = COALESCE(published_at, now())
        FROM radio_playout_leases l
       WHERE p.id = $1 AND p.station_id = l.station_id AND p.lease_fence = l.fence
         AND l.holder_id = $2 AND l.fence = $3 AND l.lease_until > clock_timestamp()
       RETURNING p.id`,
      [session.id, lease.holderId, lease.fence],
    );
    if (!sessionUpdate.rowCount) return false;
    const state = await client.query(
      `UPDATE radio_playout_state SET status = 'RUNNING', active_session_id = $1,
              audio_manifest_at = now(), waveform_manifest_at = now(), heartbeat_at = now(), updated_at = now()
        WHERE station_id = $2 AND lease_fence = $3`,
      [session.id, lease.stationId, lease.fence],
    );
    return Boolean(state.rowCount);
  });
}

export async function updateRadioPlayoutState(lease: RadioLease, input: {
  status?: "STARTING" | "RUNNING" | "DEGRADED";
  timelineItemId?: string | null;
  releaseId?: string | null;
  sourcePositionMs?: number | null;
  calendarReleaseId?: string | null;
  occurrenceId?: string | null;
  sourceRole?: CalendarRuntimeSourceRole | null;
  calendarItemId?: string | null;
  error?: string | null;
}): Promise<boolean> {
  const has = (key: keyof typeof input) => Object.prototype.hasOwnProperty.call(input, key);
  const result = await query(
    `UPDATE radio_playout_state s
         SET status = COALESCE($4::radio_playout_status, s.status),
             current_timeline_item_id = CASE WHEN $5::boolean THEN $6::uuid ELSE s.current_timeline_item_id END,
             current_release_id = CASE WHEN $7::boolean THEN $8::uuid ELSE s.current_release_id END,
             source_position_ms = CASE WHEN $9::boolean THEN $10::bigint ELSE s.source_position_ms END,
             calendar_release_id = CASE WHEN $11::boolean THEN $12::uuid ELSE s.calendar_release_id END,
             occurrence_id = CASE WHEN $13::boolean THEN $14::uuid ELSE s.occurrence_id END,
             source_role = CASE WHEN $15::boolean THEN $16::calendar_source_role ELSE s.source_role END,
             current_calendar_item_id = CASE WHEN $17::boolean THEN $18::uuid ELSE s.current_calendar_item_id END,
             last_error = $19, last_error_at = CASE WHEN $19::text IS NULL THEN s.last_error_at ELSE now() END,
             heartbeat_at = now(), updated_at = now()
        FROM radio_playout_leases l
       WHERE s.station_id = $1 AND l.station_id = s.station_id
         AND l.holder_id = $2 AND l.fence = $3 AND s.lease_fence = l.fence
         AND l.lease_until > clock_timestamp()`,
    [lease.stationId, lease.holderId, lease.fence, input.status ?? null,
      has("timelineItemId"), input.timelineItemId ?? null,
      has("releaseId"), input.releaseId ?? null,
      has("sourcePositionMs"), input.sourcePositionMs ?? null,
      has("calendarReleaseId"), input.calendarReleaseId ?? null,
      has("occurrenceId"), input.occurrenceId ?? null,
      has("sourceRole"), input.sourceRole ?? null,
      has("calendarItemId"), input.calendarItemId ?? null,
      input.error ?? null],
  );
  return Boolean(result.rowCount);
}

export async function touchRadioManifest(lease: RadioLease, output: "audio" | "waveform"): Promise<boolean> {
  const result = await query(
    `UPDATE radio_playout_state state
        SET audio_manifest_at = CASE WHEN $4 = 'audio' THEN now() ELSE state.audio_manifest_at END,
            waveform_manifest_at = CASE WHEN $4 = 'waveform' THEN now() ELSE state.waveform_manifest_at END,
            heartbeat_at = now(), updated_at = now()
       FROM radio_playout_leases lease
      WHERE state.station_id = $1 AND lease.station_id = state.station_id
        AND lease.holder_id = $2 AND lease.fence = $3 AND state.lease_fence = lease.fence
        AND lease.lease_until > clock_timestamp()`,
    [lease.stationId, lease.holderId, lease.fence, output],
  );
  return Boolean(result.rowCount);
}

export async function failRadioSession(lease: RadioLease, sessionId: string, message: string): Promise<void> {
  await transaction(async (client) => {
    await client.query("UPDATE radio_playout_sessions SET status = 'FAILED', retired_at = now() WHERE id = $1 AND station_id = $2 AND lease_fence = $3", [sessionId, lease.stationId, lease.fence]);
    await client.query("UPDATE radio_playout_state SET status = 'FAILED', active_session_id = NULL, last_error = $1, last_error_at = now(), heartbeat_at = now(), updated_at = now() WHERE station_id = $2 AND lease_fence = $3", [message.slice(0, 1000), lease.stationId, lease.fence]);
  });
}

export async function retireRadioSession(lease: RadioLease, sessionId: string): Promise<void> {
  await transaction(async (client) => {
    await client.query("UPDATE radio_playout_sessions SET status = 'RETIRED', retired_at = now() WHERE id = $1 AND station_id = $2 AND lease_fence = $3 AND status IN ('STARTING', 'ACTIVE')", [sessionId, lease.stationId, lease.fence]);
    await client.query("UPDATE radio_playout_state SET status = 'OFFLINE', active_session_id = NULL, stopped_at = now(), heartbeat_at = now(), updated_at = now() WHERE station_id = $1 AND lease_fence = $2", [lease.stationId, lease.fence]);
  });
}

export async function markRadioOffline(stationId: string, fence?: number): Promise<void> {
  await query(
    `UPDATE radio_playout_state SET status = 'OFFLINE', active_session_id = NULL, stopped_at = now(), heartbeat_at = now(), updated_at = now()
      WHERE station_id = $1 AND ($2::bigint IS NULL OR lease_fence = $2)`,
    [stationId, fence ?? null],
  );
}
