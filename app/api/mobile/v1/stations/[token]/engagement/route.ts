import { NextResponse } from "next/server";
import { stationEngagement } from "@/lib/guide";
import { jsonError } from "@/lib/http";
import { optionalMobileUser } from "@/lib/mobile-community";
import { stationByToken } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "mobile-v1-station-engagement", 120, 60);
    const { token } = await context.params;
    const [station, user] = await Promise.all([stationByToken(token, true, request), optionalMobileUser(request)]);
    const engagement = await stationEngagement(station.id, user?.id);
    return NextResponse.json({
      ...engagement,
      public: station.visibility === "PUBLIC",
      signedIn: Boolean(user),
      isOwner: user?.id === station.owner_id,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
