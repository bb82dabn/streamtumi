import { cookies } from "next/headers";
import { currentUser, type AuthUser } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { PublicStation } from "@/lib/public-access";

const guestCookie = "st_chat_guest";

export type ChatMessage = {
  id: string;
  stationId: string;
  authorKind: "GUEST" | "REGISTERED" | "HOST";
  authorName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  pinnedAt: string | null;
  hidden: boolean;
};

export type MessageRow = {
  id: string;
  station_id: string;
  author_kind: "GUEST" | "REGISTERED" | "HOST";
  author_name: string;
  avatar_revision: string | null;
  body: string;
  created_at: Date;
  pinned_at: Date | null;
  hidden_at: Date | null;
};

type Guest = { id: string; display_name: string; token_hash: string };
export type ChatActor = { kind: "GUEST" | "REGISTERED" | "HOST"; id: string; name: string; user?: AuthUser };

export function presentMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    stationId: row.station_id,
    authorKind: row.author_kind,
    authorName: row.author_name,
    avatarUrl: row.avatar_revision ? `/api/community/avatars/${row.avatar_revision}/96.jpg` : null,
    body: row.hidden_at ? "Message removed by the host." : row.body,
    createdAt: row.created_at.toISOString(),
    pinnedAt: row.pinned_at?.toISOString() ?? null,
    hidden: Boolean(row.hidden_at),
  };
}

