import type { AuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { reportReference } from "@/lib/moderation";
import type { PublicStation } from "@/lib/public-access";

export type BlockedAccount = {
  id: string;
  kind: "REGISTERED" | "GUEST";
  snapshotDisplayName: string;
  blockedAt: string;
};

type BlockRow = {
  id: string;
  blocked_user_id: string | null;
  snapshot_display_name: string;
  created_at: Date;
};

type MessageTargetRow = {
  author_kind: "GUEST" | "REGISTERED" | "HOST";
  author_user_id: string | null;
  author_guest_id: string | null;
  author_name: string;
  guest_exists: boolean;
};

type ReportInput = {
  subjectType: "STATION" | "VIDEO" | "CHAT_MESSAGE";
  videoId?: string;
  messageId?: string;
  reason: "ILLEGAL_CONTENT" | "CHILD_SAFETY" | "INTELLECTUAL_PROPERTY" | "VIOLENCE_OR_THREATS" | "HATE_OR_HARASSMENT" | "SPAM_OR_SCAM" | "OTHER";
  details: string;
  email?: string;
};

type Reporter = { userId?: string; guestId?: string };

function presentBlock(row: BlockRow): BlockedAccount {
  return {
    id: row.id,
    kind: row.blocked_user_id ? "REGISTERED" : "GUEST",
    snapshotDisplayName: row.snapshot_display_name,
    blockedAt: row.created_at.toISOString(),
  };
}

async function messageTarget(stationId: string, messageId: string): Promise<MessageTargetRow> {
  const result = await query<MessageTargetRow>(
    `SELECT m.author_kind, m.author_user_id, m.author_guest_id, m.author_name,
            (g.id IS NOT NULL) AS guest_exists
       FROM chat_messages m
       LEFT JOIN chat_guests g ON g.id = m.author_guest_id
      WHERE m.station_id = $1 AND m.id = $2`,
    [stationId, messageId],
  );
  const target = result.rows[0];
  if (!target) throw new HttpError(404, "Chat message not found.", "NOT_FOUND");
  if (target.author_kind === "GUEST" && (!target.author_guest_id || !target.guest_exists)) {
    throw new HttpError(409, "This historical guest identity is no longer available to block.", "BLOCK_TARGET_UNAVAILABLE");
  }
  if (target.author_kind !== "GUEST" && !target.author_user_id) {
    throw new HttpError(409, "This account is no longer available to block.", "BLOCK_TARGET_UNAVAILABLE");
  }
  return target;
}

export async function blockMessageAuthor(
  blocker: Pick<AuthUser, "id" | "emailVerified">,
  stationId: string,
  messageId: string,
): Promise<BlockedAccount> {
  if (!blocker.emailVerified) {
    throw new HttpError(403, "Verify your email before blocking community members.", "EMAIL_VERIFICATION_REQUIRED");
  }
  const target = await messageTarget(stationId, messageId);
  if (target.author_user_id === blocker.id) {
    throw new HttpError(409, "You cannot block yourself.", "SELF_BLOCK");
  }

  const registered = target.author_kind !== "GUEST";
  const result = await query<BlockRow>(
    registered
      ? `INSERT INTO user_blocks
           (blocker_user_id, blocked_user_id, snapshot_display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (blocker_user_id, blocked_user_id) WHERE blocked_user_id IS NOT NULL
         DO UPDATE SET snapshot_display_name = user_blocks.snapshot_display_name
         RETURNING id, blocked_user_id, snapshot_display_name, created_at`
      : `INSERT INTO user_blocks
           (blocker_user_id, blocked_guest_id, snapshot_display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (blocker_user_id, blocked_guest_id) WHERE blocked_guest_id IS NOT NULL
         DO UPDATE SET snapshot_display_name = user_blocks.snapshot_display_name
         RETURNING id, blocked_user_id, snapshot_display_name, created_at`,
    [blocker.id, registered ? target.author_user_id : target.author_guest_id, target.author_name],
  );
  return presentBlock(result.rows[0]);
}

export async function unblockMessageAuthor(blockerUserId: string, stationId: string, messageId: string): Promise<boolean> {
  const target = await messageTarget(stationId, messageId);
  if (target.author_user_id === blockerUserId) return false;
  const result = await query(
    target.author_kind === "GUEST"
      ? "DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_guest_id = $2"
      : "DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2",
    [blockerUserId, target.author_kind === "GUEST" ? target.author_guest_id : target.author_user_id],
  );
  return Boolean(result.rowCount);
}

export async function listUserBlocks(blockerUserId: string): Promise<BlockedAccount[]> {
  const result = await query<BlockRow>(
    `SELECT id, blocked_user_id, snapshot_display_name, created_at
       FROM user_blocks
      WHERE blocker_user_id = $1
      ORDER BY created_at DESC, id DESC`,
    [blockerUserId],
  );
  return result.rows.map(presentBlock);
}

export async function unblockById(blockerUserId: string, blockId: string): Promise<boolean> {
  const result = await query(
    "DELETE FROM user_blocks WHERE id = $1 AND blocker_user_id = $2",
    [blockId, blockerUserId],
  );
  return Boolean(result.rowCount);
}

export async function createContentReport(
  station: PublicStation,
  data: ReportInput,
  reporter: Reporter = {},
): Promise<string> {
  let videoId: string | null = null;
  let messageId: string | null = null;
  let snapshot: Record<string, unknown> = {
    stationName: station.name,
    stationDescription: station.description,
  };

  if (data.subjectType === "VIDEO") {
    const video = await query<{ id: string; title: string; description: string; hls_key: string }>(
      `SELECT v.id, v.title, v.description, i.hls_key
         FROM schedule_items i
         JOIN schedules a ON a.id = i.schedule_id
         JOIN videos v ON v.id = i.video_id
        WHERE v.id = $1 AND a.station_id = $2 AND i.schedule_id IN ($3, $4) LIMIT 1`,
      [data.videoId, station.id, station.active_schedule_id, station.pending_schedule_id],
    );
    if (!video.rows[0]) throw new HttpError(404, "The video is not published on this station.", "NOT_FOUND");
    videoId = video.rows[0].id;
    snapshot = {
      ...snapshot,
      videoTitle: video.rows[0].title,
      videoDescription: video.rows[0].description,
      hlsKey: video.rows[0].hls_key,
    };
  }

  if (data.subjectType === "CHAT_MESSAGE") {
    const message = await query<{
      id: string;
      author_name: string;
      author_kind: "GUEST" | "REGISTERED" | "HOST";
      body: string;
      created_at: Date;
    }>(
      `SELECT id, author_name, author_kind, body, created_at
         FROM chat_messages
        WHERE id = $1 AND station_id = $2`,
      [data.messageId, station.id],
    );
    if (!message.rows[0]) throw new HttpError(404, "Chat message not found.", "NOT_FOUND");
    messageId = message.rows[0].id;
    snapshot = {
      ...snapshot,
      authorName: message.rows[0].author_name,
      authorKind: message.rows[0].author_kind,
      messageBody: message.rows[0].body,
      messageCreatedAt: message.rows[0].created_at.toISOString(),
    };
  }

  const reference = reportReference();
  await query(
    `INSERT INTO content_reports
       (reference_code, subject_type, station_id, video_id, chat_message_id,
        reporter_user_id, reporter_guest_id, reporter_email, reason, details, subject_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [reference, data.subjectType, station.id, videoId, messageId,
      reporter.userId ?? null, reporter.guestId ?? null, data.email ?? null,
      data.reason, data.details, snapshot],
  );
  return reference;
}
