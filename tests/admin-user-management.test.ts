import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return {
    client,
    hash: vi.fn(async () => "bcrypt-temporary-hash"),
    transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)),
  };
});

vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({ STATION_DELETE_GRACE_DAYS: 7 }) }));

import {
  assignTemporaryPassword,
  changeUserRole,
  requestUserDeletion,
  setUserDisabled,
  updateUserProfile,
} from "@/lib/admin-users";

const now = new Date("2026-08-16T12:00:00.000Z");
const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  displayName: "Avery Admin",
  role: "ADMIN" as const,
  mustChangePassword: false,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    email: "owner@example.com",
    display_name: "Casey Owner",
    password_hash: "existing-hash",
    role: "USER",
    version: 4,
    updated_at: now,
    disabled_at: null,
    disabled_reason: null,
    disabled_by_user_id: null,
    must_change_password: false,
    deletion_requested_at: null,
    anonymize_after: null,
    deletion_requested_by_user_id: null,
    anonymized_at: null,
    ...overrides,
  };
}

function auditRow(action: string, metadata: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    actor_name: actor.displayName,
    target_label: "owner@example.com",
    action,
    metadata,
    created_at: now,
  };
}

function privilegedTarget(target = row(), lockedActor = row({
  id: actor.id,
  email: actor.email,
  display_name: actor.displayName,
  role: "ADMIN",
  version: 7,
})) {
  mocks.client.query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [lockedActor] })
    .mockResolvedValueOnce({ rows: [target] });
}

