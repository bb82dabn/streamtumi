import { NextResponse } from "next/server";
import { listLinkedDevices } from "@/lib/device-auth";
import { jsonError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimitByKey } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-v1-linked-devices-read", user.id, 60, 60);
    return NextResponse.json({ devices: await listLinkedDevices(user.id) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
