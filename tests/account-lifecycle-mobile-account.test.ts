import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  assertNotLastEnabledAdmin: vi.fn(),
  clearAccountRelationships: vi.fn(),
  clientQuery: vi.fn(),
  compare: vi.fn(),
  hash: vi.fn(async () => "bcrypt-new-password"),
  issueMobileCredentials: vi.fn(),
  query: vi.fn(),
  revokeAccountCredentials: vi.fn(),
  scheduleOwnedStationsForDeletion: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock("@/lib/account-deletion", () => ({
  accountLifecycleLockId: 7_155_204_285,
  assertNotLastEnabledAdmin: mocks.assertNotLastEnabledAdmin,
  clearAccountRelationships: mocks.clearAccountRelationships,
  revokeAccountCredentials: mocks.revokeAccountCredentials,
  scheduleOwnedStationsForDeletion: mocks.scheduleOwnedStationsForDeletion,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({ STATION_DELETE_GRACE_DAYS: 7 }) }));
vi.mock("@/lib/mobile-auth", () => ({
  issueMobileCredentials: mocks.issueMobileCredentials,
  mobileUser: (user: unknown) => user,
}));

import { changeMobilePassword, mobileAccountSettings, requestMobileAccountDeletion } from "@/lib/mobile-account";

const activeUser = {
  id: userId,
  email: "Owner@Example.com",
  display_name: "Owner",
  role: "USER",
  password_hash: "stored-hash",
  must_change_password: false,
  email_verified_at: new Date(),
  show_explicit_content: false,
  explicit_age_attested_at: null,
  weather_zip_code: "02139",
  disabled_at: null,
  deletion_requested_at: null,
  anonymized_at: null,
};

describe("mobile account security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.revokeAccountCredentials.mockResolvedValue({ sessions: 3, refreshTokens: 4, moderationTokens: 1 });
    mocks.scheduleOwnedStationsForDeletion.mockResolvedValue({ owned: 2, scheduled: 2, held: 1 });
  });

  it("includes the private weather ZIP in mobile account settings", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [activeUser], rowCount: 1 });

    await expect(mobileAccountSettings(userId)).resolves.toMatchObject({ weatherZipCode: "02139" });
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain("weather_zip_code");
  });

  it("changes a local password and atomically issues a fresh current mobile family", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.issueMobileCredentials.mockResolvedValueOnce({
      token: "N".repeat(43),
      accessExpiresAt: "2026-08-18T12:15:00.000Z",
      refreshToken: "R".repeat(43),
      refreshExpiresAt: "2026-09-17T12:00:00.000Z",
    });
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [activeUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await changeMobilePassword(userId, "current-password", "new-private-password");

    expect(mocks.compare).toHaveBeenCalledWith("current-password", "stored-hash");
    expect(mocks.hash).toHaveBeenCalledWith("new-private-password", 12);
    expect(mocks.revokeAccountCredentials).toHaveBeenCalledWith(expect.anything(), userId);
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain("device_sessions");
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain("authentication_method = 'PASSWORD'");
    expect(mocks.issueMobileCredentials).toHaveBeenCalledWith(expect.anything(), userId);
    expect(result.token).toHaveLength(43);
  });

  it("accepts normalized email plus local password and preserves held evidence", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [activeUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ anonymize_after: new Date("2026-08-25T12:00:00.000Z") }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(requestMobileAccountDeletion(userId, " owner@example.com ", "current-password"))
      .resolves.toBeUndefined();
    expect(mocks.assertNotLastEnabledAdmin).toHaveBeenCalledWith(expect.anything(), activeUser);
    expect(mocks.scheduleOwnedStationsForDeletion).toHaveBeenCalledWith(expect.anything(), userId, 7, true);
    expect(mocks.clearAccountRelationships).toHaveBeenCalledWith(expect.anything(), userId);
    expect(String(mocks.clientQuery.mock.calls[3]?.[0])).toContain("avatar_revision = NULL");
  });
});
