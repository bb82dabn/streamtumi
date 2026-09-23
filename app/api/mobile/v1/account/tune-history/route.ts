import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { clearTuneHistory, TUNE_HISTORY_RETENTION_DAYS } from "@/lib/tune-history";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireMobileAuth(request);
    const deleted = await clearTuneHistory(user.id);
    return NextResponse.json(
      { ok: true, deleted, retentionDays: TUNE_HISTORY_RETENTION_DAYS },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
