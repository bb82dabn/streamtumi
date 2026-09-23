import type { AuthUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";

export async function optionalMobileUser(request: Request): Promise<AuthUser | null> {
  if (!request.headers.has("authorization")) return null;
  return (await requireMobileAuth(request)).user;
}

export async function requireVerifiedMobileUser(request: Request): Promise<AuthUser> {
  const { user } = await requireMobileAuth(request);
  if (user.emailVerified !== true) {
    throw new HttpError(403, "Verify your email before joining station communities.", "EMAIL_VERIFICATION_REQUIRED");
  }
  return user;
}
