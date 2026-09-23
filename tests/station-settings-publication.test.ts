import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stationId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  assertStationOwner: vi.fn(),
  makePasswordHash: vi.fn(),
  stationForOwner: vi.fn(),
  viewerUrl: vi.fn(),
  activeGenreId: vi.fn(),
  listGenres: vi.fn(),
  scheduleStationDeletion: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
  lockPublicationStation: vi.fn(),
  publishAfterScheduleMutation: vi.fn(),
  publishScheduleRefresh: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
  assertStationOwner: mocks.assertStationOwner,
  makePasswordHash: mocks.makePasswordHash,
}));
vi.mock("@/lib/db", () => ({ transaction: mocks.transaction, query: vi.fn() }));
vi.mock("@/lib/stations", () => ({ stationForOwner: mocks.stationForOwner, viewerUrl: mocks.viewerUrl }));
vi.mock("@/lib/genres", () => ({ activeGenreId: mocks.activeGenreId, listGenres: mocks.listGenres }));
vi.mock("@/lib/station-lifecycle", () => ({ scheduleStationDeletion: mocks.scheduleStationDeletion }));
vi.mock("@/lib/env", () => ({ env: () => ({ MAX_UPLOAD_BYTES: 1, MAX_STORAGE_BYTES_PER_USER: 1 }) }));
vi.mock("@/lib/schedule-publication", () => ({
  lockPublicationStation: mocks.lockPublicationStation,
  publishAfterScheduleMutation: mocks.publishAfterScheduleMutation,
  publishScheduleRefresh: mocks.publishScheduleRefresh,
}));

import { PATCH } from "@/app/api/stations/[id]/route";

describe("station publication settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner" });
    mocks.lockPublicationStation.mockResolvedValue({ station: { id: stationId }, promoted: false });
    mocks.publishAfterScheduleMutation.mockResolvedValue({ activeChanged: false });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT name, description")) return { rows: [{
        name: "Station",
        description: "",
        transition_ms: 0,
        playback_order: "SEQUENTIAL",
        auto_publish_next_loop: false,
        access_password_hash: null,
        visibility: "PRIVATE",
        genre_id: "00000000-0000-4000-8000-000000000010",
        owner_declared_explicit: false,
        access_enabled: true,
        access_expires_at: null,
      }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
  });

  it("queues the current editable schedule when auto-publication is enabled", async () => {
    const response = await PATCH(new Request(`http://localhost/api/stations/${stationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoPublishNextLoop: true }),
    }), { params: Promise.resolve({ id: stationId }) });

    expect(response.status).toBe(200);
    expect(mocks.publishAfterScheduleMutation).toHaveBeenCalledWith(expect.anything(), stationId);
  });

  it("prevents transcode completion from reviving media archived while processing", async () => {
    const worker = await readFile(new URL("../src-worker.ts", import.meta.url), "utf8");
    expect(worker).toMatch(/WHERE id = \$10 AND status = 'PROCESSING' RETURNING id/);
    expect(worker).toMatch(/if \(!completed\.rowCount\) return \{ refreshStation: locked\.promoted, automationJobId: null \}/);
  });
});
