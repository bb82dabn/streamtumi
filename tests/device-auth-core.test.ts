import { beforeEach, describe, expect, it, vi } from "vitest";

const deviceCode = "D".repeat(43);
const deviceToken = "T".repeat(43);
const now = new Date("2026-08-18T12:00:00.000Z");
const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  query: vi.fn(),
  randomToken: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ compare: mocks.compare }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/crypto", () => ({
  hashToken: (value: string) => `sha256:${value.length}:${value.charCodeAt(0)}`,
  randomToken: mocks.randomToken,
}));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://streamtumi.test" }) }));

import {
  DEVICE_SCOPES,
  approveDeviceUser,
  approveDeviceAuthorization,
  listLinkedDevices,
  loginDeviceWithPassword,
  parseDeviceBearerToken,
  pollDeviceAuthorization,
  requireDeviceAuth,
  revokeLinkedDevice,
  startDeviceAuthorization,
} from "@/lib/device-auth";

function authorization(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    device_type: "ROKU",
    display_name: "Living room Roku",
    scopes: ["catalog:read", "tunes:write", "rooms:join"],
    expires_at: new Date(now.getTime() + 60_000),
    poll_interval_seconds: 5,
    next_poll_at: now,
    approved_user_id: null,
    consumed_at: null,
    ...overrides,
  };
}

function result(rows: unknown[] = [], rowCount = rows.length) {
  return { rows, rowCount };
}