async function currentGuest(): Promise<Guest | null> {
  const token = (await cookies()).get(guestCookie)?.value;
  if (!token) return null;
  const result = await query<Guest>(
    "SELECT id, display_name, token_hash FROM chat_guests WHERE token_hash = $1 AND expires_at > now()",
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

export async function setGuestIdentity(displayName: string): Promise<{ id: string; displayName: string }> {
  const jar = await cookies();
  const existingToken = jar.get(guestCookie)?.value;
  if (existingToken) {
    const updated = await query<{ id: string }>(
      `UPDATE chat_guests SET display_name = $2, expires_at = now() + ($3 * interval '1 day'), updated_at = now()
        WHERE token_hash = $1 RETURNING id`,
      [hashToken(existingToken), displayName, env().CHAT_RETENTION_DAYS],
    );
    if (updated.rows[0]) return { id: updated.rows[0].id, displayName };
  }

  const token = randomToken();
  const result = await query<{ id: string }>(
    `INSERT INTO chat_guests (token_hash, display_name, expires_at)
     VALUES ($1, $2, now() + ($3 * interval '1 day')) RETURNING id`,
    [hashToken(token), displayName, env().CHAT_RETENTION_DAYS],
  );
  jar.set(guestCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/public/stations",
    maxAge: env().CHAT_RETENTION_DAYS * 86_400,
  });
  return { id: result.rows[0].id, displayName };
}

export function chatActor(station: PublicStation): Promise<ChatActor>;
export function chatActor(station: PublicStation, requireIdentity: true): Promise<ChatActor>;
export function chatActor(station: PublicStation, requireIdentity: false): Promise<ChatActor | null>;
export async function chatActor(station: PublicStation, requireIdentity = true): Promise<ChatActor | null> {
  const user = await currentUser();
  if (user) {
    if (requireIdentity && user.emailVerified !== true) {
      throw new HttpError(403, "Verify your email before joining station communities.", "EMAIL_VERIFICATION_REQUIRED");
    }
    return registeredChatActor(station, user);
  }
  if (requireIdentity) throw new HttpError(401, "Sign in is required to post in chat.", "UNAUTHENTICATED");
  const guest = await currentGuest();
  if (guest) return { kind: "GUEST", id: guest.id, name: guest.display_name };
  return null;
}

export function registeredChatActor(station: PublicStation, user: AuthUser): ChatActor {
  return { kind: user.id === station.owner_id ? "HOST" : "REGISTERED", id: user.id, name: user.displayName, user };
}

export async function recentMessages(
  stationId: string,
  before?: { at: Date; id: string },
  limit = 100,
  viewerUserId?: string,
): Promise<ChatMessage[]> {
  const values: unknown[] = [stationId, limit];
  let cursor = "";
  if (before) {
    values.push(before.at, before.id);
    cursor = "AND (m.created_at, m.id) < ($3::timestamptz, $4::uuid)";
  }
  let blocked = "";
  if (viewerUserId) {
    values.push(viewerUserId);
    blocked = `AND NOT EXISTS (
      SELECT 1 FROM user_blocks b
       WHERE b.blocker_user_id = $${values.length}
         AND (b.blocked_user_id = m.author_user_id OR b.blocked_guest_id = m.author_guest_id)
    )`;
  }
  const result = await query<MessageRow>(
    `SELECT m.id, m.station_id, m.author_kind, m.author_name,
            CASE WHEN m.author_kind IN ('REGISTERED', 'HOST') THEN u.avatar_revision END AS avatar_revision,
            m.body, m.created_at, m.pinned_at, m.hidden_at
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
        AND u.disabled_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL
       WHERE m.station_id = $1 ${cursor} ${blocked}
       ORDER BY m.created_at DESC, m.id DESC LIMIT $2`,
    values,
  );
  return result.rows.reverse().map(presentMessage);
}

export async function pinnedMessages(stationId: string, viewerUserId?: string): Promise<ChatMessage[]> {
  const values: unknown[] = [stationId];
  let blocked = "";
  if (viewerUserId) {
    values.push(viewerUserId);
    blocked = `AND NOT EXISTS (
      SELECT 1 FROM user_blocks b
       WHERE b.blocker_user_id = $2
         AND (b.blocked_user_id = m.author_user_id OR b.blocked_guest_id = m.author_guest_id)
    )`;
  }
  const result = await query<MessageRow>(
    `SELECT m.id, m.station_id, m.author_kind, m.author_name,
            CASE WHEN m.author_kind IN ('REGISTERED', 'HOST') THEN u.avatar_revision END AS avatar_revision,
            m.body, m.created_at, m.pinned_at, m.hidden_at
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
        AND u.disabled_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL
       WHERE m.station_id = $1 AND m.pinned_at IS NOT NULL AND m.hidden_at IS NULL ${blocked}
       ORDER BY m.pinned_at DESC LIMIT 20`,
    values,
  );
  return result.rows.map(presentMessage);
}

export async function createMessage(stationId: string, actor: ChatActor, body: string): Promise<ChatMessage> {
  if (actor.kind === "GUEST") throw new HttpError(401, "Sign in is required to post in chat.", "UNAUTHENTICATED");
  const result = await query<MessageRow>(
    `WITH inserted AS (
       INSERT INTO chat_messages
         (station_id, author_kind, author_user_id, author_guest_id, author_name, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, station_id, author_kind, author_user_id, author_name, body, created_at, pinned_at, hidden_at
     )
     SELECT m.id, m.station_id, m.author_kind, m.author_name,
            CASE WHEN m.author_kind IN ('REGISTERED', 'HOST') THEN u.avatar_revision END AS avatar_revision,
            m.body, m.created_at, m.pinned_at, m.hidden_at
       FROM inserted m
       LEFT JOIN users u ON u.id = m.author_user_id
        AND u.disabled_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL`,
    [stationId, actor.kind, actor.id, null, actor.name, body],
  );
  return presentMessage(result.rows[0]);
}

export async function messageForStation(stationId: string, messageId: string): Promise<MessageRow> {
  const result = await query<MessageRow>(
    `SELECT m.id, m.station_id, m.author_kind, m.author_name,
            CASE WHEN m.author_kind IN ('REGISTERED', 'HOST') THEN u.avatar_revision END AS avatar_revision,
            m.body, m.created_at, m.pinned_at, m.hidden_at
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
        AND u.disabled_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL
       WHERE m.id = $1 AND m.station_id = $2`,
    [messageId, stationId],
  );
  if (!result.rows[0]) throw new HttpError(404, "Chat message not found.", "NOT_FOUND");
  return result.rows[0];
}
