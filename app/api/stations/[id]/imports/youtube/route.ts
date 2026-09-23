import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { getTranscodeQueue } from "@/lib/queue";
import { rateLimitByKey } from "@/lib/rate-limit";
import { youtubeImportSchema } from "@/lib/validation";
import { normalizeYouTubeUrl } from "@/lib/youtube";
import { reserveYouTubeImport } from "@/lib/youtube-import";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    if (!env().YOUTUBE_IMPORT_ENABLED) {
      throw new HttpError(503, "YouTube importing is disabled on this deployment.", "YOUTUBE_IMPORT_DISABLED");
    }
    const { id: stationId } = await context.params;
    const data = youtubeImportSchema.parse(await parseJson(request));
    const source = normalizeYouTubeUrl(data.url);
    await rateLimitByKey("youtube-import", user.id, 60, 60 * 60);
    const reservation = await reserveYouTubeImport({
      userId: user.id,
      stationId,
      source,
      requestId: data.requestId,
    });
    if (reservation.created) {
      try {
        await getTranscodeQueue().add("transcode-video", { videoId: reservation.videoId }, { jobId: `video-${reservation.videoId}` });
      } catch {
        const message = "The YouTube import could not be queued. Retry it from the media library.";
        await query(
          `UPDATE videos SET status = 'FAILED', ingestion_status = 'FAILED', ingestion_error = $2,
                  processing_error = $2, updated_at = now()
            WHERE id = $1 AND status = 'QUEUED' AND ingestion_status = 'QUEUED'`,
          [reservation.videoId, message],
        );
        throw new HttpError(503, message, "QUEUE_UNAVAILABLE");
      }
    }
    return NextResponse.json(
      { videoId: reservation.videoId, status: reservation.status, created: reservation.created },
      { status: reservation.created ? 202 : 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
