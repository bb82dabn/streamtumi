import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { verifyStationPassword, verifyStationRoomKey } from "@/lib/public-access";
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
    if (credential.accessKey) await verifyStationRoomKey(token, credential.accessKey);
    else await verifyStationPassword(token, credential.password as string);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
