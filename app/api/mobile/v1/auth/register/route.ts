import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { type AuthUser, type UserRole } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { createMobileCredentials, mobileUser } from "@/lib/mobile-auth";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { issueAndSendEmailVerification } from "@/lib/email-verification";
import { assertRegistrationEnabled } from "@/lib/registration-policy";

type RegisterRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  must_change_password: boolean;
  email_verified_at: Date | null;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "register", 10, 900);
    assertRegistrationEnabled();
    const data = registerSchema.parse(await parseJson(request));
    let result;
    try {
      result = await query<RegisterRow>(
        `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)
         RETURNING id, email, display_name, role, must_change_password, email_verified_at`,
        [data.email, data.displayName, await hash(data.password, 12)],
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new HttpError(409, "An account already exists for that email.", "EMAIL_EXISTS");
      }
      throw error;
    }

    const row = result.rows[0];
    const user: AuthUser = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      mustChangePassword: row.must_change_password,
      emailVerified: row.email_verified_at != null,
    };
    let delivery: "SENT" | "FAILED" = "FAILED";
    try {
      delivery = await issueAndSendEmailVerification(row.id) === "SENT" ? "SENT" : "FAILED";
    } catch {
      // Account creation and mobile sign-in remain available if challenge issuance is transiently unavailable.
    }
    const credentials = await createMobileCredentials(row.id);
    return NextResponse.json(
      { ...credentials, user: mobileUser(user), verification: { required: true, delivery } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
