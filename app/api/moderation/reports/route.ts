import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getModerationOverview, listReports, moderationActor } from "@/lib/moderation";

export async function GET(request: Request) {
  try {
    await moderationActor(request, "reports:read");
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    const [reports, overview] = await Promise.all([listReports(status), getModerationOverview()]);
    return NextResponse.json({ reports, overview });
  } catch (error) {
    return jsonError(error);
  }
}
