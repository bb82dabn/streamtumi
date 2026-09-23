import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  end: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { end: mocks.end },
  transaction: mocks.transaction,
}));

import {
  parseTvChannelBackfillOptions,
  queueTvChannelDerivativeBackfill,
} from "@/scripts/backfill-tv-channel-derivatives";

const stationId = "11111111-2222-4333-8444-555555555555";

describe("TV channel derivative backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => {
      return work({ query: mocks.clientQuery });
    });
  });

  it("parses bounded transaction and total limits with optional station scope", () => {
    expect(parseTvChannelBackfillOptions([])).toEqual({ batchSize: 100, maxJobs: 1000 });
    expect(parseTvChannelBackfillOptions(["25", "--max-jobs", "250", "--station-id", stationId])).toEqual({
      batchSize: 25,
      maxJobs: 250,
      stationId,
    });
    expect(parseTvChannelBackfillOptions(["--batch-size=1000", "--max-jobs=100000", `--station-id=${stationId}`])).toEqual({
      batchSize: 1000,
      maxJobs: 100_000,
      stationId,
    });
    expect(() => parseTvChannelBackfillOptions(["0"])).toThrow(/between 1 and 1000/);
    expect(() => parseTvChannelBackfillOptions(["--max-jobs", "100001"])).toThrow(/between 1 and 100000/);
    expect(() => parseTvChannelBackfillOptions(["--max-jobs", "1.5"])).toThrow(/positive integer/);
    expect(() => parseTvChannelBackfillOptions(["--station-id", "not-a-uuid"])).toThrow(/must be a UUID/);
  });

  it("never queues beyond the total limit and bounds the final transaction", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ id: "job-a" }, { id: "job-b" }] })
      .mockResolvedValueOnce({ rows: [{ id: "job-c" }] });

    await expect(queueTvChannelDerivativeBackfill({ batchSize: 2, maxJobs: 3, stationId })).resolves.toBe(3);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    const [sql, values] = mocks.clientQuery.mock.calls[0];
    expect(sql).toContain("LIMIT $1");
    expect(sql).toContain("FOR UPDATE OF asset SKIP LOCKED");
    expect(sql).toContain("video.station_id = $3");
    expect(sql).toContain("INSERT INTO media_processing_jobs");
    expect(sql).toContain("'PREPARE_TV_AUTOMATION'");
    expect(sql).toContain("ON CONFLICT (media_asset_id, job_type, idempotency_key) DO NOTHING");
    expect(values).toEqual([2, "tv-channel-v1", stationId]);
    expect(mocks.clientQuery.mock.calls[1][1]).toEqual([1, "tv-channel-v1", stationId]);
  });

  it("stops when a bounded transaction exhausts eligible assets", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [{ id: "job-a" }] });

    await expect(queueTvChannelDerivativeBackfill({ batchSize: 10, maxJobs: 50 })).resolves.toBe(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.clientQuery.mock.calls[0][1]).toEqual([10, "tv-channel-v1", null]);
  });

  it("does not mutate schedules or dispatch worker jobs", async () => {
    const [source, packageJson] = await Promise.all([
      readFile(new URL("../scripts/backfill-tv-channel-derivatives.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);
    expect(source).not.toMatch(/\b(?:UPDATE|DELETE FROM|INSERT INTO)\s+(?:schedules|schedule_items)\b/i);
    expect(source).not.toMatch(/getMediaProcessingQueue|queue\.add|src-media-worker/);
    expect(JSON.parse(packageJson).scripts["tv:backfill-derivatives"]).toBe("tsx scripts/backfill-tv-channel-derivatives.ts");
  });
});
