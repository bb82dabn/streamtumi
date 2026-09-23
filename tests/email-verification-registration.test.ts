import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  hash: vi.fn(),
  issueAndSend: vi.fn(),
  query: vi.fn(),
  rateLimit: vi.fn(),
  requestSessionAudience: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/auth", () => ({
  createSession: mocks.createSession,
  requestSessionAudience: mocks.requestSessionAudience,
  setSessionCookie: mocks.setSessionCookie,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/email-verification", () => ({ issueAndSendEmailVerification: mocks.issueAndSend }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "http://localhost:3000", REGISTRATION_ENABLED: true }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { POST as register } from "@/app/api/auth/register/route";

describe("web registration verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("password-hash");
    mocks.query.mockResolvedValue({ rows: [{ id: userId }], rowCount: 1 });
    mocks.createSession.mockResolvedValue("session-token");
    mocks.requestSessionAudience.mockResolvedValue("MAIN");
  });

  it("keeps the account and web session usable when challenge delivery is unavailable", async () => {
    mocks.issueAndSend.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await register(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Listener", email: "listener@example.com", password: "correct-password" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      verification: { required: true, delivery: "FAILED" },
    });
    expect(mocks.createSession).toHaveBeenCalledWith(userId, "MAIN");
    expect(mocks.setSessionCookie).toHaveBeenCalledWith("session-token");
  });
});
