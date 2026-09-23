import { randomToken } from "@/lib/crypto";
import { query, transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import {
  avatarUrl,
  removeAvatarRevision,
  storeAvatarVariants,
  type AvatarVariants,
} from "@/lib/avatar-image";

const forbiddenDisplayNameCharacters = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const reservedAuthorityNames = new Set([
  "admin",
  "administrator",
  "host",
  "moderator",
  "official",
  "staff",
  "streamtumi",
  "streamtumiadmin",
  "streamtumimoderator",
  "streamtumistaff",
  "streamtumisupport",
  "support",
  "system",
]);

type ProfileRow = {
  display_name: string;
  avatar_revision: string | null;
  version: number;
};

export type CommunityProfile = {
  displayName: string;
  avatarUrl: string | null;
  version: number;
};

function presentProfile(row: ProfileRow): CommunityProfile {
  return {
    displayName: row.display_name,
    avatarUrl: row.avatar_revision ? avatarUrl(row.avatar_revision, 256) : null,
    version: row.version,
  };
}

function authorityKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[\s._-]+/gu, "");
}

export function normalizeDisplayName(input: string): string {
  if (input.length > 128 || forbiddenDisplayNameCharacters.test(input)) {
    throw new HttpError(400, "Display names cannot contain control or bidirectional formatting characters.", "INVALID_DISPLAY_NAME");
  }
  const displayName = input.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const length = Array.from(displayName).length;
  if (length < 2 || length > 32) {
    throw new HttpError(400, "Display names must contain 2 to 32 characters.", "INVALID_DISPLAY_NAME");
  }
  if (reservedAuthorityNames.has(authorityKey(displayName))) {
    throw new HttpError(400, "Choose a display name that does not imply platform authority.", "RESERVED_DISPLAY_NAME");
  }
  return displayName;
}

export async function communityProfile(userId: string): Promise<CommunityProfile> {
  const result = await query<ProfileRow>(
    `SELECT display_name, avatar_revision, version FROM users
      WHERE id = $1 AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
    [userId],
  );
  if (!result.rows[0]) throw new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE");
  return presentProfile(result.rows[0]);
}

export async function updateCommunityDisplayName(userId: string, input: string, expectedVersion: number): Promise<CommunityProfile> {
  const displayName = normalizeDisplayName(input);
  const result = await query<ProfileRow>(
    `UPDATE users SET display_name = $2, version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $3 AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL
      RETURNING display_name, avatar_revision, version`,
    [userId, displayName, expectedVersion],
  );
  if (!result.rows[0]) throw new HttpError(409, "Your profile changed. Refresh before trying again.", "VERSION_CONFLICT");
  return presentProfile(result.rows[0]);
}

async function replaceAvatarPointer(userId: string, expectedVersion: number, revision: string | null): Promise<{ profile: CommunityProfile; previous: string | null }> {
  return transaction(async (client) => {
    const current = await client.query<ProfileRow>(
      `SELECT display_name, avatar_revision, version FROM users
        WHERE id = $1 AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL
        FOR UPDATE`,
      [userId],
    );
    const row = current.rows[0];
    if (!row || row.version !== expectedVersion) {
      throw new HttpError(409, "Your profile changed. Refresh before trying again.", "VERSION_CONFLICT");
    }
    const updated = await client.query<ProfileRow>(
      `UPDATE users SET avatar_revision = $2, version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $3
        RETURNING display_name, avatar_revision, version`,
      [userId, revision, expectedVersion],
    );
    if (!updated.rows[0]) throw new HttpError(409, "Your profile changed. Refresh before trying again.", "VERSION_CONFLICT");
    return { profile: presentProfile(updated.rows[0]), previous: row.avatar_revision };
  });
}

async function removeReplacedAvatar(revision: string | null): Promise<void> {
  if (!revision) return;
  await removeAvatarRevision(revision).catch((error) => {
    console.error(`Could not remove replaced avatar ${revision}:`, error instanceof Error ? error.message : "Avatar cleanup failed");
  });
}

export async function updateCommunityAvatar(userId: string, expectedVersion: number, variants: AvatarVariants): Promise<CommunityProfile> {
  const revision = randomToken();
  await storeAvatarVariants(revision, variants);
  let result: { profile: CommunityProfile; previous: string | null };
  try {
    result = await replaceAvatarPointer(userId, expectedVersion, revision);
  } catch (error) {
    await removeAvatarRevision(revision).catch(() => undefined);
    throw error;
  }
  await removeReplacedAvatar(result.previous);
  return result.profile;
}

export async function deleteCommunityAvatar(userId: string, expectedVersion: number): Promise<CommunityProfile> {
  const result = await replaceAvatarPointer(userId, expectedVersion, null);
  await removeReplacedAvatar(result.previous);
  return result.profile;
}
