import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  lockActiveUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/auth", () => ({ lockActiveUser: mocks.lockActiveUser }));

import { reserveRadioTrackUpload } from "@/lib/radio-tracks";

const input = {
  userId: "00000000-0000-4000-8000-000000000001",
  stationId: "00000000-0000-4000-8000-000000000002",
  uploadRequestId: "00000000-0000-4000-8000-000000000003",
  filename: "night-show.mp3",
  mimeType: "audio/mpeg",
  size: 100,
};

describe("Radio track reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations WHERE")) return { rows: [{ id: input.stationId }], rowCount: 1 };
      if (sql.includes("FROM radio_tracks WHERE station_id")) return { rows: [], rowCount: 0 };
      if (sql.includes("station_media_storage_usage_v")) return { rows: [{ bytes: "850" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
  });

  it("locks Radio ownership and reserves against station bytes", async () => {
    const result = await reserveRadioTrackUpload(input);
    expect(result).toMatchObject({ status: "UPLOADING", created: true });
    expect(mocks.lockActiveUser).toHaveBeenCalledWith(expect.anything(), input.userId);
    const stationSql = String(mocks.query.mock.calls.find(([sql]) => String(sql).includes("FROM stations WHERE"))?.[0]);
    expect(stationSql).toContain("station_kind = 'RADIO'");
    const usageSql = String(mocks.query.mock.calls.find(([sql]) => String(sql).includes("station_media_storage_usage_v"))?.[0]);
    expect(usageSql).toContain("quota_bytes");
    const insert = mocks.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO radio_tracks"));
    expect(insert?.[0]).toContain("rights_attested_at");
    expect(insert?.[1][4]).toMatch(/^stations\/.+\/radio-track-chunked-sources\/.+\/$/);
  });

  it("rejects a reservation that exceeds station storage", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations WHERE")) return { rows: [{ id: input.stationId }], rowCount: 1 };
      if (sql.includes("FROM radio_tracks WHERE station_id")) return { rows: [], rowCount: 0 };
      if (sql.includes("station_media_storage_usage_v")) return { rows: [{ bytes: "10737418191" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(reserveRadioTrackUpload(input)).rejects.toMatchObject({ status: 413, code: "STATION_STORAGE_LIMIT" });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO radio_tracks"))).toBe(false);
  });

  it("returns the original track for an idempotent request", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations WHERE")) return { rows: [{ id: input.stationId }], rowCount: 1 };
      if (sql.includes("FROM radio_tracks WHERE station_id")) return { rows: [{ id: "track-existing", source_file_name: input.filename, mime_type: input.mimeType, size_bytes: String(input.size), status: "QUEUED" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(reserveRadioTrackUpload(input)).resolves.toEqual({ trackId: "track-existing", status: "QUEUED", created: false });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("station_media_storage_usage_v"))).toBe(false);
  });
});
