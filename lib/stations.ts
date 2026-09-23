import { decryptSecret, encryptSecret, hashToken, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { promoteDueStation } from "@/lib/schedule-publication";
import type { PlaybackOrder } from "@/lib/schedule";
import { stationViewerPath, type ProgrammingMode, type StationKind } from "@/lib/station-kind";

export function newAccessToken(): { token: string; hash: string; ciphertext: string; hint: string } {
  const token = randomToken();
  return { token, hash: hashToken(token), ciphertext: encryptSecret(token), hint: token.slice(-6) };
}

export function viewerUrl(ciphertext: string, stationKind: StationKind = "TV"): string {
  return `${env().APP_URL.replace(/\/$/, "")}${stationViewerPath(stationKind, decryptSecret(ciphertext))}`;
}

export type StationSummary = {
  id: string;
  station_kind: StationKind;
  programming_mode: ProgrammingMode;
  time_zone: string;
  name: string;
  description: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  access_enabled: boolean;
  access_expires_at: Date | null;
  access_password_hash: string | null;
  access_token_ciphertext: string;
  transition_ms: number;
  playback_order: PlaybackOrder;
  auto_publish_next_loop: boolean;
  logo_key: string | null;
  offline_slate_key: string | null;
  created_at: Date;
  updated_at: Date;
  video_count: string;
  ready_count: string;
  storage_bytes: string;
  playlist_count: string;
  active_schedule_id: string | null;
  pending_schedule_id: string | null;
  pending_activation_at: Date | null;
  broadcast_state: "RUNNING" | "STOPPED";
  stopped_at: Date | null;
  paused_schedule_id: string | null;
  paused_cycle_offset_ms: string | null;
  paused_cycle_number: string | null;
  deleted_at: Date | null;
  purge_after: Date | null;
  moderation_status: "ACTIVE" | "RESTRICTED";
  legal_hold_at: Date | null;
  visibility: "PRIVATE" | "PUBLIC";
  genre_id: string;
  owner_declared_explicit: boolean;
  explicit_enforced_at: Date | null;
  explicit_enforcement_note: string | null;
};

export async function stationForOwner(stationId: string, ownerId: string): Promise<StationSummary | null> {
  await promoteDueStation(stationId);
  const result = await query<StationSummary>(
    `SELECT s.*,
            (SELECT count(*)::text FROM videos v WHERE v.station_id = s.id) AS video_count,
            (SELECT count(*)::text FROM videos v WHERE v.station_id = s.id AND v.status = 'READY') AS ready_count,
            (SELECT quota_bytes::text FROM station_media_storage_usage_v WHERE station_id = s.id) AS storage_bytes,
            (SELECT count(*)::text FROM playlist_items p WHERE p.station_id = s.id) AS playlist_count
       FROM stations s
      WHERE s.id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL
        AND COALESCE(s.playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')`,
    [stationId, ownerId],
  );
  return result.rows[0] ?? null;
}
