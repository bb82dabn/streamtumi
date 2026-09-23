import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  clientQuery: vi.fn(),
  env: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/queue", () => ({ getMediaProcessingQueue: vi.fn() }));
vi.mock("@/lib/storage", () => ({ bucket: "test", ensureBucket: vi.fn(), storage: {} }));

import { initiateOwnerMediaUpload } from "@/lib/media-uploads";

const ownerId = "00000000-0000-4000-8000-000000000001";
const stationId = "00000000-0000-4000-8000-000000000005";
const input = {
  stationId,
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
  mediaType: "AUDIO" as const,
  filename: "owner-song.flac",
  mimeType: "audio/flac",
  size: 100,
  checksumSha256: "a".repeat(64),
  rights: {
    basis: "OWNER" as const,
    statement: "I own and may process this recording.",
    territories: [] as string[],
    evidence: {},
  },
};

describe("canonical media upload reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.mockReturnValue({ MAX_UPLOAD_BYTES: 1_000 });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.clientQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT id FROM users")) return { rows: [{ id: ownerId }], rowCount: 1 };
      if (sql.includes("SELECT id FROM stations")) return { rows: [{ id: stationId }], rowCount: 1 };
      if (sql.includes("upload.idempotency_key")) return { rows: [], rowCount: 0 };
      if (sql.includes("station_media_storage_usage_v")) return { rows: [{ bytes: "850" }], rowCount: 1 };
      if (sql.includes("INSERT INTO media_upload_sessions")) {
        return {
          rows: [{
            id: values[0], media_asset_id: values[1], owner_id: ownerId, station_id: stationId, media_type: input.mediaType,
            asset_status: "UPLOADING", original_file_name: input.filename, mime_type: input.mimeType,
            quota_bytes: String(input.size), status: "INITIATED", object_key: values[4],
            expected_bytes: String(input.size), received_bytes: "0", part_size_bytes: String(512 * 1024),
            expected_parts: 1, checksum_sha256: input.checksumSha256, expires_at: values[9],
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
  });

  it("locks the owner and station, then reserves station quota, asset, rights, and session", async () => {
    const reservation = await initiateOwnerMediaUpload(ownerId, input);
    expect(reservation).toMatchObject({ status: "INITIATED", chunkSize: 512 * 1024, chunkCount: 1, created: true });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements).toEqual([
      expect.stringMatching(/SELECT id FROM users[\s\S]*FOR UPDATE/),
      expect.stringMatching(/SELECT id FROM stations[\s\S]*FOR UPDATE/),
      expect.stringContaining("upload.idempotency_key"),
      expect.stringContaining("station_media_storage_usage_v"),
      expect.stringContaining("INSERT INTO media_assets"),
      expect.stringContaining("INSERT INTO station_media_allocations"),
      expect.stringContaining("INSERT INTO media_rights_attestations"),
      expect.stringContaining("INSERT INTO media_upload_sessions"),
    ]);
    const assetInsert = mocks.clientQuery.mock.calls[4];
    expect(assetInsert[1][6]).toBe(input.size);
    const rightsInsert = mocks.clientQuery.mock.calls[6];
    expect(rightsInsert[1]).toEqual(expect.arrayContaining([input.rights.basis, input.rights.statement, ownerId]));
    const sessionInsert = mocks.clientQuery.mock.calls[7];
    expect(sessionInsert[1][4]).toMatch(/^owners\/.+\/media\/.+\/uploads\/.+\/parts\/$/);
  });

  it("rejects over-quota input before creating any canonical row", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM users")) return { rows: [{ id: ownerId }], rowCount: 1 };
      if (sql.includes("SELECT id FROM stations")) return { rows: [{ id: stationId }], rowCount: 1 };
      if (sql.includes("upload.idempotency_key")) return { rows: [], rowCount: 0 };
      if (sql.includes("station_media_storage_usage_v")) return { rows: [{ bytes: "10737418191" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(initiateOwnerMediaUpload(ownerId, input)).rejects.toMatchObject({ status: 413, code: "STATION_STORAGE_LIMIT" });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO media_assets"))).toBe(false);
  });

  it("returns an owner-wide idempotent session without reserving quota again", async () => {
    const existing = {
      id: "00000000-0000-4000-8000-000000000003",
      media_asset_id: "00000000-0000-4000-8000-000000000004",
      owner_id: ownerId,
      station_id: stationId,
      media_type: input.mediaType,
      asset_status: "PROCESSING",
      original_file_name: input.filename,
      mime_type: input.mimeType,
      quota_bytes: String(input.size),
      status: "COMPLETE",
      object_key: "owners/o/media/a/uploads/u/parts/",
      expected_bytes: String(input.size),
      received_bytes: String(input.size),
      part_size_bytes: String(512 * 1024),
      expected_parts: 1,
      checksum_sha256: input.checksumSha256,
      expires_at: new Date(Date.now() + 60_000),
    };
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM users")) return { rows: [{ id: ownerId }], rowCount: 1 };
      if (sql.includes("SELECT id FROM stations")) return { rows: [{ id: stationId }], rowCount: 1 };
      if (sql.includes("upload.idempotency_key")) return { rows: [existing], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(initiateOwnerMediaUpload(ownerId, input)).resolves.toMatchObject({ uploadId: existing.id, status: "COMPLETE", created: false });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("station_media_storage_usage_v"))).toBe(false);
  });
});
