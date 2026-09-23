import { NextResponse } from "next/server";
import { type AuthUser, type UserRole } from "@/lib/auth";
import { hashToken } from "@/lib/crypto";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { createMobileCredentials, mobileUser } from "@/lib/mobile-auth";
import { passwordMatches } from "@/lib/password-auth";
import { rateLimit, rateLimitByKey } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

type LoginRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  password_hash: string | null;
  disabled_at: Date | null;
  deletion_requested_at: Date | null;
  anonymized_at: Date | null;
  must_change_password: boolean;
  email_verified_at: Date | null;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "login", 20, 900);
    const data = loginSchema.parse(await parseJson(request));
    await rateLimitByKey("password-login-account", hashToken(`password-login:${data.email}`), 10, 900);
    const result = await query<LoginRow>(
      `SELECT id, email, display_name, role, password_hash, disabled_at, deletion_requested_at,
              anonymized_at, must_change_password, email_verified_at
         FROM users WHERE lower(btrim(email)) = $1`,
      [data.email],
    );
    const row = result.rows[0];
    if (!(await passwordMatches(data.password, row?.password_hash))) {
      throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    if (row.disabled_at || row.deletion_requested_at || row.anonymized_at) {
      throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    if (row.must_change_password) {
      throw new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
    }

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      mustChangePassword: false,
      emailVerified: row.email_verified_at != null,
    };
    const credentials = await createMobileCredentials(row.id);
    return NextResponse.json(
      { ...credentials, user: mobileUser(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
