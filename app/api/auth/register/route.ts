import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { query } from "@/lib/db";
import { assertSameOrigin, jsonError, parseJson, HttpError } from "@/lib/http";
import { createSession, setSessionCookie } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { issueAndSendEmailVerification } from "@/lib/email-verification";
import { assertRegistrationEnabled } from "@/lib/registration-policy";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "register", 10, 900);
    assertRegistrationEnabled();
    const data = registerSchema.parse(await parseJson(request));
    let result;
    try {
      result = await query<{ id: string }>(
        "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [data.email, data.displayName, await hash(data.password, 12)],
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new HttpError(409, "An account already exists for that email.", "EMAIL_EXISTS");
      }
      throw error;
    }
    let delivery: "SENT" | "FAILED" = "FAILED";
    try {
      delivery = await issueAndSendEmailVerification(result.rows[0].id) === "SENT" ? "SENT" : "FAILED";
    } catch {
      // The account can request a new challenge after a transient verification failure.
    }
    const token = await createSession(result.rows[0].id, "MAIN");
    await setSessionCookie(token);
    return NextResponse.json({ ok: true, verification: { required: true, delivery } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
