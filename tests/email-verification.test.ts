import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rawToken = "T".repeat(43);
const userId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  deliverEmail: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/crypto")>();
  return { ...original, randomToken: () => rawToken };
});
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/email-delivery", () => ({ deliverEmail: mocks.deliverEmail }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://streamtumi.com" }) }));

import {
  consumeEmailVerificationToken,
  emailVerificationTtlMs,
  issueAndSendEmailVerification,
  issueEmailVerificationChallenge,
  requestEmailVerificationByEmail,
} from "@/lib/email-verification";

describe("email verification challenges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
  });

  it("persists only a SHA-256 hash, expires in 30 minutes, and invalidates older challenges", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ id: userId, email: "listener@example.com", email_verified_at: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const challenge = await issueEmailVerificationChallenge(userId);

    expect(challenge).toEqual({
      token: rawToken,
      email: "listener@example.com",
      expiresAt: new Date("2026-08-18T12:30:00.000Z"),
    });
    expect(emailVerificationTtlMs).toBe(1_800_000);
    expect(String(mocks.clientQuery.mock.calls[1]?.[0])).toContain("invalidated_at = now()");
    const insertValues = mocks.clientQuery.mock.calls[2]?.[1] as unknown[];
    expect(insertValues[1]).toBe(createHash("sha256").update(rawToken).digest("hex"));
    expect(insertValues).not.toContain(rawToken);
  });

  it("sends both universal and app links without changing hash-only storage", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ id: userId, email: "listener@example.com", email_verified_at: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mocks.deliverEmail.mockResolvedValueOnce(undefined);

    await expect(issueAndSendEmailVerification(userId)).resolves.toBe("SENT");

    const message = mocks.deliverEmail.mock.calls[0]?.[0] as { text: string };
    expect(message.text).toContain("https://streamtumi.com/verify-email?token=");
    expect(message.text).toContain("streamtumi://verify-email?token=");
    expect(mocks.clientQuery.mock.calls[2]?.[1]).not.toContain(rawToken);
  });

  it("does not issue a challenge for an already verified account", async () => {
    mocks.clientQuery.mockResolvedValueOnce({
      rows: [{ id: userId, email: "listener@example.com", email_verified_at: new Date() }],
      rowCount: 1,
    });

    await expect(issueAndSendEmailVerification(userId)).resolves.toBe("NOT_REQUIRED");
    expect(mocks.clientQuery).toHaveBeenCalledTimes(1);
    expect(mocks.deliverEmail).not.toHaveBeenCalled();
  });

  it("returns one success under concurrent consumption and updates the user once", async () => {
    let consumed = false;
    let userUpdates = 0;
    let previousLock = Promise.resolve();
    mocks.transaction.mockImplementation(async (work: (client: { query: (sql: string) => Promise<unknown> }) => Promise<unknown>) => {
      let releaseLock: (() => void) | undefined;
      const client = {
        query: async (sql: string) => {
          if (sql.startsWith("SELECT user_id")) return { rows: [{ user_id: userId }], rowCount: 1 };
          if (sql.includes("SELECT id FROM users")) {
            const waitingFor = previousLock;
            previousLock = new Promise<void>((resolve) => { releaseLock = resolve; });
            await waitingFor;
            return { rows: [{ id: userId }], rowCount: 1 };
          }
          if (sql.includes("UPDATE email_verification_tokens") && sql.includes("RETURNING user_id")) {
            if (consumed) return { rows: [], rowCount: 0 };
            consumed = true;
            return { rows: [{ user_id: userId }], rowCount: 1 };
          }
          if (sql.startsWith("UPDATE users")) {
            userUpdates += 1;
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        },
      };
      try {
        return await work(client);
      } finally {
        releaseLock?.();
      }
    });

    const results = await Promise.all([
      consumeEmailVerificationToken(rawToken, userId),
      consumeEmailVerificationToken(rawToken, userId),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(userUpdates).toBe(1);
  });

  it("rejects expired, invalidated, or consumed tokens through one generic claim result", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ user_id: userId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: userId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(consumeEmailVerificationToken(rawToken, userId)).resolves.toBe(false);
    const claimSql = String(mocks.clientQuery.mock.calls[2]?.[0]);
    expect(claimSql).toContain("consumed_at IS NULL");
    expect(claimSql).toContain("invalidated_at IS NULL");
    expect(claimSql).toContain("expires_at > now()");
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE users"))).toBe(false);
  });

  it("does no delivery work for an unknown resend address", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(requestEmailVerificationByEmail("missing@example.com")).resolves.toBeUndefined();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deliverEmail).not.toHaveBeenCalled();
  });
});
