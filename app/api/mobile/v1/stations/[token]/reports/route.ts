import { NextResponse } from "next/server";
import { createContentReport } from "@/lib/community-safety";
import { jsonError, parseJson } from "@/lib/http";
import { optionalMobileUser } from "@/lib/mobile-community";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";
import { reportSchema } from "@/lib/validation";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    await rateLimit(request, "mobile-v1-content-report", 5, 3600);
    const { token } = await context.params;
    const [station, user] = await Promise.all([
      resolvePublicStation(token, request),
      optionalMobileUser(request),
    ]);
    const data = reportSchema.parse(await parseJson(request));
    const reference = await createContentReport(station, data, { userId: user?.id });
    return NextResponse.json({ ok: true, reference }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
