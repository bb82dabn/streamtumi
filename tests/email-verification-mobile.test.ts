import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("mobile email verification UI", () => {
  it("accepts deep-link tokens, verifies, refreshes me, and gates account community actions", async () => {
    const [screen, provider, account, appConfig] = await Promise.all([
      readFile(new URL("../apps/mobile/app/verify-email.tsx", import.meta.url), "utf8"),
      readFile(new URL("../apps/mobile/providers/AuthProvider.tsx", import.meta.url), "utf8"),
      readFile(new URL("../apps/mobile/app/(tabs)/account.tsx", import.meta.url), "utf8"),
      readFile(new URL("../apps/mobile/app.config.ts", import.meta.url), "utf8"),
    ]);

    expect(screen).toContain("useLocalSearchParams");
    expect(screen).toContain("verifyEmail(linkedToken)");
    expect(screen).toContain("resendEmailVerification");
    expect(provider).toContain("/api/mobile/v1/auth/verification/verify");
    expect(provider).toContain("await refreshSession()");
    expect(provider).toContain("/api/mobile/v1/auth/me");
    expect(account).toContain("Email verification required");
    expect(account).toContain('<SettingRow icon="tv-outline" title="Link a TV device"');
    expect(account).not.toContain('disabled={!session.emailVerified} icon="tv-outline" title="Link a TV device"');
    expect(appConfig).toContain('{ pathPrefix: "/verify-email" }');
  });
});
