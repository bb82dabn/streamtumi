import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { requestMobileAccountDeletion } from "@/lib/mobile-account";
import { rateLimitByKey } from "@/lib/rate-limit";
import { emailSchema } from "@/lib/validation";

const deletionRequestSchema = z.object({
  confirmationEmail: emailSchema,
  currentPassword: z.string().min(1).max(128),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-account-deletion", user.id, 5, 900);
    const input = deletionRequestSchema.parse(await parseJson(request));
    await requestMobileAccountDeletion(
      user.id,
      input.confirmationEmail,
      input.currentPassword,
    );
    return NextResponse.json(
      { ok: true, deletionRequested: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
