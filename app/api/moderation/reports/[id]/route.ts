import { NextResponse } from "next/server";
import { getReport, listReportAudit, moderationActor } from "@/lib/moderation";
import { jsonError } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await moderationActor(request, "reports:read");
    const { id } = await context.params;
    const [report, audit] = await Promise.all([getReport(id), listReportAudit(id)]);
    return NextResponse.json({ report, audit });
  } catch (error) {
    return jsonError(error);
  }
}
