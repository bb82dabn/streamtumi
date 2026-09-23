import { NextResponse } from "next/server";
import { setGuestIdentity } from "@/lib/chat";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";
import { chatIdentitySchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "chat-identity", 10, 3600);
    const { token } = await context.params;
    await resolvePublicStation(token);
    const data = chatIdentitySchema.parse(await parseJson(request));
    return NextResponse.json(await setGuestIdentity(data.username));
  } catch (error) {
    return jsonError(error);
  }
}
