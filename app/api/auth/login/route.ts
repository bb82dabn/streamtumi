import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { assertSameOrigin, jsonError, parseJson, HttpError } from "@/lib/http";
import { createSession, setSessionCookie } from "@/lib/auth";
import { passwordMatches } from "@/lib/password-auth";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "login", 20, 900);
    const data = loginSchema.parse(await parseJson(request));
    await rateLimitByKey("password-login-account", hashToken(`password-login:${data.email}`), 10, 900);
    const result = await query<{ id: string; password_hash: string | null; disabled_at: Date | null; deletion_requested_at: Date | null; anonymized_at: Date | null; must_change_password: boolean }>(
      `SELECT id, password_hash, disabled_at, deletion_requested_at, anonymized_at, must_change_password
         FROM users WHERE lower(btrim(email)) = $1`,
      [data.email],
    );
    const user = result.rows[0];
    if (!(await passwordMatches(data.password, user?.password_hash))) {
      throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    if (user.disabled_at || user.deletion_requested_at || user.anonymized_at) {
      throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    const token = await createSession(user.id, "MAIN");
    await setSessionCookie(token);
    return NextResponse.json({ ok: true, mustChangePassword: user.must_change_password });
  } catch (error) {
    return jsonError(error);
  }
}
