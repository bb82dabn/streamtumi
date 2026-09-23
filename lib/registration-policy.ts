import "server-only";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";

export const registrationDisabledMessage = "Registration is unavailable. Sign in with an existing account.";

export function registrationEnabled(): boolean {
  return env().REGISTRATION_ENABLED;
}

export function assertRegistrationEnabled(): void {
  if (!registrationEnabled()) {
    throw new HttpError(403, registrationDisabledMessage, "REGISTRATION_DISABLED");
  }
}
