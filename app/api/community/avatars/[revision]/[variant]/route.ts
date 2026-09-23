import { avatarObjectKey, isAvatarRevision, type AvatarSize } from "@/lib/avatar-image";
import { query } from "@/lib/db";
import { HttpError, jsonError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ revision: string; variant: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "community-avatar-read", 600, 60);
    const { revision, variant } = await context.params;
    if (!isAvatarRevision(revision) || (variant !== "96.jpg" && variant !== "256.jpg")) {
      throw new HttpError(404, "Avatar not found.", "NOT_FOUND");
    }
    const current = await query(
      `SELECT 1 FROM users WHERE avatar_revision = $1
        AND disabled_at IS NULL AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
      [revision],
    );
    if (!current.rowCount) throw new HttpError(404, "Avatar not found.", "NOT_FOUND");

    const size = Number.parseInt(variant, 10) as AvatarSize;
    const response = await objectResponse(avatarObjectKey(revision, size), request, "public, max-age=31536000, immutable");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
