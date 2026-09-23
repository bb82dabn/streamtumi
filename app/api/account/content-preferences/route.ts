import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { contentPreferenceSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const data = contentPreferenceSchema.parse(await parseJson(request));
    const result = await query<{ show_explicit_content: boolean; explicit_age_attested_at: Date | null }>(
      `UPDATE users
          SET show_explicit_content = $2,
              explicit_age_attested_at = CASE
                WHEN $2 = true THEN COALESCE(explicit_age_attested_at, now())
                ELSE explicit_age_attested_at
              END,
              version = version + 1,
              updated_at = now()
        WHERE id = $1
        RETURNING show_explicit_content, explicit_age_attested_at`,
      [user.id, data.showExplicitContent],
    );
    return NextResponse.json({
      showExplicitContent: result.rows[0].show_explicit_content,
      explicitAgeAttestedAt: result.rows[0].explicit_age_attested_at?.toISOString() ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
