import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { clearSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
