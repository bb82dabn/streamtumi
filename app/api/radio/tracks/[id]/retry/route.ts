import { NextResponse } from "next/server";
import { assertRadioTrackOwner, requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError } from "@/lib/http";
import { getRadioPrepQueue } from "@/lib/queue";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertRadioTrackOwner(id, user.id);
    const updated = await query("UPDATE radio_tracks SET status = 'QUEUED', processing_progress = 1, processing_error = NULL, updated_at = now() WHERE id = $1 AND status = 'FAILED' AND processing_attempts BETWEEN 1 AND 11", [id]);
    if (!updated.rowCount) throw new HttpError(409, "This track cannot be retried.", "RETRY_NOT_ALLOWED");
    try {
      const queue = getRadioPrepQueue();
      const oldJob = await queue.getJob(`radio-track-${id}`);
      if (oldJob) await oldJob.remove();
      await queue.add("prepare-radio-track", { trackId: id }, { jobId: `radio-track-${id}` });
    } catch {
      const message = "The Radio preparation job could not be queued. Try again when the queue service is available.";
      await query("UPDATE radio_tracks SET status = 'FAILED', processing_error = $2, updated_at = now() WHERE id = $1 AND status = 'QUEUED'", [id, message]);
      throw new HttpError(503, message, "QUEUE_UNAVAILABLE");
    }
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
