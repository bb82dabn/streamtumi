import { jsonError, HttpError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { getReport, moderationActor } from "@/lib/moderation";

type Context = { params: Promise<{ id: string; path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    await moderationActor(request, "reports:read");
    const { id, path } = await context.params;
    const report = await getReport(id);
    const hlsKey = report.subject_snapshot.hlsKey;
    if (typeof hlsKey !== "string") throw new HttpError(404, "This report has no preserved media reference.", "MEDIA_NOT_FOUND");
    const relative = path.join("/");
    const key = relative === "master.m3u8" ? hlsKey : `${hlsKey.replace(/master\.m3u8$/, "")}${relative}`;
    return objectResponse(key, request, "private, no-store");
  } catch (error) {
    return jsonError(error);
  }
}
