import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { currentUser, type AuthUser } from "@/lib/auth";
import { presentMessage, type MessageRow } from "@/lib/chat";
import { publishStationEvent, type StationEvent } from "@/lib/chat-events";
import { hashToken, randomToken } from "@/lib/crypto";
import { query, transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type ModerationActor =
  | { type: "HUMAN"; name: string; user: AuthUser }
  | { type: "BOT"; name: string; tokenId: string; scopes: string[] };

type ReportRow = {
  id: string;
  reference_code: string;
  subject_type: "STATION" | "VIDEO" | "CHAT_MESSAGE";
  station_id: string | null;
  video_id: string | null;
  chat_message_id: string | null;
  reason: string;
  details: string;
  subject_snapshot: Record<string, unknown>;
  status: "OPEN" | "IN_REVIEW" | "ACTIONED" | "DISMISSED";
  version: number;
  reporter_email: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
};

export type ModerationOverview = {
  open: number;
  inReview: number;
  resolvedToday: number;
  restrictedStations: number;
  legalHolds: number;
};

export function reportReference(): string {
  return `ST-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function moderationActor(request: Request, scope: "reports:read" | "reports:decide"): Promise<ModerationActor> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    const result = await query<{ id: string; name: string; scopes: string[] }>(
      `UPDATE moderation_service_tokens
          SET last_used_at = now()
        WHERE token_hash = $1 AND active = true AND $2 = ANY(scopes)
        RETURNING id, name, scopes`,
      [hashToken(token), scope],
    );
    const service = result.rows[0];
    if (!service) throw new HttpError(401, "The moderation token is invalid or lacks scope.", "INVALID_TOKEN");
    return { type: "BOT", name: service.name, tokenId: service.id, scopes: service.scopes };
  }

  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in is required.", "UNAUTHENTICATED");
  if (user.mustChangePassword) throw new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
  if (user.role !== "MODERATOR" && user.role !== "ADMIN") throw new HttpError(403, "Moderator access is required.", "FORBIDDEN");
  return { type: "HUMAN", name: user.displayName, user };
}

function actorValues(actor: ModerationActor): [string | null, string | null, string] {
  return actor.type === "HUMAN" ? [actor.user.id, null, actor.name] : [null, actor.tokenId, actor.name];
}

async function audit(
  client: PoolClient,
  actor: ModerationActor,
  reportId: string | null,
  action: string,
  note: string,
  metadata: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  const [userId, tokenId, name] = actorValues(actor);
  await client.query(
    `INSERT INTO moderation_audit_log
       (report_id, actor_type, actor_user_id, actor_token_id, actor_name, action, note, metadata, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [reportId, actor.type, userId, tokenId, name, action, note, metadata, idempotencyKey ?? null],
  );
}

export async function listReports(status?: string): Promise<ReportRow[]> {
  const values: unknown[] = [];
  const filter = status ? "WHERE r.status = $1" : "";
  if (status) values.push(status);
  const result = await query<ReportRow>(
    `SELECT r.* FROM content_reports r ${filter} ORDER BY
       CASE r.status WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,
       r.created_at ASC LIMIT 200`,
    values,
  );
  return result.rows;
}

export async function getModerationOverview(): Promise<ModerationOverview> {
  const result = await query<{
    open: number;
    in_review: number;
    resolved_today: number;
    restricted_stations: number;
    legal_holds: number;
  }>(
    `SELECT
       count(*) FILTER (WHERE status = 'OPEN')::int AS open,
       count(*) FILTER (WHERE status = 'IN_REVIEW')::int AS in_review,
       count(*) FILTER (
         WHERE status IN ('ACTIONED', 'DISMISSED')
           AND resolved_at >= date_trunc('day', now())
       )::int AS resolved_today,
       (SELECT count(*)::int FROM stations
         WHERE moderation_status = 'RESTRICTED' AND deleted_at IS NULL) AS restricted_stations,
       (SELECT count(*)::int FROM stations WHERE legal_hold_at IS NOT NULL) AS legal_holds
     FROM content_reports`,
  );
  const overview = result.rows[0];
  return {
    open: overview.open,
    inReview: overview.in_review,
    resolvedToday: overview.resolved_today,
    restrictedStations: overview.restricted_stations,
    legalHolds: overview.legal_holds,
  };
}

export async function setStationExplicitEnforcement(stationId: string, enforced: boolean, note: string, user: AuthUser) {
  return transaction(async (client) => {
    const station = await client.query<{ id: string; name: string; owner_declared_explicit: boolean }>(
      "SELECT id, name, owner_declared_explicit FROM stations WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [stationId],
    );
    if (!station.rows[0]) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    const updated = await client.query<{ explicit_enforced_at: Date | null }>(
      `UPDATE stations
          SET explicit_enforced_at = CASE WHEN $2 THEN now() ELSE NULL END,
              explicit_enforced_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
              explicit_enforcement_note = CASE WHEN $2 THEN $4 ELSE NULL END,
              updated_at = now()
        WHERE id = $1 RETURNING explicit_enforced_at`,
      [stationId, enforced, user.id, note],
    );
    await client.query(
      `INSERT INTO moderation_audit_log
         (actor_type, actor_user_id, actor_name, action, note, metadata)
       VALUES ('HUMAN', $1, $2, $3, $4, $5)`,
      [user.id, user.displayName, enforced ? "STATION_EXPLICIT_ENFORCED" : "STATION_EXPLICIT_CLEARED", note, { stationId, stationName: station.rows[0].name }],
    );
    return { enforced: Boolean(updated.rows[0].explicit_enforced_at) };
  });
}

export async function getReport(reportId: string): Promise<ReportRow> {
  const result = await query<ReportRow>("SELECT * FROM content_reports WHERE id = $1", [reportId]);
  if (!result.rows[0]) throw new HttpError(404, "Report not found.", "NOT_FOUND");
  return result.rows[0];
}

export async function listReportAudit(reportId: string) {
  const result = await query<{
    id: string; actor_type: string; actor_name: string; action: string; note: string | null;
    metadata: Record<string, unknown>; created_at: Date;
  }>(
    `SELECT id, actor_type, actor_name, action, note, metadata, created_at
       FROM moderation_audit_log WHERE report_id = $1 ORDER BY created_at ASC`,
    [reportId],
  );
  return result.rows;
}

export async function claimReport(reportId: string, actor: ModerationActor): Promise<ReportRow> {
  return transaction(async (client) => {
    const result = await client.query<ReportRow>("SELECT * FROM content_reports WHERE id = $1 FOR UPDATE", [reportId]);
    const report = result.rows[0];
    if (!report) throw new HttpError(404, "Report not found.", "NOT_FOUND");
    if (report.status !== "OPEN" && report.status !== "IN_REVIEW") throw new HttpError(409, "This report is already resolved.", "REPORT_RESOLVED");
    const updated = await client.query<ReportRow>(
      `UPDATE content_reports SET status = 'IN_REVIEW', assigned_to_user_id = $2,
              version = version + 1, updated_at = now() WHERE id = $1 RETURNING *`,
      [reportId, actor.type === "HUMAN" ? actor.user.id : null],
    );
    await audit(client, actor, reportId, "CLAIM", "Report claimed for review.");
    return updated.rows[0];
  });
}

type Decision = { action: "DISMISS" | "HIDE_MESSAGE" | "RESTRICT_STATION" | "RESTORE_STATION" | "ESCALATE"; version: number; note: string; confidence?: number; idempotencyKey?: string };

export async function decideReport(reportId: string, actor: ModerationActor, decision: Decision): Promise<ReportRow> {
  let stationEvent: { id: string; event: StationEvent } | undefined;
  const report = await transaction(async (client) => {
    const result = await client.query<ReportRow>("SELECT * FROM content_reports WHERE id = $1 FOR UPDATE", [reportId]);
    const current = result.rows[0];
    if (!current) throw new HttpError(404, "Report not found.", "NOT_FOUND");
    if (actor.type === "BOT" && decision.idempotencyKey) {
      const existing = await client.query<{ report_id: string | null }>("SELECT report_id FROM moderation_audit_log WHERE actor_token_id = $1 AND idempotency_key = $2", [actor.tokenId, decision.idempotencyKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].report_id !== reportId) throw new HttpError(409, "That idempotency key was used for another report.", "IDEMPOTENCY_CONFLICT");
        return current;
      }
    }
    if (current.version !== decision.version) throw new HttpError(409, "The report changed. Refresh before deciding.", "VERSION_CONFLICT");
    if (current.status === "ACTIONED" || current.status === "DISMISSED") throw new HttpError(409, "This report is already resolved.", "REPORT_RESOLVED");

    let status: ReportRow["status"] = "ACTIONED";
    if (decision.action === "DISMISS") status = "DISMISSED";
    if (decision.action === "ESCALATE") status = "IN_REVIEW";
    if (decision.action === "HIDE_MESSAGE") {
      if (!current.chat_message_id) throw new HttpError(409, "This report does not target a chat message.", "INVALID_ACTION");
      const hidden = await client.query<MessageRow>(
        `UPDATE chat_messages SET hidden_at = now(), hidden_reason = $2,
                hidden_by_user_id = $3, pinned_at = NULL, pinned_by_user_id = NULL
          WHERE id = $1
          RETURNING id, station_id, author_kind, author_name, body, created_at, pinned_at, hidden_at`,
        [current.chat_message_id, decision.note, actor.type === "HUMAN" ? actor.user.id : null],
      );
      if (current.station_id && hidden.rows[0]) stationEvent = { id: current.station_id, event: { type: "message.updated", data: presentMessage(hidden.rows[0]) } };
    }
    if (decision.action === "RESTRICT_STATION") {
      if (!current.station_id) throw new HttpError(409, "The reported station no longer exists.", "INVALID_ACTION");
      await client.query(
        `UPDATE stations SET moderation_status = 'RESTRICTED', moderation_restricted_at = now(),
                moderation_restricted_by = $2, moderation_note = $3, access_enabled = false, updated_at = now()
          WHERE id = $1`,
        [current.station_id, actor.type === "HUMAN" ? actor.user.id : null, decision.note],
      );
      stationEvent = { id: current.station_id, event: { type: "station.updated", data: { restricted: true } } };
    }
    if (decision.action === "RESTORE_STATION") {
      if (!current.station_id) throw new HttpError(409, "The reported station no longer exists.", "INVALID_ACTION");
      await client.query(
        `UPDATE stations SET moderation_status = 'ACTIVE', moderation_restricted_at = NULL,
                moderation_restricted_by = NULL, moderation_note = NULL, updated_at = now()
          WHERE id = $1`,
        [current.station_id],
      );
      stationEvent = { id: current.station_id, event: { type: "station.updated", data: { restricted: false } } };
    }

    const resolved = status === "ACTIONED" || status === "DISMISSED";
    const updated = await client.query<ReportRow>(
      `UPDATE content_reports SET status = $2, decision_source = $3,
              resolution_note = $4, resolved_by_user_id = $5,
              resolved_at = CASE WHEN $6 THEN now() ELSE NULL END,
              version = version + 1, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [reportId, status, actor.type, decision.note, actor.type === "HUMAN" ? actor.user.id : null, resolved],
    );
    await audit(client, actor, reportId, decision.action, decision.note, { confidence: decision.confidence }, decision.idempotencyKey);
    return updated.rows[0];
  });
  if (stationEvent) await publishStationEvent(stationEvent.id, stationEvent.event);
  return report;
}

export async function setLegalHold(reportId: string, actor: Extract<ModerationActor, { type: "HUMAN" }>, active: boolean, note: string): Promise<void> {
  await transaction(async (client) => {
    const report = await client.query<{ station_id: string | null }>("SELECT station_id FROM content_reports WHERE id = $1 FOR UPDATE", [reportId]);
    const stationId = report.rows[0]?.station_id;
    if (!stationId) throw new HttpError(409, "The reported station no longer exists.", "INVALID_ACTION");
    const station = await client.query("SELECT id FROM stations WHERE id = $1 FOR UPDATE", [stationId]);
    if (!station.rowCount) throw new HttpError(409, "The reported station no longer exists.", "INVALID_ACTION");
    await client.query(
      `UPDATE stations SET legal_hold_at = ${active ? "now()" : "NULL"}, legal_hold_by = $2, updated_at = now() WHERE id = $1`,
      [stationId, active ? actor.user.id : null],
    );
    await audit(client, actor, reportId, active ? "LEGAL_HOLD_APPLIED" : "LEGAL_HOLD_RELEASED", note);
  });
}

export async function createServiceToken(name: string, scopes: string[], creatorId: string): Promise<{ token: string; id: string }> {
  const token = randomToken();
  const result = await query<{ id: string }>(
    `INSERT INTO moderation_service_tokens (name, token_hash, scopes, created_by_user_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, hashToken(token), scopes, creatorId],
  );
  return { token, id: result.rows[0].id };
}

export async function listServiceTokens() {
  const result = await query<{
    id: string; name: string; scopes: string[]; active: boolean; created_at: Date; last_used_at: Date | null;
  }>(
    `SELECT id, name, scopes, active, created_at, last_used_at
       FROM moderation_service_tokens ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function revokeServiceToken(tokenId: string): Promise<void> {
  const result = await query("UPDATE moderation_service_tokens SET active = false WHERE id = $1 AND active = true", [tokenId]);
  if (!result.rowCount) throw new HttpError(404, "Active service token not found.", "NOT_FOUND");
}
