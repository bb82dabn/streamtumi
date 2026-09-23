import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return { client, query: vi.fn(), transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
});
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "viewer-token") }));

import { setStudioEnabled, studioOverview } from "@/lib/studio";

const stationId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

describe("production project service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (value: typeof mocks.client) => Promise<unknown>) => work(mocks.client));
  });

  it("returns workspace defaults without live availability", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: stationId, name: "Channel", station_kind: "TV", broadcast_state: "RUNNING", enabled: null, readiness: null, settings_version: null, access_token_ciphertext: "ciphertext" }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await studioOverview(stationId, userId, "TV");
    expect(result.settings).toEqual({ enabled: false, readiness: "WORKSPACE", version: 0 });
    expect(result.settings).not.toHaveProperty("liveAvailable");
  });

  it("enables production and initializes the first project atomically", async () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{ id: stationId, name: "Channel" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ enabled: true, readiness: "WORKSPACE", version: 1 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: "project", station_id: stationId, name: "Channel Show", description: "", draft_document: {}, draft_version: 1, active_release_id: null, active_release_number: null, active_release_source_draft_version: null, active_release_document_hash: null, active_release_current: false, created_at: now, updated_at: now }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(setStudioEnabled(stationId, userId, "TV", true, 0)).resolves.toEqual({ enabled: true, readiness: "WORKSPACE", version: 1 });
    expect(mocks.client.query.mock.calls.some(([sql]) => String(sql).includes("studio_projects"))).toBe(true);
  });

  it("disables production without invoking contribution services", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{ id: stationId, name: "Channel" }] })
      .mockResolvedValueOnce({ rows: [{ enabled: true, readiness: "WORKSPACE", version: 2 }] })
      .mockResolvedValueOnce({ rows: [{ enabled: false, readiness: "WORKSPACE", version: 3 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(setStudioEnabled(stationId, userId, "TV", false, 2)).resolves.toEqual({ enabled: false, readiness: "WORKSPACE", version: 3 });
  });
});
