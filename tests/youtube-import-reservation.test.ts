import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  lockActiveUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/auth", () => ({ lockActiveUser: mocks.lockActiveUser }));
vi.mock("@/lib/env", () => ({ env: () => ({ MAX_UPLOAD_BYTES: 100 }) }));

import { reserveYouTubeImport, reserveYouTubeRetry } from "@/lib/youtube-import";

const input = {
  userId: "00000000-0000-4000-8000-000000000001",
  stationId: "00000000-0000-4000-8000-000000000002",
  requestId: "00000000-0000-4000-8000-000000000003",
  source: { videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
};

describe("YouTube import reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.query }) => Promise<unknown>) => work({ query: mocks.query }));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations")) return { rows: [{ id: input.stationId }], rowCount: 1 };
      if (sql.includes("ingestion_request_id")) return { rows: [], rowCount: 0 };
      if (sql.includes("station_media_storage_usage_v")) return { rows: [{ bytes: "10737418190" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
  });

  it("locks active ownership and reserves only the remaining station quota", async () => {
    const result = await reserveYouTubeImport(input);
    expect(result).toMatchObject({ created: true, status: "QUEUED" });
    expect(mocks.lockActiveUser).toHaveBeenCalledWith(expect.anything(), input.userId);
    const stationCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("FROM stations"));
    expect(stationCall?.[0]).toMatch(/owner_id = \$2 AND station_kind = 'TV' AND deleted_at IS NULL FOR UPDATE/);
    const insert = mocks.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO videos"));
    expect(insert?.[1][5]).toBe("50");
    expect(insert?.[0]).toMatch(/rights_attested_at/);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("station_media_storage_usage_v"))).toBe(true);
  });

  it("returns an idempotent existing import without another reservation", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM stations")) return { rows: [{ id: input.stationId }], rowCount: 1 };
      if (sql.includes("ingestion_request_id")) return { rows: [{
        id: "00000000-0000-4000-8000-000000000004",
        normalized_source_url: input.source.url,
        external_source_id: input.source.videoId,
        status: "PROCESSING",
      }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(reserveYouTubeImport(input)).resolves.toEqual({
      videoId: "00000000-0000-4000-8000-000000000004",
      status: "PROCESSING",
      created: false,
    });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("station_media_storage_usage_v"))).toBe(false);
  });

  it("reacquires bounded quota before retrying a released import", async () => {
    mocks.query.mockReset();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("v.processing_attempts < 12")) return { rows: [{ size_bytes: "0", station_id: input.stationId }], rowCount: 1 };
      if (sql.includes("station_media_storage_usage_v")) return { rows: [{ bytes: "10737418190" }], rowCount: 1 };
      if (sql.includes("UPDATE videos SET status = 'QUEUED'")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(reserveYouTubeRetry("video", input.userId)).resolves.toBe(true);
    const update = mocks.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE videos SET status = 'QUEUED'"));
    expect(update?.[1][1]).toBe("50");
  });
});
