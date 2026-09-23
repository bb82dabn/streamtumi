import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNotLastEnabledAdmin,
  clearAccountRelationships,
  revokeAccountCredentials,
  scheduleOwnedStationsForDeletion,
} from "@/lib/account-deletion";

const client = { query: vi.fn() };

describe("account deletion core", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes held stations while preserving them from maintenance purge", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "held", legal_hold_at: new Date() }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(scheduleOwnedStationsForDeletion(client as never, "user-1", 7, true)).resolves.toEqual({
      owned: 1,
      scheduled: 1,
      held: 1,
    });
    const update = String(client.query.mock.calls[1]?.[0]);
    expect(update).toContain("access_enabled = false");
    expect(update).toContain("broadcast_state = 'STOPPED'");
  });

  it("protects the last enabled administrator", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 });
    await expect(assertNotLastEnabledAdmin(client as never, {
      id: "admin-1",
      role: "ADMIN",
      disabled_at: null,
    })).rejects.toMatchObject({ code: "LAST_ENABLED_ADMIN" });
  });

  it("revokes sessions, refresh families, moderation tokens, and outstanding challenges", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(revokeAccountCredentials(client as never, "user-1")).resolves.toEqual({ sessions: 3, refreshTokens: 4, moderationTokens: 2 });
    expect(String(client.query.mock.calls[1]?.[0])).toContain("mobile_refresh_tokens");
    expect(String(client.query.mock.calls[3]?.[0])).toContain("password_reset_tokens");
    expect(String(client.query.mock.calls[4]?.[0])).toContain("email_verification_tokens");
  });

  it("clears engagement, tune history, and optional block relationships", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await clearAccountRelationships(client as never, "user-1");
    expect(String(client.query.mock.calls[0]?.[0])).toContain("station_fans");
    expect(String(client.query.mock.calls[1]?.[0])).toContain("station_ratings");
    expect(String(client.query.mock.calls[2]?.[0])).toContain("station_tunes");
    expect(String(client.query.mock.calls[3]?.[0])).toContain("blocker_user_id = $1 OR blocked_user_id = $1");
  });
});