describe("device authorization core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compare.mockReset().mockResolvedValue(true);
    mocks.randomToken.mockReset().mockReturnValue(deviceToken);
  });

  it("creates a password-authenticated session for an unverified account with a hashed token and every device scope", async () => {
    const user = {
      id: "00000000-0000-4000-8000-000000000009",
      email: "viewer@example.test",
      display_name: "Viewer",
      password_hash: "bcrypt-password-hash",
      disabled_at: null,
      deletion_requested_at: null,
      anonymized_at: null,
      must_change_password: false,
      email_verified_at: null,
    };
    const client = { query: vi.fn()
      .mockResolvedValueOnce(result([user]))
      .mockResolvedValueOnce(result()) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    const loggedIn = await loginDeviceWithPassword({
      email: " VIEWER@EXAMPLE.TEST ",
      password: "correct horse battery staple",
      deviceType: "ROKU",
      displayName: "Den Roku",
    }, now);

    expect(client.query.mock.calls[0][1]).toEqual(["viewer@example.test"]);
    expect(mocks.compare).toHaveBeenCalledWith("correct horse battery staple", "bcrypt-password-hash");
    expect(loggedIn).toEqual({
      deviceToken,
      expiresAt: new Date(now.getTime() + 180 * 86_400_000).toISOString(),
      scopes: [...DEVICE_SCOPES],
      account: { displayName: "Viewer", email: "viewer@example.test" },
    });
    const [insertSql, insertValues] = client.query.mock.calls[1] as [string, unknown[]];
    expect(insertSql).toContain("authentication_method");
    expect(insertValues).toEqual([
      null,
      user.id,
      "ROKU",
      "Den Roku",
      "sha256:43:84",
      [...DEVICE_SCOPES],
      "PASSWORD",
      now,
      new Date(now.getTime() + 180 * 86_400_000),
    ]);
    expect(insertValues).not.toContain(deviceToken);
  });

  it.each([
    ["a non-local account", { password_hash: null }, 401, "INVALID_CREDENTIALS"],
    ["an incorrect password", {}, 401, "INVALID_CREDENTIALS", false],
    ["a disabled account", { disabled_at: now }, 401, "INVALID_CREDENTIALS"],
    ["an account pending deletion", { deletion_requested_at: now }, 401, "INVALID_CREDENTIALS"],
    ["an anonymized account", { anonymized_at: now }, 401, "INVALID_CREDENTIALS"],
    ["a temporary password", { must_change_password: true }, 403, "PASSWORD_CHANGE_REQUIRED"],
  ])("rejects %s before issuing a device session", async (_label, overrides, status, code, passwordMatches = true) => {
    const user = {
      id: "00000000-0000-4000-8000-000000000009",
      email: "viewer@example.test",
      display_name: "Viewer",
      password_hash: "bcrypt-password-hash",
      disabled_at: null,
      deletion_requested_at: null,
      anonymized_at: null,
      must_change_password: false,
      email_verified_at: now,
      ...overrides,
    };
    mocks.compare.mockResolvedValueOnce(passwordMatches);
    const client = { query: vi.fn().mockResolvedValueOnce(result([user])) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    await expect(loginDeviceWithPassword({
      email: "viewer@example.test",
      password: "password",
      deviceType: "ROKU",
      displayName: "Den Roku",
    }, now)).rejects.toMatchObject({ status, code });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("stores only hashes while returning a 43-character secret and ten-minute grant", async () => {
    mocks.randomToken.mockReturnValueOnce(deviceCode);
    mocks.query.mockResolvedValueOnce(result([{ id: "authorization" }]));

    const created = await startDeviceAuthorization({ deviceType: "ROKU", displayName: "Living room Roku" }, now);

    expect(created.deviceCode).toBe(deviceCode);
    expect(created.userCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(created.expiresIn).toBe(600);
    expect(created.interval).toBe(5);
    expect(created.verificationUri).toBe("https://streamtumi.test/activate");
    expect(created.verificationUriComplete).toContain(encodeURIComponent(created.userCode));
    const values = mocks.query.mock.calls[0][1] as unknown[];
    expect(values).not.toContain(deviceCode);
    expect(values).not.toContain(created.userCode.replaceAll("-", ""));
    expect(String(values[0])).toMatch(/^sha256:/);
    expect(String(values[1])).toMatch(/^sha256:/);
  });

  it("returns pending and increases the enforced interval for early polling", async () => {
    const pendingClient = { query: vi.fn()
      .mockResolvedValueOnce(result([authorization()]))
      .mockResolvedValueOnce(result()) };
    mocks.transaction.mockImplementationOnce((work) => work(pendingClient));
    await expect(pollDeviceAuthorization(deviceCode, now)).resolves.toEqual({ status: "authorization_pending", interval: 5 });

    const slowClient = { query: vi.fn()
      .mockResolvedValueOnce(result([authorization({ next_poll_at: new Date(now.getTime() + 1000) })]))
      .mockResolvedValueOnce(result()) };
    mocks.transaction.mockImplementationOnce((work) => work(slowClient));
    await expect(pollDeviceAuthorization(deviceCode, now)).resolves.toEqual({ status: "slow_down", interval: 10 });
    expect(slowClient.query.mock.calls[1][1][1]).toBe(10);
  });

  it("makes malformed, unknown, expired, and replayed device codes indistinguishable", async () => {
    await expect(pollDeviceAuthorization("not-a-device-code", now)).resolves.toEqual({ status: "expired_token" });

    for (const row of [undefined, authorization({ expires_at: now }), authorization({ consumed_at: now })]) {
      const client = { query: vi.fn().mockResolvedValueOnce(result(row ? [row] : [])) };
      mocks.transaction.mockImplementationOnce((work) => work(client));
      await expect(pollDeviceAuthorization(deviceCode, now)).resolves.toEqual({ status: "expired_token" });
      expect(client.query).toHaveBeenCalledTimes(1);
    }
  });

  it("issues one hashed scoped token under racing approved polls", async () => {
    let consumed = false;
    let inserted = 0;
    let lock = Promise.resolve();
    const client = { query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM device_authorizations")) {
        return result([authorization({ approved_user_id: "user-id", consumed_at: consumed ? now : null })]);
      }
      if (sql.includes("SELECT 1 FROM users")) return result([{ one: 1 }]);
      if (sql.includes("INSERT INTO device_sessions")) {
        inserted += 1;
        expect(values).not.toContain(deviceToken);
        expect(String(values?.[4])).toMatch(/^sha256:/);
        return result();
      }
      if (sql.includes("SET consumed_at")) consumed = true;
      return result();
    }) };
    mocks.transaction.mockImplementation(async (work) => {
      const previous = lock;
      let release = () => {};
      lock = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await work(client);
      } finally {
        release();
      }
    });

    const outcomes = await Promise.all([
      pollDeviceAuthorization(deviceCode, now),
      pollDeviceAuthorization(deviceCode, now),
    ]);

    expect(outcomes.filter((item) => item.status === "authorized")).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === "expired_token")).toHaveLength(1);
    expect(inserted).toBe(1);
  });

  it("rejects expired approval codes without exposing whether they existed", async () => {
    const client = { query: vi.fn().mockResolvedValueOnce(result([authorization({ expires_at: now })])) };
    mocks.transaction.mockImplementationOnce((work) => work(client));
    await expect(approveDeviceAuthorization("user-id", "ABCD-EFGH", now)).rejects.toMatchObject({
      status: 404,
      code: "DEVICE_CODE_INVALID",
    });
  });

  it("allows an unverified signed-in account to approve device pairing", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce(result([authorization({ expires_at: new Date("2027-08-18T12:00:00.000Z") })]))
      .mockResolvedValueOnce(result()) };
    mocks.transaction.mockImplementationOnce((work) => work(client));

    await expect(approveDeviceUser({
      id: "user-id",
      email: "viewer@example.test",
      displayName: "Viewer",
      role: "USER",
      mustChangePassword: false,
      emailVerified: false,
    }, "ABCD-EFGH")).resolves.toEqual({ deviceType: "ROKU", displayName: "Living room Roku" });
  });
});

