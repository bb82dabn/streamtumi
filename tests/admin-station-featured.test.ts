import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return {
    client,
    transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)),
  };
});

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));

import { setStationFeatured } from "@/lib/admin-stations";

const now = new Date("2026-08-18T12:00:00.000Z");
const updatedAt = new Date("2026-08-18T12:05:00.000Z");
const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  displayName: "Avery Admin",
  role: "ADMIN" as const,
  mustChangePassword: false,
};
const stationId = "00000000-0000-4000-8000-000000000002";

function actorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: actor.id,
    display_name: actor.displayName,
    role: "ADMIN",
    disabled_at: null,
    must_change_password: false,
    deletion_requested_at: null,
    anonymized_at: null,
    ...overrides,
  };
}

function stationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: stationId,
    name: "Editorial Station",
    is_featured: false,
    updated_at: now,
    ...overrides,
  };
}

function auditRow(action: string) {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    actor_name: actor.displayName,
    target_label: "Editorial Station",
    action,
    metadata: { from: false, to: true },
    created_at: updatedAt,
  };
}

describe("admin station Featured mutations", () => {
  beforeEach(() => {
    mocks.client.query.mockReset();
    mocks.transaction.mockReset().mockImplementation(async (work: (value: typeof mocks.client) => Promise<unknown>) => work(mocks.client));
  });

  it("revalidates the active administrator under a row lock", async () => {
    mocks.client.query.mockResolvedValueOnce({ rows: [actorRow({ role: "USER" })] });

    await expect(setStationFeatured(stationId, true, actor)).rejects.toMatchObject({
      status: 403,
      code: "ADMIN_ACCESS_REVOKED",
    });

    expect(mocks.client.query.mock.calls[0][0]).toMatch(/FROM users WHERE id = \$1 FOR UPDATE/);
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("locks the active station so concurrent changes serialize", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [stationRow()] })
      .mockResolvedValueOnce({ rows: [stationRow({ is_featured: true, updated_at: updatedAt })] })
      .mockResolvedValueOnce({ rows: [auditRow("STATION_FEATURED_ENABLED")] });

    await setStationFeatured(stationId, true, actor);

    const lockSql = String(mocks.client.query.mock.calls[1][0]);
    expect(lockSql).toMatch(/FROM stations/);
    expect(lockSql).toMatch(/deleted_at IS NULL FOR UPDATE/);
    expect(mocks.client.query.mock.calls[2][0]).toMatch(/UPDATE stations/);
  });

  it("returns an idempotent no-op without changing timestamps or auditing", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [stationRow({ is_featured: true })] });

    const result = await setStationFeatured(stationId, true, actor);

    expect(result).toEqual({
      station: { id: stationId, name: "Editorial Station", isFeatured: true, updatedAt: now.toISOString() },
      audit: null,
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });

  it("updates updated_at and writes a station-targeted audit atomically", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [stationRow()] })
      .mockResolvedValueOnce({ rows: [stationRow({ is_featured: true, updated_at: updatedAt })] })
      .mockResolvedValueOnce({ rows: [auditRow("STATION_FEATURED_ENABLED")] });

    const result = await setStationFeatured(stationId, true, actor);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.client.query.mock.calls[2][0]).toMatch(/is_featured = \$2, updated_at = now\(\)/);
    expect(mocks.client.query.mock.calls[2][1]).toEqual([stationId, true]);
    expect(mocks.client.query.mock.calls[3][0]).toMatch(/target_station_id/);
    expect(mocks.client.query.mock.calls[3][1]).toEqual([
      actor.id,
      actor.displayName,
      stationId,
      "Editorial Station",
      "STATION_FEATURED_ENABLED",
      { from: false, to: true },
    ]);
    expect(result.station).toMatchObject({ isFeatured: true, updatedAt: updatedAt.toISOString() });
    expect(result.audit).toMatchObject({ action: "STATION_FEATURED_ENABLED", targetLabel: "Editorial Station" });
  });

  it("uses the disabled audit action when Featured is removed", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [stationRow({ is_featured: true })] })
      .mockResolvedValueOnce({ rows: [stationRow({ updated_at: updatedAt })] })
      .mockResolvedValueOnce({ rows: [auditRow("STATION_FEATURED_DISABLED")] });

    const result = await setStationFeatured(stationId, false, actor);

    expect(mocks.client.query.mock.calls[3][1][4]).toBe("STATION_FEATURED_DISABLED");
    expect(result.audit?.action).toBe("STATION_FEATURED_DISABLED");
  });

  it("returns 404 for a missing or deleted station", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(setStationFeatured(stationId, true, actor)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });
});
