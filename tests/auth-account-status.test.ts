import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  hash: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitByKey: vi.fn(),
  jar: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/env", () => ({ env: () => ({
  SESSION_TTL_DAYS: 30,
  APP_URL: "http://localhost:3000",
  APP_ALLOWED_ORIGINS: "",
}) }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.jar, headers: async () => new Headers({ "x-streamtumi-product": "MAIN" }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { currentUser, lockActiveUser, requireApiUser } from "@/lib/auth";
import { POST as login } from "@/app/api/auth/login/route";

const authRow = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  display_name: "Casey Owner",
  role: "USER",
  must_change_password: false,
  show_explicit_content: false,
  explicit_age_attested_at: null,
};

function loginRequest(password = "correct-password") {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "OWNER@EXAMPLE.COM", password }),
  });
}

describe("disabled and forced-change authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jar.get.mockReturnValue({ value: "session-token" });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }));
  });

  it("excludes disabled, deletion-pending, and anonymized users from currentUser", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await expect(currentUser()).resolves.toBeNull();
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toMatch(/u\.disabled_at IS NULL/);
    expect(sql).toMatch(/u\.deletion_requested_at IS NULL/);
    expect(sql).toMatch(/u\.anonymized_at IS NULL/);
  });

  it("blocks ordinary APIs while a temporary password must be replaced", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ ...authRow, must_change_password: true }] });

    await expect(requireApiUser()).rejects.toMatchObject({ status: 403, code: "PASSWORD_CHANGE_REQUIRED" });
  });

  it("verifies the password before rejecting a disabled login with the generic credential error", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: authRow.id,
      password_hash: "stored-hash",
      disabled_at: new Date(),
      deletion_requested_at: null,
      anonymized_at: null,
      must_change_password: false,
    }] });

    const response = await login(loginRequest());

    expect(mocks.compare).toHaveBeenCalledWith("correct-password", "stored-hash");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_CREDENTIALS", error: "Email or password is incorrect." });
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("password-login-account", expect.stringMatching(/^[a-f0-9]{64}$/), 10, 900);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("returns the same error when the password is wrong", async () => {
    mocks.compare.mockResolvedValueOnce(false);
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: authRow.id,
      password_hash: "stored-hash",
      disabled_at: new Date(),
      deletion_requested_at: null,
      anonymized_at: null,
      must_change_password: false,
    }] });

    const response = await login(loginRequest("wrong"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_CREDENTIALS", error: "Email or password is incorrect." });
  });

  it("returns the generic credential error for an account without a password hash", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: authRow.id,
      password_hash: null,
      disabled_at: null,
      deletion_requested_at: null,
      anonymized_at: null,
      must_change_password: false,
    }] });

    const response = await login(loginRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_CREDENTIALS", error: "Email or password is incorrect." });
    expect(mocks.compare).toHaveBeenCalledWith("correct-password", expect.stringMatching(/^\$2b\$12\$/));
  });

  it("creates only a restricted session and signals the forced-change redirect", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        id: authRow.id,
        password_hash: "temporary-hash",
        disabled_at: null,
        deletion_requested_at: null,
        anonymized_at: null,
        must_change_password: true,
      }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const response = await login(loginRequest("temporary-password"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, mustChangePassword: true });
    expect(mocks.query.mock.calls[1][0]).toMatch(/FOR UPDATE/);
    expect(mocks.query.mock.calls[2][0]).toMatch(/INSERT INTO sessions/);
    expect(mocks.jar.set).toHaveBeenCalled();
  });

  it("locks and rechecks account status before creating a session", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        id: authRow.id,
        password_hash: "stored-hash",
        disabled_at: null,
        deletion_requested_at: null,
        anonymized_at: null,
        must_change_password: false,
      }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await login(loginRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO sessions"))).toBe(false);
  });

  it("rejects stale authenticated work after an account becomes inactive", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(lockActiveUser({ query: mocks.query } as never, authRow.id)).rejects.toMatchObject({
      status: 403,
      code: "ACCOUNT_INACTIVE",
    });
    expect(mocks.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
  });
});
