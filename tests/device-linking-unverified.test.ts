import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("temporary unverified TV linking", () => {
  it("keeps web and mobile activation available without email delivery", async () => {
    const [web, page, mobile, account] = await Promise.all([
      source("components/device-activation.tsx"),
      source("app/activate/page.tsx"),
      source("apps/mobile/app/activate-device.tsx"),
      source("apps/mobile/app/(tabs)/account.tsx"),
    ]);
    expect(web).not.toContain("Verify your email before linking");
    expect(page).not.toContain("emailVerified=");
    expect(mobile).not.toContain("Email verification is required before linking");
    expect(account).not.toContain('disabled={!session.emailVerified} icon="tv-outline"');
  });

  it("uses device approval without a verification wrapper", async () => {
    const [webRoute, mobileRoute, service] = await Promise.all([
      source("app/api/device/v1/activate/route.ts"),
      source("app/api/mobile/v1/account/devices/activate/route.ts"),
      source("lib/device-auth.ts"),
    ]);
    expect(webRoute).toContain("approveDeviceUser");
    expect(mobileRoute).toContain("approveDeviceUser");
    expect(service).not.toContain("Verify your email before linking a device.");
    expect(service).not.toContain("Verify your email before signing in on Roku.");
  });
});