describe("serialized admin user management", () => {
  beforeEach(() => {
    mocks.client.query.mockReset();
    mocks.hash.mockReset().mockResolvedValue("bcrypt-temporary-hash");
    mocks.transaction.mockReset().mockImplementation(async (work: (value: typeof mocks.client) => Promise<unknown>) => work(mocks.client));
  });

  it("revalidates the actor under a serializable advisory lock", async () => {
    privilegedTarget(row(), row({ id: actor.id, role: "USER" }));

    await expect(changeUserRole(row().id, "MODERATOR", 4, actor)).rejects.toMatchObject({ code: "ADMIN_ACCESS_REVOKED" });
    expect(mocks.client.query.mock.calls[0][0]).toBe("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    expect(mocks.client.query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock/);
    expect(mocks.client.query.mock.calls[2][0]).toMatch(/FOR UPDATE/);
    expect(mocks.client.query).toHaveBeenCalledTimes(3);
  });

  it("rejects stale optimistic versions before any update", async () => {
    privilegedTarget(row({ version: 5 }));

    await expect(updateUserProfile(row().id, {
      displayName: "Updated Owner",
      email: "updated@example.com",
      expectedVersion: 4,
    }, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(mocks.client.query).toHaveBeenCalledTimes(4);
  });

  it("maps normalized email uniqueness violations", async () => {
    privilegedTarget();
    mocks.client.query.mockRejectedValueOnce({ code: "23505" });

    await expect(updateUserProfile(row().id, {
      displayName: "Casey Owner",
      email: "taken@example.com",
      expectedVersion: 4,
    }, actor)).rejects.toMatchObject({ status: 409, code: "EMAIL_EXISTS" });
  });

  it("prevents self-demotion and self-disable", async () => {
    const self = row({ id: actor.id, email: actor.email, display_name: actor.displayName, role: "ADMIN", version: 7 });
    privilegedTarget(self, self);
    await expect(changeUserRole(actor.id, "USER", 7, actor)).rejects.toMatchObject({ code: "SELF_DEMOTION" });

    mocks.client.query.mockReset();
    privilegedTarget(self, self);
    await expect(setUserDisabled(actor.id, true, "Testing", 7, actor)).rejects.toMatchObject({ code: "SELF_DISABLE" });
  });

  it("prevents self-deletion", async () => {
    const self = row({ id: actor.id, email: actor.email, display_name: actor.displayName, role: "ADMIN", version: 7 });
    privilegedTarget(self, self);

    await expect(requestUserDeletion(actor.id, actor.email, 7, actor)).rejects.toMatchObject({ code: "SELF_DELETE" });
    expect(mocks.client.query).toHaveBeenCalledTimes(4);
  });

  it("protects the last enabled administrator", async () => {
    privilegedTarget(row({ role: "ADMIN" }));
    mocks.client.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    await expect(changeUserRole(row().id, "MODERATOR", 4, actor)).rejects.toMatchObject({ code: "LAST_ENABLED_ADMIN" });
  });

  it("changes a role with a version increment and atomic audit", async () => {
    const target = row();
    privilegedTarget(target);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [row({ role: "MODERATOR", version: 5 })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [auditRow("USER_ROLE_CHANGED", {
        from: "USER",
        to: "MODERATOR",
        sessionsRevoked: 2,
        mobileRefreshTokensRevoked: 4,
        moderationTokensRevoked: 1,
      })] });

    const result = await changeUserRole(target.id, "MODERATOR", 4, actor);

    expect(result.user).toMatchObject({ role: "MODERATOR", version: 5 });
    expect(mocks.client.query.mock.calls[4][0]).toMatch(/version = version \+ 1/);
    expect(mocks.client.query.mock.calls[5][0]).toMatch(/DELETE FROM sessions/);
    expect(mocks.client.query.mock.calls[6][0]).toMatch(/mobile_refresh_tokens/);
    expect(mocks.client.query.mock.calls[7][0]).toMatch(/moderation_service_tokens/);
    expect(mocks.client.query.mock.calls[10][0]).toMatch(/admin_audit_log/);
    expect(result.audit?.metadata).toMatchObject({ sessionsRevoked: 2, moderationTokensRevoked: 1 });
  });

  it("disables an account and revokes all sessions and active creator tokens", async () => {
    const target = row();
    privilegedTarget(target);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [row({ disabled_at: now, disabled_reason: "Policy review", version: 5 })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [auditRow("USER_DISABLED", { reason: "Policy review", sessionsRevoked: 2, moderationTokensRevoked: 3 })] });

    const result = await setUserDisabled(target.id, true, "Policy review", 4, actor);

    expect(result.user.status).toBe("DISABLED");
    expect(mocks.client.query.mock.calls[5][0]).toMatch(/DELETE FROM sessions/);
    expect(mocks.client.query.mock.calls[6][0]).toMatch(/mobile_refresh_tokens/);
    expect(mocks.client.query.mock.calls[7][0]).toMatch(/moderation_service_tokens/);
    expect(result.audit?.metadata).toMatchObject({ sessionsRevoked: 2, moderationTokensRevoked: 3 });
  });

  it("re-enables without restoring or creating credentials", async () => {
    const target = row({ disabled_at: now, disabled_reason: "Resolved" });
    privilegedTarget(target);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [row({ version: 5 })] })
      .mockResolvedValueOnce({ rows: [auditRow("USER_RE_ENABLED")] });

    const result = await setUserDisabled(target.id, false, undefined, 4, actor);

    expect(result.user.status).toBe("ACTIVE");
    expect(mocks.client.query.mock.calls.some(([sql]) => String(sql).includes("sessions"))).toBe(false);
    expect(mocks.client.query.mock.calls.some(([sql]) => String(sql).includes("moderation_service_tokens"))).toBe(false);
  });

  it("sets only a password hash, forces replacement, revokes sessions, and audits no secret", async () => {
    const target = row();
    privilegedTarget(target);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [row({ must_change_password: true, password_hash: "bcrypt-temporary-hash", version: 5 })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [auditRow("USER_TEMPORARY_PASSWORD_SET", { mustChangePassword: true, sessionsRevoked: 1, moderationTokensRevoked: 0 })] });

    const result = await assignTemporaryPassword(target.id, "Temporary-Password-2026", 4, actor);

    expect(mocks.hash).toHaveBeenCalledWith("Temporary-Password-2026", 12);
    expect(mocks.client.query.mock.calls[4][1]).toContain("bcrypt-temporary-hash");
    expect(JSON.stringify(mocks.client.query.mock.calls[10][1])).not.toContain("Temporary-Password-2026");
    expect(result.user.mustChangePassword).toBe(true);
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("refuses deletion when any owned station has a legal hold", async () => {
    const target = row();
    privilegedTarget(target);
    mocks.client.query.mockResolvedValueOnce({ rows: [{ id: "station-1", legal_hold_at: now }] });

    await expect(requestUserDeletion(target.id, target.email, 4, actor)).rejects.toMatchObject({ code: "LEGAL_HOLD" });
    expect(mocks.client.query.mock.calls[4][0]).toMatch(/ORDER BY id FOR UPDATE/);
  });

  it("soft-deletes every owned station, disables credentials, and records anonymization timing", async () => {
    const target = row();
    privilegedTarget(target);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{ id: "station-1", legal_hold_at: null }, { id: "station-2", legal_hold_at: null }], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [row({ disabled_at: now, deletion_requested_at: now, anonymize_after: now, version: 5 })] })
      .mockResolvedValueOnce({ rows: [], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ present: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [auditRow("USER_DELETION_REQUESTED")] });

    const result = await requestUserDeletion(target.id, target.email, 4, actor);

    const stationUpdate = String(mocks.client.query.mock.calls[5][0]);
    expect(stationUpdate).toMatch(/deleted_at = COALESCE\(deleted_at, now\(\)\)/);
    expect(stationUpdate).toMatch(/access_enabled = false/);
    expect(stationUpdate).toMatch(/broadcast_state = 'STOPPED'/);
    expect(result.user.status).toBe("DELETION_PENDING");
    expect(mocks.client.query.mock.calls[16][0]).toMatch(/admin_audit_log/);
  });
});
