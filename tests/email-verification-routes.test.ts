import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bearerToken = "B".repeat(43);
const user = { id: "00000000-0000-4000-8000-000000000001", emailVerified: false };
const genericMessage = "If an unverified account exists, a new verification email has been requested.";
const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  configured: vi.fn(),
  issueAndSend: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitByKey: vi.fn(),
  requestByEmail: vi.fn(),
  requireMobileAuth: vi.fn(),
}));

vi.mock("@/lib/email-verification", async () => {
  const { z } = await import("zod");
  return {
    consumeEmailVerificationToken: mocks.consume,
    emailVerificationRequestSchema: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
    emailVerificationResendMessage: "If an unverified account exists, a new verification email has been requested.",
    emailVerificationResendRequestSchema: z.object({ email: z.string().trim().toLowerCase().email().max(254) }),
    issueAndSendEmailVerification: mocks.issueAndSend,
    requestEmailVerificationByEmail: mocks.requestByEmail,
  };
});
vi.mock("@/lib/email-delivery", () => ({ emailDeliveryConfigured: mocks.configured }));
vi.mock("@/lib/mobile-auth", () => ({ requireMobileAuth: mocks.requireMobileAuth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitByKey: mocks.rateLimitByKey }));

import { POST as mobileResend } from "@/app/api/mobile/v1/auth/verification/resend/route";
import { POST as mobileVerify } from "@/app/api/mobile/v1/auth/verification/verify/route";
import { POST as webResend } from "@/app/api/auth/verification/resend/route";
import { HttpError } from "@/lib/http";

function request(path: string, body?: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      ...(path.startsWith("/api/mobile") ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("email verification routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mocks.configured.mockReturnValue(true);
    mocks.requireMobileAuth.mockResolvedValue({ token: bearerToken, user });
    mocks.issueAndSend.mockResolvedValue("SENT");
    mocks.requestByEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the same generic web resend response for every normalized address and applies both limits", async () => {
    const existing = await webResend(request("/api/auth/verification/resend", { email: " Listener@Example.com " }));
    const missing = await webResend(request("/api/auth/verification/resend", { email: "missing@example.com" }));

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    await expect(existing.json()).resolves.toEqual({ ok: true, message: genericMessage });
    await expect(missing.json()).resolves.toEqual({ ok: true, message: genericMessage });
    expect(mocks.requestByEmail).toHaveBeenNthCalledWith(1, "listener@example.com");
    expect(mocks.requestByEmail).toHaveBeenNthCalledWith(2, "missing@example.com");
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "email-verification-resend-ip", 5, 3_600);
    expect(mocks.rateLimitByKey).toHaveBeenCalledTimes(2);
    expect(mocks.rateLimitByKey.mock.calls[0]?.[0]).toBe("email-verification-resend-account");
    expect(mocks.rateLimitByKey.mock.calls[0]?.[2]).toBe(3);
  });

  it("fails every production web resend visibly before account lookup when no provider exists", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.configured.mockReturnValue(false);

    const response = await webResend(request("/api/auth/verification/resend", { email: "missing@example.com" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "EMAIL_DELIVERY_UNAVAILABLE" });
    expect(mocks.requestByEmail).not.toHaveBeenCalled();
  });

  it("applies the account limit before lookup for existing and missing addresses alike", async () => {
    mocks.rateLimitByKey.mockRejectedValueOnce(new HttpError(429, "Too many requests.", "RATE_LIMITED"));

    const response = await webResend(request("/api/auth/verification/resend", { email: "missing@example.com" }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });
    expect(mocks.requestByEmail).not.toHaveBeenCalled();
  });

  it("rate limits authenticated mobile resend by IP and account and surfaces delivery failure", async () => {
    mocks.issueAndSend.mockResolvedValueOnce("FAILED");

    const response = await mobileResend(request("/api/mobile/v1/auth/verification/resend"));

    expect(response.status).toBe(503);
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "mobile-email-verification-resend-ip", 5, 3_600);
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("mobile-email-verification-resend-account", user.id, 3, 3_600);
    expect(mocks.issueAndSend).toHaveBeenCalledWith(user.id);
  });

  it("consumes a mobile token only for its bearer account and returns the mobile contract", async () => {
    mocks.consume.mockResolvedValueOnce(true);

    const response = await mobileVerify(request("/api/mobile/v1/auth/verification/verify", { token: "V".repeat(43) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, verified: true });
    expect(mocks.consume).toHaveBeenCalledWith("V".repeat(43), user.id);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
