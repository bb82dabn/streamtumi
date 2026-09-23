import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  clientQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({ MAX_UPLOAD_BYTES: 1_000_000, MAX_STORAGE_BYTES_PER_USER: 2_000_000 }) }));
vi.mock("@/lib/queue", () => ({ getMediaProcessingQueue: vi.fn() }));
vi.mock("@/lib/storage", () => ({ bucket: "test", ensureBucket: vi.fn(), storage: {} }));

import { abortOwnerMediaUpload } from "@/lib/media-uploads";

const activeUpload = {
  id: "upload-1",
  media_asset_id: "asset-1",
  owner_id: "owner-1",
  media_type: "IMAGE",
  asset_status: "UPLOADING",
  original_file_name: "image.png",
  mime_type: "image/png",
  quota_bytes: "100",
  status: "UPLOADING",
  object_key: "owners/owner-1/media/asset-1/uploads/upload-1/parts/",
  expected_bytes: "100",
  received_bytes: "50",
  part_size_bytes: String(512 * 1024),
  expected_parts: 1,
  checksum_sha256: null,
  expires_at: new Date(Date.now() + 60_000),
};

describe("canonical media upload abort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes("FOR UPDATE OF upload, asset")
      ? { rows: [activeUpload], rowCount: 1 }
      : { rows: [], rowCount: 1 });
  });

  it("archives the reservation and durably schedules exact-prefix cleanup", async () => {
    await expect(abortOwnerMediaUpload("owner-1", "upload-1")).resolves.toEqual({
      uploadId: "upload-1",
      mediaAssetId: "asset-1",
      status: "ABORTED",
    });
    const calls = mocks.clientQuery.mock.calls;
    expect(calls.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining("FOR UPDATE OF upload, asset"),
      expect.stringContaining("status = 'ABORTED'"),
      expect.stringContaining("status = 'ARCHIVED'"),
      expect.stringContaining("INSERT INTO media_gc_tasks"),
    ]);
    expect(calls[3][1]).toEqual(["owner-1", "asset-1", activeUpload.object_key]);
    expect(String(calls[3][0])).toContain("'DELETE_PREFIX'");
  });

  it("never aborts or archives an already completed upload", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes("FOR UPDATE OF upload, asset")
      ? { rows: [{ ...activeUpload, status: "COMPLETE", asset_status: "PROCESSING" }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
    await expect(abortOwnerMediaUpload("owner-1", "upload-1")).rejects.toMatchObject({ code: "UPLOAD_COMPLETE" });
    expect(mocks.clientQuery).toHaveBeenCalledTimes(1);
  });
});
