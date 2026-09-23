import { NextResponse } from "next/server";
import { requireApiUser, assertVideoOwner } from "@/lib/auth";
import { query } from "@/lib/db";
import { getTranscodeQueue } from "@/lib/queue";
import { assertSameOrigin, jsonError, HttpError } from "@/lib/http";
import { rateLimitByKey } from "@/lib/rate-limit";
import { reserveYouTubeRetry } from "@/lib/youtube-import";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertVideoOwner(id, user.id);
    const video = await query<{ source_kind: "UPLOAD" | "YOUTUBE"; ingestion_status: string | null }>(
      "SELECT source_kind, ingestion_status FROM videos WHERE id = $1",
      [id],
    );
    if (!video.rows[0]) throw new HttpError(404, "Video not found.", "NOT_FOUND");
    if (video.rows[0].source_kind === "YOUTUBE") {
      await rateLimitByKey("youtube-import-retry", user.id, 10, 60 * 60);
    }
    const updated = video.rows[0].source_kind === "YOUTUBE" && video.rows[0].ingestion_status === "FAILED"
      ? await reserveYouTubeRetry(id, user.id)
      : Boolean((await query(
        `UPDATE videos SET status = 'QUEUED', processing_error = NULL, processing_progress = 1, updated_at = now()
          WHERE id = $1 AND status = 'FAILED' AND processing_attempts < 12
            AND (processing_attempts > 0 OR processing_progress > 0)`,
        [id],
      )).rowCount);
    if (!updated) throw new HttpError(409, "This failed video cannot be retried again. Archive it and start a new import or upload.", "NOT_FAILED");
    try {
      const queue = getTranscodeQueue();
      const oldJob = await queue.getJob(`video-${id}`);
      if (oldJob) await oldJob.remove();
      await queue.add("transcode-video", { videoId: id }, { jobId: `video-${id}` });
    } catch {
      const message = "The media job could not be queued. Try again when queue service is available.";
      await query(
        `UPDATE videos SET status = 'FAILED', processing_error = $2,
                ingestion_status = CASE WHEN source_kind = 'YOUTUBE' AND ingestion_status = 'QUEUED' THEN 'FAILED' ELSE ingestion_status END,
                ingestion_error = CASE WHEN source_kind = 'YOUTUBE' AND ingestion_status = 'QUEUED' THEN $2 ELSE ingestion_error END,
                size_bytes = CASE WHEN source_kind = 'YOUTUBE' AND ingestion_status = 'QUEUED' THEN 0 ELSE size_bytes END,
                updated_at = now()
          WHERE id = $1 AND status = 'QUEUED'`,
        [id, message],
      );
      throw new HttpError(503, message, "QUEUE_UNAVAILABLE");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
