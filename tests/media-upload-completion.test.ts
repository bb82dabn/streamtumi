import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  clientQuery: vi.fn(),
  ensureBucket: vi.fn(),
  statObject: vi.fn(),
  add: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({ MAX_UPLOAD_BYTES: 1_000_000, MAX_STORAGE_BYTES_PER_USER: 2_000_000 }) }));
vi.mock("@/lib/queue", () => ({ getMediaProcessingQueue: () => ({ add: mocks.add }) }));
vi.mock("@/lib/storage", () => ({
  bucket: "test-bucket",
  ensureBucket: mocks.ensureBucket,
  storage: { statObject: mocks.statObject },
}));

import { completeOwnerMediaUpload } from "@/lib/media-uploads";

const upload = {
  id: "upload-1",
  media_asset_id: "asset-1",
  owner_id: "owner-1",
  media_type: "VIDEO",
  asset_status: "UPLOADING",
  original_file_name: "clip.mp4",
  mime_type: "video/mp4",
  quota_bytes: "524295",
  status: "UPLOADING",
  object_key: "owners/owner-1/media/asset-1/uploads/upload-1/parts/",
  expected_bytes: String(512 * 1024 + 7),
  received_bytes: String(512 * 1024 + 7),
  part_size_bytes: String(512 * 1024),
  expected_parts: 2,
  checksum_sha256: null,
  expires_at: new Date(Date.now() + 60_000),
};
const receipts = [
  { part_number: 1, size_bytes: String(512 * 1024), etag: "etag-1", checksum_sha256: "a".repeat(64) },
  { part_number: 2, size_bytes: "7", etag: "etag-2", checksum_sha256: "b".repeat(64) },
];

describe("canonical media upload completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF upload, asset")) return { rows: [upload], rowCount: 1 };
      if (sql.includes("FROM media_upload_parts")) return { rows: receipts, rowCount: 2 };
      if (sql.includes("INSERT INTO media_processing_jobs")) return { rows: [{ id: "durable-job-1" }], rowCount: 1 };
      if (sql.includes("UPDATE media_assets")) return { rows: [{ id: "asset-1" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    mocks.statObject.mockImplementation(async (_bucket: string, key: string) => {
      const receipt = key.endsWith("00000001.part") ? receipts[0] : receipts[1];
      return { size: Number(receipt.size_bytes), etag: receipt.etag };
    });
  });

  it("verifies every persisted receipt, commits a durable job, then dispatches one stable BullMQ id", async () => {
    await expect(completeOwnerMediaUpload("owner-1", "upload-1")).resolves.toEqual({
      uploadId: "upload-1",
      mediaAssetId: "asset-1",
      processingJobId: "durable-job-1",
      status: "PROCESSING",
    });
    expect(mocks.statObject).toHaveBeenCalledTimes(2);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO media_processing_jobs"))).toBe(true);
    expect(mocks.add).toHaveBeenCalledWith(
      "process-owner-media",
      { processingJobId: "durable-job-1" },
      { jobId: "media-processing-durable-job-1" },
    );
  });

  it("keeps successful durable completion when best-effort queueing is unavailable", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.add.mockRejectedValueOnce(new Error("redis offline"));
    await expect(completeOwnerMediaUpload("owner-1", "upload-1")).resolves.toMatchObject({ processingJobId: "durable-job-1" });
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("is durable but could not be dispatched"), expect.any(Error));
    errorLog.mockRestore();
  });

  it("does not create a job when any receipt is missing", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF upload, asset")) return { rows: [upload], rowCount: 1 };
      if (sql.includes("FROM media_upload_parts")) return { rows: receipts.slice(0, 1), rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(completeOwnerMediaUpload("owner-1", "upload-1")).rejects.toMatchObject({ code: "INCOMPLETE_UPLOAD" });
    expect(mocks.statObject).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
