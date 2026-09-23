import { NextResponse } from "next/server";
import { requireDeviceAuth, revokeCurrentDevice } from "@/lib/device-auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await requireDeviceAuth(request);
    await revokeCurrentDevice(identity.sessionId);
    return NextResponse.json({ ok: true, revoked: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = DELETE;
