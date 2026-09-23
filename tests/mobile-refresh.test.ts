import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oldRefreshToken = "R".repeat(43);
const accessToken = "A".repeat(43);
const replacementRefreshToken = "N".repeat(43);
const currentAccessToken = "C".repeat(43);
const userId = "00000000-0000-4000-8000-000000000001";
const familyId = "00000000-0000-4000-8000-000000000002";
const replacementId = "00000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  query: vi.fn(),
  randomToken: vi.fn(),
  rateLimit: vi.fn(),
  resolveSessionUser: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  MOBILE_ACCESS_TTL_MS: 15 * 60 * 1000,
  resolveSessionUser: mocks.resolveSessionUser,
}));
vi.mock("@/lib/crypto", () => ({
  hashToken: (token: string) => `sha256:${token}`,
  randomToken: mocks.randomToken,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { POST as logout } from "@/app/api/mobile/v1/auth/logout/route";
import { POST as refresh } from "@/app/api/mobile/v1/auth/refresh/route";
import { rotateMobileRefreshToken } from "@/lib/mobile-auth";

const activeRefreshRow = {
  id: "00000000-0000-4000-8000-000000000004",
  family_id: familyId,
  user_id: userId,
  expires_at: new Date("2026-09-01T00:00:00.000Z"),
  consumed_at: null,
  revoked_at: null,
  authenticated_at: new Date("2026-08-18T11:55:00.000Z"),
  email: "listener@example.com",
  display_name: "Listener",
  role: "USER",
  must_change_password: false,
  email_verified_at: new Date("2026-08-01T00:00:00.000Z"),
  disabled_at: null,
  deletion_requested_at: null,
  anonymized_at: null,
};

function refreshRequest(refreshToken: string = oldRefreshToken) {
  return new Request("https://streamtumi.test/api/mobile/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}

describe("mobile refresh token rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    mocks.randomToken
      .mockReturnValueOnce(accessToken)
      .mockReturnValueOnce(replacementRefreshToken);
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => (
      work({ query: mocks.clientQuery })
    ));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rotates into a 15-minute MOBILE access token and a 30-day hashed refresh token", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [activeRefreshRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: replacementId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const response = await refresh(refreshRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: accessToken,
      accessExpiresAt: "2026-08-18T12:15:00.000Z",
      refreshToken: replacementRefreshToken,
      refreshExpiresAt: "2026-09-17T12:00:00.000Z",
      user: {
        id: userId,
        email: "listener@example.com",
        displayName: "Listener",
        role: "USER",
        emailVerified: true,
      },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(String(mocks.clientQuery.mock.calls[0]?.[0])).toContain("FOR UPDATE OF r, u");
    expect(mocks.clientQuery.mock.calls[0]?.[1]).toEqual([`sha256:${oldRefreshToken}`]);
    expect(mocks.clientQuery.mock.calls[1]?.[1]?.[2]).toBe(`sha256:${replacementRefreshToken}`);
    expect(mocks.clientQuery.mock.calls[1]?.[1]?.[3]).toEqual(new Date("2026-09-17T12:00:00.000Z"));
    expect(mocks.clientQuery.mock.calls[1]?.[1]?.[4]).toEqual(new Date("2026-08-18T11:55:00.000Z"));
    expect(String(mocks.clientQuery.mock.calls[3]?.[0])).toContain("'MOBILE'");
    expect(mocks.clientQuery.mock.calls[3]?.[1]?.[1]).toBe(`sha256:${accessToken}`);
    expect(mocks.clientQuery.mock.calls[3]?.[1]?.[2]).toEqual(new Date("2026-08-18T12:15:00.000Z"));
    expect(mocks.clientQuery.mock.calls[3]?.[1]?.[4]).toEqual(new Date("2026-08-18T11:55:00.000Z"));
    expect(mocks.clientQuery.mock.calls.flatMap((call) => call[1] ?? [])).not.toContain(oldRefreshToken);
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "mobile-auth-refresh", 60, 900);
  });

  it("rejects anything other than one exact 43-character refresh token", async () => {
    for (const token of ["R".repeat(42), "R".repeat(44), `${"R".repeat(42)}!`]) {
      const response = await refresh(refreshRequest(token));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    const extraField = await refresh(new Request("https://streamtumi.test/api/mobile/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: oldRefreshToken, token: accessToken }),
    }));
    expect(extraField.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("commits family and MOBILE-session revocation when a consumed token is replayed", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ ...activeRefreshRow, consumed_at: new Date() }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const response = await refresh(refreshRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "REFRESH_TOKEN_REUSED" });
    expect(String(mocks.clientQuery.mock.calls[1]?.[0])).toContain("SET revoked_at");
    expect(mocks.clientQuery.mock.calls[1]?.[1]).toEqual([userId, familyId]);
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain("audience = 'MOBILE'");
    expect(mocks.clientQuery.mock.calls[2]?.[1]).toEqual([userId, familyId]);
  });

  it("serializes a same-token race and treats the loser as replay", async () => {
    let consumedAt: Date | null = null;
    let transactionTail: Promise<unknown> = Promise.resolve();
    mocks.randomToken
      .mockReset()
      .mockReturnValueOnce("A".repeat(43))
      .mockReturnValueOnce("B".repeat(43))
      .mockReturnValueOnce("C".repeat(43))
      .mockReturnValueOnce("D".repeat(43));
    mocks.transaction.mockImplementation((work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => {
      const result = transactionTail.then(() => work({ query: mocks.clientQuery }));
      transactionTail = result.then(() => undefined, () => undefined);
      return result;
    });
    mocks.clientQuery.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.includes("SELECT r.id")) return { rows: [{ ...activeRefreshRow, consumed_at: consumedAt }], rowCount: 1 };
      if (sql.includes("INSERT INTO mobile_refresh_tokens")) return { rows: [{ id: replacementId }], rowCount: 1 };
      if (sql.includes("SET consumed_at")) consumedAt = new Date();
      return { rows: [], rowCount: 1 };
    });

    const results = await Promise.allSettled([
      rotateMobileRefreshToken(oldRefreshToken),
      rotateMobileRefreshToken(oldRefreshToken),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "REFRESH_TOKEN_REUSED" } });
    expect(mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).includes("SELECT r.id"))).toHaveLength(2);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("SET revoked_at"))).toBe(true);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("audience = 'MOBILE'"))).toBe(true);
  });

  it.each([
    ["disabled", { disabled_at: new Date() }, "ACCOUNT_INACTIVE"],
    ["deletion pending", { deletion_requested_at: new Date() }, "ACCOUNT_INACTIVE"],
    ["anonymized", { anonymized_at: new Date() }, "ACCOUNT_INACTIVE"],
    ["must change password", { must_change_password: true }, "PASSWORD_CHANGE_REQUIRED"],
  ])("blocks and revokes a %s account", async (_label, status, code) => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ ...activeRefreshRow, ...status }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const response = await refresh(refreshRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(String(mocks.clientQuery.mock.calls[1]?.[0])).toContain("SET revoked_at");
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain("audience = 'MOBILE'");
  });
});

describe("mobile refresh-family logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => (
      work({ query: mocks.clientQuery })
    ));
  });

  it("revokes the supplied family and current access without exposing refresh credentials in the URL", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ user_id: userId, family_id: familyId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const request = new Request("https://streamtumi.test/api/mobile/v1/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: oldRefreshToken }),
    });

    const response = await logout(request);

    expect(response.status).toBe(200);
    expect(request.url).not.toContain(oldRefreshToken);
    expect(mocks.clientQuery.mock.calls[0]?.[1]).toEqual([`sha256:${oldRefreshToken}`]);
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain("audience = 'MOBILE'");
    expect(String(mocks.clientQuery.mock.calls[3]?.[0])).toContain("audience = 'MOBILE'");
    expect(mocks.clientQuery.mock.calls[3]?.[1]).toEqual([`sha256:${currentAccessToken}`]);
  });
});
