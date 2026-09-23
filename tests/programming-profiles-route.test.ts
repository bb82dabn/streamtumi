import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  station: "00000000-0000-4000-8000-000000000001",
  active: "00000000-0000-4000-8000-000000000002",
  draft: "00000000-0000-4000-8000-000000000003",
};

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  query: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));

import { GET, POST } from "@/app/api/stations/[id]/programming-profiles/route";

describe("programming profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner" });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations WHERE")) return { rows: [{ id: ids.station, station_kind: "TV", active_programming_profile_id: ids.active, programming_mode: "LEGACY_LOOP", active_schedule_id: null, active_clock_release_id: null }], rowCount: 1 };
      if (sql.includes("FROM station_programming_profiles")) return { rows: [{ id: ids.active, name: "Playlist Loop", strategy: "PLAYLIST_LOOP", lifecycle: "ACTIVE", migration_preview: {}, version: 1, created_at: new Date(), updated_at: new Date() }], rowCount: 1 };
      if (sql.includes("FROM videos")) return { rows: [{ count: "4" }], rowCount: 1 };
      if (sql.includes("FROM playlist_items")) return { rows: [{ count: "3" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT active_programming_profile_id")) return { rows: [{ active_programming_profile_id: ids.active }], rowCount: 1 };
      if (sql.includes("INSERT INTO station_programming_profiles")) return { rows: [{ id: ids.draft }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
  });

  it("returns the active strategy and available choices", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: ids.station }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ activeProfileId: ids.active, profiles: [{ strategy: "PLAYLIST_LOOP", lifecycle: "ACTIVE" }] });
  });

  it("creates a non-activating migration preview draft", async () => {
    const response = await POST(new Request(`http://localhost/api/stations/${ids.station}/programming-profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Holiday calendar", strategy: "CALENDAR_EVENTS" }),
    }), { params: Promise.resolve({ id: ids.station }) });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: ids.draft, strategy: "CALENDAR_EVENTS", migrationPreview: { activatable: false, preservedMediaCount: 4, existingProgrammingRows: 3 } });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE stations"))).toBe(false);
  });
});
