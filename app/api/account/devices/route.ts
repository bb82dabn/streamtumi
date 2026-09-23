import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listLinkedDevices } from "@/lib/device-auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ devices: await listLinkedDevices(user.id) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
