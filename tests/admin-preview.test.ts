import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  station: "00000000-0000-4000-8000-000000000002",
  schedule: "00000000-0000-4000-8000-000000000003",
  video: "00000000-0000-4000-8000-000000000004",
};

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  jar: {
    get: vi.fn((name: string) => {
      const value = mocks.cookieValues.get(name);
      return value ? { value } : undefined;
    }),
    set: vi.fn((name: string, value: string) => { mocks.cookieValues.set(name, value); }),
  },
  requireAdmin: vi.fn(),
  query: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
  promoteDueStation: vi.fn(),
  objectResponse: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.jar, headers: async () => new Headers({ "x-streamtumi-product": "MAIN" }) }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({
  APP_SECRET: "admin-preview-test-secret-with-32-characters",
  APP_URL: "http://localhost:3000",
  APP_ALLOWED_ORIGINS: "",
}) }));
vi.mock("@/lib/schedule-publication", () => ({ promoteDueStation: mocks.promoteDueStation }));
vi.mock("@/lib/media", () => ({ objectResponse: mocks.objectResponse }));

import { grantAdminPreview, hasAdminPreviewGrant } from "@/lib/admin-preview";
import { POST as openPreview } from "@/app/api/admin/stations/[id]/preview/open/route";
import { GET as previewState } from "@/app/api/admin/stations/[id]/preview/route";
import { GET as previewMedia } from "@/app/api/admin/stations/[id]/preview/media/[videoId]/[...path]/route";

describe("admin diagnostic preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValues.clear();
    mocks.requireAdmin.mockResolvedValue({ id: ids.admin, displayName: "Administrator", role: "ADMIN", mustChangePassword: false });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations")) return { rows: [{
        id: ids.station,
        name: "Troubleshooting Station",
        access_enabled: false,
        moderation_status: "RESTRICTED",
        broadcast_state: "RUNNING",
        visibility: "PRIVATE",
        has_password: true,
      }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    mocks.promoteDueStation.mockResolvedValue(false);
    mocks.objectResponse.mockResolvedValue(new Response("media", { headers: { "Cache-Control": "private, no-store" } }));
  });

  it("audits a deliberate open and issues a short-lived admin grant without a viewer token", async () => {
    const response = await openPreview(new Request(`http://localhost:3000/api/admin/stations/${ids.station}/preview/open`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost:3000" },
      body: new URLSearchParams({ reason: "Verify a reported stream timing issue" }),
    }), { params: Promise.resolve({ id: ids.station }) });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost:3000/admin/stations/${ids.station}/preview`);
    expect(await hasAdminPreviewGrant(ids.admin, ids.station)).toBe(true);
    const auditCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("admin_audit_log"));
    expect(auditCall?.[1]).toEqual(expect.arrayContaining([ids.admin, ids.station, "Troubleshooting Station"]));
    expect(JSON.stringify(auditCall?.[1])).not.toContain("/watch/");
  });

  it("returns synchronized state through admin media URLs despite viewer access restrictions", async () => {
    await grantAdminPreview(ids.admin, ids.station);
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        name: "Troubleshooting Station",
        description: "",
        broadcast_state: "RUNNING",
        active_schedule_id: ids.schedule,
        schedule_started_at: new Date(0),
        effective_explicit: false,
      }] })
      .mockResolvedValueOnce({ rows: [{
        transition_ms: 0,
        playback_order: "SEQUENTIAL",
        shuffle_seed: "1",
        items: [{ video_id: ids.video, title: "Program", duration_ms: "60000", position: 0, captions_key: null }],
      }] });

    const response = await previewState(new Request(`http://localhost:3000/api/admin/stations/${ids.station}/preview`), {
      params: Promise.resolve({ id: ids.station }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.playlist[0].hlsUrl).toBe(`/api/admin/stations/${ids.station}/preview/media/${ids.video}/master.m3u8`);
    expect(JSON.stringify(body)).not.toContain("/watch/");
  });

  it("rechecks the admin grant on media and serves only active-schedule objects as no-store", async () => {
    await grantAdminPreview(ids.admin, ids.station);
    mocks.query.mockResolvedValueOnce({ rows: [{ hls_key: "station/hls/master.m3u8", captions_key: null, broadcast_state: "RUNNING" }] });
    const request = new Request(`http://localhost:3000/api/admin/stations/${ids.station}/preview/media/${ids.video}/720p/index.m3u8`);
    const response = await previewMedia(request, {
      params: Promise.resolve({ id: ids.station, videoId: ids.video, path: ["720p", "index.m3u8"] }),
    });

    expect(response.status).toBe(200);
    expect(mocks.objectResponse).toHaveBeenCalledWith("station/hls/720p/index.m3u8", request, "private, no-store");
  });

  it("rejects direct preview access without a deliberate grant", async () => {
    const response = await previewState(new Request(`http://localhost:3000/api/admin/stations/${ids.station}/preview`), {
      params: Promise.resolve({ id: ids.station }),
    });
    expect(response.status).toBe(403);
  });
});
