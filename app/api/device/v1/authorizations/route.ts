import { NextResponse } from "next/server";
import { deviceAuthorizationStartRequestSchema } from "@/packages/contracts/src/device";
import { startDeviceAuthorization } from "@/lib/device-auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "device-v1-authorization-start", 10, 60);
    const input = deviceAuthorizationStartRequestSchema.parse(await parseJson(request));
    return NextResponse.json(await startDeviceAuthorization(input), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
