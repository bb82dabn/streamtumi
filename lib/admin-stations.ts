import type { PoolClient } from "pg";
import type { AuthUser, UserRole } from "@/lib/auth";
import type { AdminAuditEntry, AdminStationFeaturedMutation } from "@/lib/admin-dashboard";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";

type ActiveAdminRow = {
  id: string;
  display_name: string;
  role: UserRole;
  disabled_at: Date | null;
  must_change_password: boolean;
  deletion_requested_at: Date | null;
  anonymized_at: Date | null;
};

type FeaturedStationRow = {
  id: string;
  name: string;
  is_featured: boolean;
  updated_at: Date;
};

type AuditRow = {
  id: string;
  actor_name: string;
  target_label: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type StationFeaturedMutationResult = {
  station: AdminStationFeaturedMutation;
  audit: AdminAuditEntry | null;
};

function presentStation(row: FeaturedStationRow): AdminStationFeaturedMutation {
  return {
    id: row.id,
    name: row.name,
    isFeatured: row.is_featured,
    updatedAt: row.updated_at.toISOString(),
  };
}

function presentAudit(row: AuditRow): AdminAuditEntry {
  return {
    id: row.id,
    actorName: row.actor_name,
    targetLabel: row.target_label,
    action: row.action,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

async function writeAudit(
  client: PoolClient,
  actor: ActiveAdminRow,
  station: FeaturedStationRow,
  featured: boolean,
): Promise<AdminAuditEntry> {
  const result = await client.query<AuditRow>(
    `INSERT INTO admin_audit_log
       (actor_user_id, actor_name, target_station_id, target_label, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, actor_name, target_label, action, metadata, created_at`,
    [
      actor.id,
      actor.display_name,
      station.id,
      station.name,
      featured ? "STATION_FEATURED_ENABLED" : "STATION_FEATURED_DISABLED",
      { from: station.is_featured, to: featured },
    ],
  );
  return presentAudit(result.rows[0]);
}

export async function setStationFeatured(
  stationId: string,
  featured: boolean,
  actorIdentity: AuthUser,
): Promise<StationFeaturedMutationResult> {
  return transaction(async (client) => {
    const actorResult = await client.query<ActiveAdminRow>(
      `SELECT id, display_name, role, disabled_at, must_change_password,
              deletion_requested_at, anonymized_at
         FROM users WHERE id = $1 FOR UPDATE`,
      [actorIdentity.id],
    );
    const actor = actorResult.rows[0];
    if (!actor || actor.role !== "ADMIN" || actor.disabled_at || actor.must_change_password || actor.deletion_requested_at || actor.anonymized_at) {
      throw new HttpError(403, "Your administrator access is no longer active.", "ADMIN_ACCESS_REVOKED");
    }

    const stationResult = await client.query<FeaturedStationRow>(
      `SELECT id, name, is_featured, updated_at
         FROM stations WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [stationId],
    );
    const station = stationResult.rows[0];
    if (!station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    if (station.is_featured === featured) return { station: presentStation(station), audit: null };

    const updateResult = await client.query<FeaturedStationRow>(
      `UPDATE stations SET is_featured = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name, is_featured, updated_at`,
      [station.id, featured],
    );
    const updated = updateResult.rows[0];
    if (!updated) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    const audit = await writeAudit(client, actor, station, featured);
    return { station: presentStation(updated), audit };
  });
}