describe("scoped device sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  const identityRow = {
    id: "00000000-0000-4000-8000-000000000011",
    user_id: "00000000-0000-4000-8000-000000000012",
    device_type: "ROKU",
    display_name: "Roku",
    scopes: ["catalog:read"],
    created_at: now,
    last_used_at: now,
    expires_at: new Date(now.getTime() + 60_000),
    revoked_at: null,
    email: "viewer@example.test",
    user_display_name: "Viewer",
    role: "USER",
    must_change_password: false,
    email_verified_at: now,
    show_explicit_content: false,
    explicit_age_attested_at: null,
  };

  it("accepts only the strict Device scheme and enforces individual scopes", async () => {
    expect(parseDeviceBearerToken(`Device ${deviceToken}`)).toBe(deviceToken);
    expect(parseDeviceBearerToken(`Bearer ${deviceToken}`)).toBeNull();
    expect(parseDeviceBearerToken(`device ${deviceToken}`)).toBeNull();

    mocks.query.mockResolvedValueOnce(result([identityRow]));
    const request = new Request("https://streamtumi.test/api/device/v1/catalog", {
      headers: { Authorization: `Device ${deviceToken}` },
    });
    await expect(requireDeviceAuth(request, "catalog:read")).resolves.toMatchObject({ deviceType: "ROKU" });

    mocks.query.mockResolvedValueOnce(result([identityRow]));
    await expect(requireDeviceAuth(request, "tunes:write")).rejects.toMatchObject({
      status: 403,
      code: "DEVICE_SCOPE_REQUIRED",
    });
  });

  it("treats expired or revoked sessions as unauthenticated", async () => {
    mocks.query.mockResolvedValue(result());
    const request = new Request("https://streamtumi.test/api/device/v1/catalog", {
      headers: { Authorization: `Device ${deviceToken}` },
    });
    await expect(requireDeviceAuth(request, "catalog:read")).rejects.toMatchObject({
      status: 401,
      code: "DEVICE_UNAUTHENTICATED",
    });
  });

  it("lists active user-owned sessions and constrains revocation by user id", async () => {
    mocks.query.mockResolvedValueOnce(result([{ ...identityRow, device_type: "TV" }]));
    const devices = await listLinkedDevices(identityRow.user_id);
    expect(devices[0]).toMatchObject({ displayName: "Roku", deviceType: "TV", revokedAt: null });

    mocks.query.mockResolvedValueOnce(result([{ id: identityRow.id }]));
    await expect(revokeLinkedDevice(identityRow.user_id, identityRow.id)).resolves.toBe(true);
    expect(mocks.query.mock.calls[1][1]).toEqual([identityRow.id, identityRow.user_id]);
  });
});
