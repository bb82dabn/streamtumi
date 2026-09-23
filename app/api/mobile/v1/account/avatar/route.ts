import { NextResponse } from "next/server";
import { z } from "zod";
import { createAvatarVariants, readAvatarUpload } from "@/lib/avatar-image";
import { deleteCommunityAvatar, updateCommunityAvatar } from "@/lib/community-profile";
import { jsonError } from "@/lib/http";
import { requireVerifiedMobileUser } from "@/lib/mobile-community";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function expectedVersion(request: Request): number {
  return z.coerce.number().int().positive().parse(new URL(request.url).searchParams.get("expectedVersion"));
}

export async function PUT(request: Request) {
  try {
    await rateLimit(request, "mobile-v1-avatar-update", 10, 60);
    const user = await requireVerifiedMobileUser(request);
    const version = expectedVersion(request);
    const upload = await readAvatarUpload(request);
    const variants = await createAvatarVariants(upload.body, upload.contentType);
    return NextResponse.json(
      { profile: await updateCommunityAvatar(user.id, version, variants) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await rateLimit(request, "mobile-v1-avatar-delete", 10, 60);
    const user = await requireVerifiedMobileUser(request);
    return NextResponse.json(
      { profile: await deleteCommunityAvatar(user.id, expectedVersion(request)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
