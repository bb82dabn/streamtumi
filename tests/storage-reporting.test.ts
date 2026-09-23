import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireApiUser: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/schedule-publication", () => ({ promoteDueStation: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
  requireUser: mocks.requireUser,
}));

import { GET as listStations } from "@/app/api/stations/route";
import DashboardPage from "@/app/dashboard/page";
import { stationForOwner } from "@/lib/stations";

function expectRetainedStorageQuery(sql: string): void {
  expect(sql).toContain("station_media_storage_usage_v WHERE station_id = s.id");
  expect(sql).not.toMatch(/sum\s*\(\s*DISTINCT/i);
  expect(sql).not.toContain("owner_media_storage_usage_v");
}

describe("storage reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.requireApiUser.mockResolvedValue({ id: "user-1", email: "owner@example.com", displayName: "Owner" });
    mocks.requireUser.mockResolvedValue({ id: "user-1", email: "owner@example.com", displayName: "Owner" });
  });

  it("uses duplication-free retained-byte subqueries for an owned station", async () => {
    await stationForOwner("station-1", "user-1");

    const sql = mocks.query.mock.calls[0][0] as string;
    expectRetainedStorageQuery(sql);
    expect(sql).not.toContain("LEFT JOIN videos");
    expect(sql).not.toContain("LEFT JOIN playlist_items");
  });

  it("uses retained source bytes in the stations API", async () => {
    const response = await listStations(new Request("http://localhost/api/stations"));

    expect(response.status).toBe(200);
    expectRetainedStorageQuery(mocks.query.mock.calls[0][0] as string);
  });

  it("uses retained source bytes on the dashboard", async () => {
    await DashboardPage({ searchParams: Promise.resolve({}) });

    expectRetainedStorageQuery(mocks.query.mock.calls[0][0] as string);
  });
});
