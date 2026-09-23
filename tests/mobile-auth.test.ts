import { beforeEach, describe, expect, it, vi } from "vitest";

const bearerToken = "A".repeat(43);
const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  hash: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitByKey: vi.fn(),
  issueAndSendEmailVerification: vi.fn(),
  jar: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/crypto", () => ({
  randomToken: () => bearerToken,
  hashToken: (token: string) => `hash:${token}`,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/email-verification", () => ({ issueAndSendEmailVerification: mocks.issueAndSendEmailVerification }));
vi.mock("@/lib/env", () => ({ env: () => ({
  SESSION_TTL_DAYS: 30,
  APP_URL: "http://localhost:3000",
  APP_ALLOWED_ORIGINS: "",
  REGISTRATION_ENABLED: true,
}) }));
vi.mock("next/headers", () => ({
  cookies: async () => mocks.jar,
  headers: async () => new Headers({ "x-streamtumi-product": "MAIN" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { currentUser } from "@/lib/auth";
import { parseMobileBearerToken } from "@/lib/mobile-auth";
import { POST as login } from "@/app/api/mobile/v1/auth/login/route";
import { POST as register } from "@/app/api/mobile/v1/auth/register/route";
import { GET as me } from "@/app/api/mobile/v1/auth/me/route";
import { POST as logout } from "@/app/api/mobile/v1/auth/logout/route";

const userId = "00000000-0000-4000-8000-000000000001";
const databaseUser = {
  id: userId,
  email: "owner@example.com",
  display_name: "Casey Owner",
  role: "USER",
  password_hash: "stored-password-hash",
  disabled_at: null,
  deletion_requested_at: null,
  anonymized_at: null,
  must_change_password: false,
  email_verified_at: new Date("2026-08-01T00:00:00.000Z"),
  show_explicit_content: false,
  explicit_age_attested_at: null,
};
const responseUser = {
  id: userId,
  email: "owner@example.com",
  displayName: "Casey Owner",
  role: "USER",
  emailVerified: true,
};

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000/api/mobile/v1/auth/${path}`, init);
}

function loginRequest() {
  return request("login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "OWNER@EXAMPLE.COM", password: "correct-password" }),
  });
}

describe("mobile bearer parsing and audience isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }));
    mocks.issueAndSendEmailVerification.mockResolvedValue("SENT");
  });

  it("accepts only one exact issued-token bearer credential", () => {
    expect(parseMobileBearerToken(`Bearer ${bearerToken}`)).toBe(bearerToken);
    expect(parseMobileBearerToken(`bearer ${bearerToken}`)).toBe(bearerToken);
    expect(parseMobileBearerToken(null)).toBeNull();
    expect(parseMobileBearerToken(`Bearer  ${bearerToken}`)).toBeNull();
    expect(parseMobileBearerToken(`Bearer ${bearerToken} `)).toBeNull();
    expect(parseMobileBearerToken("Bearer short-token")).toBeNull();
    expect(parseMobileBearerToken(`Basic ${bearerToken}`)).toBeNull();
    expect(parseMobileBearerToken(`Bearer ${bearerToken}, Bearer ${bearerToken}`)).toBeNull();
  });

  it("never lets a cookie authenticate a mobile route", async () => {
    mocks.jar.get.mockReturnValue({ value: bearerToken });

    const response = await me(request("me"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "A valid bearer token is required.",
      code: "UNAUTHENTICATED",
    });
    expect(mocks.jar.get).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("resolves bearer credentials only against the MOBILE audience", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [databaseUser], rowCount: 1 });

    const response = await me(request("me", {
      headers: { Authorization: `Bearer ${bearerToken}`, Cookie: `cl_session=${bearerToken}` },
    }));

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0][1]).toEqual([`hash:${bearerToken}`, "MOBILE"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("s.audience = $2");
    expect(mocks.jar.get).not.toHaveBeenCalled();
  });

  it("keeps existing cookie resolution on the web request audience", async () => {
    mocks.jar.get.mockReturnValue({ value: bearerToken });
    mocks.query.mockResolvedValueOnce({ rows: [databaseUser], rowCount: 1 });

    await expect(currentUser()).resolves.toMatchObject({ id: userId });

    expect(mocks.query.mock.calls[0][1]).toEqual([`hash:${bearerToken}`, "MAIN"]);
  });
});

describe("mobile account enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }));
    mocks.issueAndSendEmailVerification.mockResolvedValue("SENT");
  });

  it("returns the generic credential error for an inactive account after checking its password", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.query.mockResolvedValueOnce({ rows: [{ ...databaseUser, disabled_at: new Date() }], rowCount: 1 });

    const response = await login(loginRequest());

    expect(mocks.compare).toHaveBeenCalledWith("correct-password", "stored-password-hash");
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("password-login-account", "hash:password-login:owner@example.com", 10, 900);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects temporary-password accounts without issuing a mobile session", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.query.mockResolvedValueOnce({ rows: [{ ...databaseUser, must_change_password: true }], rowCount: 1 });

    const response = await login(loginRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("excludes inactive users when resolving an otherwise valid mobile token", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await me(request("me", { headers: { Authorization: `Bearer ${bearerToken}` } }));

    expect(response.status).toBe(401);
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("u.disabled_at IS NULL");
    expect(sql).toContain("u.deletion_requested_at IS NULL");
    expect(sql).toContain("u.anonymized_at IS NULL");
  });

  it("rejects a forced-change session from authenticated mobile routes", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ ...databaseUser, must_change_password: true }], rowCount: 1 });

    const response = await me(request("me", { headers: { Authorization: `Bearer ${bearerToken}` } }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  });
});

describe("mobile auth response contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }));
    mocks.issueAndSendEmailVerification.mockResolvedValue("SENT");
  });

  it("logs in with an opaque mobile token and user without setting a cookie", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.query
      .mockResolvedValueOnce({ rows: [databaseUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ must_change_password: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const response = await login(loginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: bearerToken,
      accessExpiresAt: expect.any(String),
      refreshToken: bearerToken,
      refreshExpiresAt: expect.any(String),
      user: responseUser,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.jar.set).not.toHaveBeenCalled();
    expect(String(mocks.query.mock.calls[2][0])).toContain("'MOBILE'");
    expect(mocks.query.mock.calls[2][1][1]).toBe(`hash:${bearerToken}`);
    expect(new Date(mocks.query.mock.calls[2][1][2] as Date).getTime() - Date.now()).toBeGreaterThanOrEqual(899_000);
    expect(mocks.query.mock.calls[3][1][2]).toBe(`hash:${bearerToken}`);
    expect(new Date(mocks.query.mock.calls[3][1][3] as Date).getTime() - Date.now()).toBeGreaterThanOrEqual(30 * 86_400_000 - 1_000);
  });

  it("registers with the shared schema and returns an unverified user plus mobile token", async () => {
    mocks.hash.mockResolvedValueOnce("new-password-hash");
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ ...databaseUser, email_verified_at: null, password_hash: undefined }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ must_change_password: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const registerRequest = request("register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Casey Owner",
        email: "OWNER@EXAMPLE.COM",
        password: "correct-password",
      }),
    });

    const response = await register(registerRequest);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      token: bearerToken,
      accessExpiresAt: expect.any(String),
      refreshToken: bearerToken,
      refreshExpiresAt: expect.any(String),
      user: { ...responseUser, emailVerified: false },
      verification: { required: true, delivery: "SENT" },
    });
    expect(mocks.query.mock.calls[0][1]).toEqual(["owner@example.com", "Casey Owner", "new-password-hash"]);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.jar.set).not.toHaveBeenCalled();
    expect(mocks.issueAndSendEmailVerification).toHaveBeenCalledWith(userId);
  });

  it("keeps mobile registration usable when verification delivery fails", async () => {
    mocks.hash.mockResolvedValueOnce("new-password-hash");
    mocks.issueAndSendEmailVerification.mockResolvedValueOnce("FAILED");
    mocks.query
      .mockResolvedValueOnce({ rows: [{ ...databaseUser, email_verified_at: null, password_hash: undefined }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ must_change_password: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const response = await register(request("register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Casey Owner", email: "owner@example.com", password: "correct-password" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      token: bearerToken,
      user: { emailVerified: false },
      verification: { required: true, delivery: "FAILED" },
    });
  });

  it("returns the mobile user from me and revokes its access token and refresh family on logout", async () => {
    const familyId = "00000000-0000-4000-8000-000000000099";
    mocks.query
      .mockResolvedValueOnce({ rows: [databaseUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ user_id: userId, family_id: familyId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const authenticated = { headers: { Authorization: `Bearer ${bearerToken}` } };

    const meResponse = await me(request("me", authenticated));
    const logoutResponse = await logout(request("logout", {
      method: "POST",
      headers: { ...authenticated.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: bearerToken }),
    }));

    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toEqual({ user: responseUser });
    expect(logoutResponse.status).toBe(200);
    await expect(logoutResponse.json()).resolves.toEqual({ ok: true });
    expect(String(mocks.query.mock.calls[2][0])).toContain("mobile_refresh_tokens");
    expect(mocks.query.mock.calls[2][1]).toEqual([userId, familyId]);
    expect(String(mocks.query.mock.calls[3][0])).toContain("audience = 'MOBILE'");
    expect(mocks.query.mock.calls[3][1]).toEqual([userId, familyId]);
    expect(String(mocks.query.mock.calls[4][0])).toContain("audience = 'MOBILE'");
    expect(mocks.query.mock.calls[4][1]).toEqual([`hash:${bearerToken}`]);
  });
});
