import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { createServiceToken, listServiceTokens } from "@/lib/moderation";
import { moderationTokenSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ tokens: await listServiceTokens() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const data = moderationTokenSchema.parse(await parseJson(request));
    return NextResponse.json(await createServiceToken(data.name, data.scopes, user.id), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
