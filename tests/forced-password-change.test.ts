import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return {
    client,
    compare: vi.fn(),
    hash: vi.fn(async () => "new-password-hash"),
    transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)),
  };
});

vi.mock("bcryptjs", () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));

import { replaceTemporaryPassword } from "@/lib/account";

describe("forced temporary password replacement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies the temporary password, clears the flag, and revokes every session", async () => {
    mocks.compare.mockResolvedValueOnce(true);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{
        password_hash: "temporary-hash",
        must_change_password: true,
        disabled_at: null,
        deletion_requested_at: null,
        anonymized_at: null,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await replaceTemporaryPassword("user-1", "temporary-password", "new-private-password");

    expect(mocks.compare).toHaveBeenCalledWith("temporary-password", "temporary-hash");
    expect(mocks.hash).toHaveBeenCalledWith("new-private-password", 12);
    expect(mocks.client.query.mock.calls[1][0]).toMatch(/must_change_password = false/);
    expect(mocks.client.query.mock.calls[2][0]).toMatch(/DELETE FROM sessions/);
  });

  it("does not change anything when the current password is wrong", async () => {
    mocks.compare.mockResolvedValueOnce(false);
    mocks.client.query.mockResolvedValueOnce({ rows: [{
      password_hash: "temporary-hash",
      must_change_password: true,
      disabled_at: null,
      deletion_requested_at: null,
      anonymized_at: null,
    }] });

    await expect(replaceTemporaryPassword("user-1", "wrong", "new-private-password"))
      .rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });
});
