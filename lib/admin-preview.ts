import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { HttpError } from "@/lib/http";

const previewGrantSeconds = 15 * 60;

function cookieName(stationId: string): string {
  return `cl_admin_preview_${stationId.replaceAll("-", "")}`;
}

function signature(userId: string, stationId: string, expiresAt: number): string {
  return createHmac("sha256", env().APP_SECRET)
    .update(`admin-preview:${userId}:${stationId}:${expiresAt}`)
    .digest("base64url");
}

export async function grantAdminPreview(userId: string, stationId: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + previewGrantSeconds;
  (await cookies()).set(cookieName(stationId), `${expiresAt}.${signature(userId, stationId, expiresAt)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: previewGrantSeconds,
  });
}

export async function hasAdminPreviewGrant(userId: string, stationId: string): Promise<boolean> {
  const value = (await cookies()).get(cookieName(stationId))?.value;
  if (!value) return false;
  const separator = value.indexOf(".");
  const expiresAt = Number(value.slice(0, separator));
  const provided = value.slice(separator + 1);
  if (separator < 1 || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(provided, signature(userId, stationId, expiresAt));
}

export async function requireAdminPreview(stationId: string): Promise<AuthUser> {
  const user = await requireAdmin();
  if (!(await hasAdminPreviewGrant(user.id, stationId))) {
    throw new HttpError(403, "Open this diagnostic preview from the admin station inventory.", "PREVIEW_GRANT_REQUIRED");
  }
  return user;
}

export async function auditAdminPreviewOpen(actor: AuthUser, stationId: string, reason: string): Promise<string> {
  return transaction(async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      access_enabled: boolean;
      moderation_status: "ACTIVE" | "RESTRICTED";
      broadcast_state: "RUNNING" | "STOPPED";
      visibility: "PRIVATE" | "PUBLIC";
      has_password: boolean;
    }>(
      `SELECT id, name, access_enabled, moderation_status, broadcast_state, visibility,
              access_password_hash IS NOT NULL AS has_password
         FROM stations WHERE id = $1 AND deleted_at IS NULL`,
      [stationId],
    );
    const station = result.rows[0];
    if (!station) throw new HttpError(404, "Station not found or no longer available.", "NOT_FOUND");
    await client.query(
      `INSERT INTO admin_audit_log
         (actor_user_id, actor_name, target_station_id, target_label, action, metadata)
       VALUES ($1, $2, $3, $4, 'ADMIN_STATION_DIAGNOSTIC_OPENED', $5)`,
      [actor.id, actor.displayName, station.id, station.name, {
        reason,
        accessEnabled: station.access_enabled,
        moderationStatus: station.moderation_status,
        broadcastState: station.broadcast_state,
        visibility: station.visibility,
        passwordProtected: station.has_password,
      }],
    );
    return station.name;
  });
}
