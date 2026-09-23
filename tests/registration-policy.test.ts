import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMobileCredentials: vi.fn(),
  createSession: vi.fn(),
  hash: vi.fn(),
  issueAndSend: vi.fn(),
  query: vi.fn(),
  rateLimit: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.createSession, setSessionCookie: mocks.setSessionCookie }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/email-verification", () => ({ issueAndSendEmailVerification: mocks.issueAndSend }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "http://localhost:3000", REGISTRATION_ENABLED: false }) }));
vi.mock("@/lib/mobile-auth", () => ({ createMobileCredentials: mocks.createMobileCredentials, mobileUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { POST as registerWeb } from "@/app/api/auth/register/route";
import { POST as registerMobile } from "@/app/api/mobile/v1/auth/register/route";

function registrationRequest(path: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Listener", email: "listener@example.com", password: "correct-password" }),
  });
}

describe("disabled password registration", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["web", registerWeb, "/api/auth/register"],
    ["mobile", registerMobile, "/api/mobile/v1/auth/register"],
  ])("rejects %s registration before account side effects", async (_name, handler, path) => {
    const response = await handler(registrationRequest(path));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Registration is unavailable. Sign in with an existing account.",
      code: "REGISTRATION_DISABLED",
    });
    expect(mocks.rateLimit).toHaveBeenCalledOnce();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.issueAndSend).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    expect(mocks.createMobileCredentials).not.toHaveBeenCalled();
  });
});
