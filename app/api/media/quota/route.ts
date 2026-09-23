import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { stationMediaQuota } from "@/lib/media-assets";
import { HttpError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const stationId = new URL(request.url).searchParams.get("stationId");
    if (!stationId) throw new HttpError(400, "stationId is required.", "STATION_REQUIRED");
    const quota = await stationMediaQuota(stationId, user.id);
    return NextResponse.json(quota, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
