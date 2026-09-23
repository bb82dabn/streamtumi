import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  clientQuery: vi.fn(),
  ensureBucket: vi.fn(),
  putObject: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({ MAX_UPLOAD_BYTES: 1_000_000, MAX_STORAGE_BYTES_PER_USER: 2_000_000 }) }));
vi.mock("@/lib/queue", () => ({ getMediaProcessingQueue: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  bucket: "test-bucket",
  ensureBucket: mocks.ensureBucket,
  storage: { putObject: mocks.putObject },
}));

import { writeOwnerMediaPart } from "@/lib/media-uploads";

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
  received_bytes: "0",
  part_size_bytes: String(512 * 1024),
  expected_parts: 2,
  checksum_sha256: null,
  expires_at: new Date(Date.now() + 60_000),
};

describe("canonical media upload parts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF upload, asset")) return { rows: [upload], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    mocks.putObject.mockResolvedValue({ etag: "exact-etag" });
  });

  it("writes the exact final part and persists its checksum receipt before counting bytes", async () => {
    const request = new Request("http://localhost/api/media/uploads/upload-1/parts/2", {
      method: "PUT",
      headers: { "content-length": "7" },
      body: new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
    });
    const receipt = await writeOwnerMediaPart("owner-1", "upload-1", 2, request);
    expect(receipt).toMatchObject({ partNumber: 2, size: 7, etag: "exact-etag" });
    expect(receipt.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.putObject).toHaveBeenCalledWith(
      "test-bucket",
      `${upload.object_key}00000002.part`,
      expect.any(Buffer),
      7,
      { "Content-Type": "application/octet-stream" },
    );
    const writes = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(writes).toEqual([
      expect.stringContaining("FOR UPDATE OF upload, asset"),
      expect.stringContaining("FOR UPDATE OF upload, asset"),
      expect.stringContaining("INSERT INTO media_upload_parts"),
      expect.stringContaining("sum(size_bytes)"),
    ]);
  });

  it("rejects a non-exact Content-Length before writing storage", async () => {
    const request = new Request("http://localhost/api/media/uploads/upload-1/parts/2", {
      method: "PUT",
      headers: { "content-length": "6" },
      body: new Uint8Array(6),
    });
    await expect(writeOwnerMediaPart("owner-1", "upload-1", 2, request)).rejects.toMatchObject({ code: "PART_SIZE_MISMATCH" });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });
});
