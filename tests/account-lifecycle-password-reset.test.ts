import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rawToken = "P".repeat(43);
const userId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  deliverEmail: vi.fn(),
  hash: vi.fn(async () => "bcrypt-reset-hash"),
  query: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitByKey: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/crypto")>();
  return { ...original, randomToken: () => rawToken };
});
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/email-delivery", () => ({ deliverEmail: mocks.deliverEmail }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://streamtumi.com" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitByKey: mocks.rateLimitByKey }));

import { POST as forgotPassword } from "@/app/api/mobile/v1/auth/password/forgot/route";
import {
  issuePasswordResetChallenge,
  passwordResetRequestMessage,
  passwordResetTtlMs,
  requestPasswordResetByEmail,
  resetPasswordWithToken,
} from "@/lib/password-reset";

describe("password reset lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
  });

  it("stores only a one-use hash and sends 30-minute mobile and web links", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ id: userId, email: "listener@example.com" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const challenge = await issuePasswordResetChallenge("listener@example.com");

    expect(passwordResetTtlMs).toBe(1_800_000);
    expect(challenge?.expiresAt).toEqual(new Date("2026-08-18T12:30:00.000Z"));
    const values = mocks.clientQuery.mock.calls[2]?.[1] as unknown[];
    expect(values[1]).toBe(createHash("sha256").update(rawToken).digest("hex"));
    expect(values).not.toContain(rawToken);

    mocks.clientQuery.mockReset()
      .mockResolvedValueOnce({ rows: [{ id: userId, email: "listener@example.com" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mocks.deliverEmail.mockResolvedValueOnce(undefined);
    await requestPasswordResetByEmail("listener@example.com");
    const message = mocks.deliverEmail.mock.calls[0]?.[0] as { text: string };
    expect(message.text).toContain("https://streamtumi.com/reset-password?token=");
    expect(message.text).toContain("streamtumi://reset-password?token=");
  });

  it("returns the same accepted response for an unknown password account", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const request = new Request("https://streamtumi.test/api/mobile/v1/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "missing@example.com" }),
    });

    const response = await forgotPassword(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, message: passwordResetRequestMessage });
    expect(mocks.deliverEmail).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("claims the token atomically, uses bcrypt cost 12, and revokes every credential family", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ user_id: userId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: userId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ user_id: userId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(resetPasswordWithToken(rawToken, "new-private-password")).resolves.toBe(true);

    expect(mocks.hash).toHaveBeenCalledWith("new-private-password", 12);
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain("consumed_at IS NULL");
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain("expires_at > now()");
    expect(String(mocks.clientQuery.mock.calls[3]?.[0])).toContain("must_change_password = false");
    expect(String(mocks.clientQuery.mock.calls[4]?.[0])).toContain("DELETE FROM sessions");
    expect(String(mocks.clientQuery.mock.calls[5]?.[0])).toContain("device_sessions");
    expect(String(mocks.clientQuery.mock.calls[5]?.[0])).toContain("authentication_method = 'PASSWORD'");
    expect(String(mocks.clientQuery.mock.calls[6]?.[0])).toContain("mobile_refresh_tokens");
    expect(String(mocks.clientQuery.mock.calls[7]?.[0])).toContain("moderation_service_tokens");
  });

  it("does not change a password when the one-use claim loses a race", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ user_id: userId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: userId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(resetPasswordWithToken(rawToken, "new-private-password")).resolves.toBe(false);
    expect(mocks.clientQuery).toHaveBeenCalledTimes(3);
  });
});
