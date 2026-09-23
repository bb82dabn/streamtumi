import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("registration policy user interfaces", () => {
  it("gates web registration entry points and direct registration navigation", async () => {
    const [home, guide, login, register, form] = await Promise.all([
      source("app/page.tsx"),
      source("app/guide/page.tsx"),
      source("app/login/page.tsx"),
      source("app/register/page.tsx"),
      source("components/auth-form.tsx"),
    ]);

    expect(home).toContain("canRegister && <Link");
    expect(home).toContain('canRegister ? "/register" : "/login"');
    expect(guide).toContain("canRegister && <Link");
    expect(login).toContain("registrationEnabled={registrationEnabled()}");
    expect(form).toContain('(mode === "register" || registrationEnabled)');
    expect(register).toContain("Registration unavailable");
    expect(register).toContain("if (!registrationEnabled())");
    expect(register).toContain("Sign in");
  });

  it("loads mobile capabilities conservatively and gates all registration entry points", async () => {
    const [provider, form, screen, account, fans] = await Promise.all([
      source("apps/mobile/providers/AuthProvider.tsx"),
      source("apps/mobile/components/AuthForm.tsx"),
      source("apps/mobile/components/AuthScreen.tsx"),
      source("apps/mobile/app/(tabs)/account.tsx"),
      source("apps/mobile/app/(tabs)/fans.tsx"),
    ]);

    expect(provider).toContain('requestJson("/api/mobile/v1/config", mobileConfigSchema');
    expect(provider).toContain("useState(false)");
    expect(form).toContain('mode === "register" && registrationEnabled');
    expect(form).toContain("(registering || registrationEnabled)");
    expect(screen).toContain("Registration unavailable");
    expect(screen).toContain('router.replace("/login")');
    expect(account).toContain("registrationEnabled ? <Pressable");
    expect(fans).toContain("registrationEnabled ? <Pressable");
  });
});
