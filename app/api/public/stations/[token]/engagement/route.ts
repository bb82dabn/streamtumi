import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { stationEngagement } from "@/lib/guide";
import { jsonError } from "@/lib/http";
import { stationByToken } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "station-engagement", 120, 60);
    const { token } = await context.params;
    const [station, user] = await Promise.all([stationByToken(token), currentUser()]);
    const engagement = await stationEngagement(station.id, user?.id);
    return NextResponse.json({
      ...engagement,
      public: station.visibility === "PUBLIC",
      signedIn: Boolean(user),
      isOwner: user?.id === station.owner_id,
    });
  } catch (error) {
    return jsonError(error);
  }
}
