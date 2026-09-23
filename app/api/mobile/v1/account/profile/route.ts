import { NextResponse } from "next/server";
import { z } from "zod";
import { communityProfile, updateCommunityDisplayName } from "@/lib/community-profile";
import { jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { requireVerifiedMobileUser } from "@/lib/mobile-community";
import { rateLimit } from "@/lib/rate-limit";

const updateProfileSchema = z.object({
  displayName: z.string().max(128),
  expectedVersion: z.number().int().positive(),
});

export async function GET(request: Request) {
  try {
    await rateLimit(request, "mobile-v1-profile-read", 120, 60);
    const { user } = await requireMobileAuth(request);
    return NextResponse.json(
      { profile: await communityProfile(user.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await rateLimit(request, "mobile-v1-profile-update", 20, 60);
    const user = await requireVerifiedMobileUser(request);
    const input = updateProfileSchema.parse(await parseJson(request));
    return NextResponse.json(
      { profile: await updateCommunityDisplayName(user.id, input.displayName, input.expectedVersion) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
