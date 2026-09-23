import { NextResponse } from "next/server";
import { listUserBlocks } from "@/lib/community-safety";
import { jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    await rateLimit(request, "mobile-v1-community-blocks-read", 120, 60);
    const { user } = await requireMobileAuth(request);
    return NextResponse.json({ blocks: await listUserBlocks(user.id) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
