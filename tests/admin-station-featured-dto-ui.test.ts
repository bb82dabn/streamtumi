import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  listGenres: vi.fn(async () => []),
  getJobCounts: vi.fn(async () => ({ waiting: 0, active: 0, delayed: 0, failed: 0 })),
  ping: vi.fn(async () => "PONG"),
  bucketExists: vi.fn(async () => true),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/genres", () => ({ listGenres: mocks.listGenres }));
vi.mock("@/lib/queue", () => ({ getTranscodeQueue: () => ({ getJobCounts: mocks.getJobCounts }) }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ ping: mocks.ping }) }));
vi.mock("@/lib/storage", () => ({ bucket: "test", storage: { bucketExists: mocks.bucketExists } }));

import { loadAdminDashboard } from "@/lib/admin";

const now = new Date("2026-08-18T12:00:00.000Z");

describe("admin station Featured DTO and UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listGenres.mockResolvedValue([]);
    mocks.getJobCounts.mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0 });
    mocks.ping.mockResolvedValue("PONG");
    mocks.bucketExists.mockResolvedValue(true);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("total_users")) return { rows: [{
        total_users: 1,
        new_users_7d: 0,
        active_stations: 1,
        deleted_stations: 0,
        live_broadcasts: 1,
        unresolved_reports: 0,
        retained_source_bytes: "0",
        processing_videos: 0,
        messages_24h: 0,
        processing_median_seconds: 0,
        processing_p90_seconds: 0,
      }] };
      if (sql.includes("FROM users u")) return { rows: [] };
      if (sql.includes("FROM stations s")) return { rows: [{
        id: "00000000-0000-4000-8000-000000000002",
        name: "Editorial Station",
        is_featured: true,
        owner_email: "owner@example.com",
        owner_display_name: "Casey Owner",
        mode: "SYNCHRONIZED",
        access_enabled: true,
        broadcast_state: "RUNNING",
        moderation_status: "ACTIVE",
        deleted_at: null,
        video_count: 1,
        ready_count: 1,
        retained_source_bytes: "100",
        updated_at: now,
        visibility: "PUBLIC",
        genre_name: "News",
        fan_count: 2,
        rating_average: 4,
        rating_count: 1,
        owner_declared_explicit: false,
        explicit_enforced: false,
        genre_explicit: false,
        effective_explicit: false,
      }] };
      if (sql.includes("FROM admin_audit_log")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it("includes isFeatured in the admin station DTO", async () => {
    const dashboard = await loadAdminDashboard();

    expect(dashboard.stations[0]).toMatchObject({ name: "Editorial Station", isFeatured: true });
    const stationQuery = mocks.query.mock.calls.find(([sql]) => String(sql).includes("SELECT s.id, s.name"));
    expect(stationQuery?.[0]).toContain("s.is_featured");
  });

  it("renders a Featured badge and row-local busy and error handling", async () => {
    const source = await readFile(new URL("../components/admin-dashboard.tsx", import.meta.url), "utf8");

    expect(source).toContain('station.isFeatured && <span className="status status-warning">Featured</span>');
    expect(source).toContain("aria-pressed={station.isFeatured}");
    expect(source).toContain("featuredBusy[station.id]");
    expect(source).toContain("featuredErrors[station.id]");
    expect(source).toContain("/featured`");
    expect(source).toContain("STATION_FEATURED_ENABLED");
    expect(source).toContain("STATION_FEATURED_DISABLED");
  });

  it("leaves Guide eligibility and normal sorting independent of Featured", async () => {
    const guide = await readFile(new URL("../lib/guide.ts", import.meta.url), "utf8");
    const ranking = await readFile(new URL("../lib/guide-ranking.ts", import.meta.url), "utf8");

    expect(guide).toContain("WHERE s.visibility = 'PUBLIC' AND s.access_enabled = true");
    expect(guide).toContain("s.deleted_at IS NULL AND s.moderation_status = 'ACTIVE'");
    expect(guide).toContain("sort(compareGuideStations(filters.sort))");
    expect(ranking).not.toContain("isFeatured");
  });
});
