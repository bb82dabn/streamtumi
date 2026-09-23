import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { issueMobilePlaybackGrant } from "@/lib/mobile-playback-grant";
import { authenticateStationPassword, authenticateStationRoomKey } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  password: z.string().min(1).max(128).optional(),
  accessKey: z.string().regex(/^\d{6}$/).optional(),
}).refine((value) => Boolean(value.password) !== Boolean(value.accessKey), "Supply one access credential.");
type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "public-password", 15, 900);
    const { token } = await context.params;
    const credential = schema.parse(await parseJson(request));
    const station = credential.accessKey
      ? await authenticateStationRoomKey(token, credential.accessKey)
      : await authenticateStationPassword(token, credential.password as string);
    const issued = issueMobilePlaybackGrant(token, station.id, Date.now(), undefined, station.room_access_generation ?? "legacy");
    return NextResponse.json({
      grant: issued.grant,
      expiresAt: issued.expiresAt.toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
