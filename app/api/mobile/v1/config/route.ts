import { NextResponse } from "next/server";
import { registrationEnabled } from "@/lib/registration-policy";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { apiVersion: 1, registrationEnabled: registrationEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
