import { NextResponse } from "next/server";
import { clearSession, requirePasswordChangeUser } from "@/lib/auth";
import { replaceTemporaryPassword } from "@/lib/account";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requirePasswordChangeUser();
    const data = passwordChangeSchema.parse(await parseJson(request));
    await replaceTemporaryPassword(user.id, data.currentPassword, data.newPassword);
    await clearSession();
    return NextResponse.json({ ok: true, loginRequired: true });
  } catch (error) {
    return jsonError(error);
  }
}
