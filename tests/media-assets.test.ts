import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return { client, query: vi.fn(), transaction: vi.fn() };
});
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({ MAX_STORAGE_BYTES_PER_USER: 10_000 }) }));

import { listOwnerMediaAssets, mediaAssetListQuerySchema, ownerVariantObject, updateOwnerMediaAsset } from "@/lib/media-assets";

describe("owner media assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: typeof mocks.client) => Promise<unknown>) => work(mocks.client));
  });

  it("lists owner-scoped summaries without returning storage keys", async () => {
    mocks.query.mockResolvedValue({ rows: [{
      id: "asset", media_type: "AUDIO", status: "READY", version: "2", title: "Track",
      original_file_name: "track.wav", mime_type: "audio/wav", quota_bytes: "100",
      metadata: {}, duration_ms: "1000", width: null, height: null,
      created_at: new Date("2026-08-18T12:00:00Z"), updated_at: new Date("2026-08-18T12:00:01Z"),
      variant_id: "variant", variant_role: "MEZZANINE", variant_mime_type: "audio/flac",
      variant_object_key: "owners/user/media/asset/normalized.flac",
    }] });
    const input = mediaAssetListQuerySchema.parse({ type: "AUDIO" });
    const assets = await listOwnerMediaAssets("user", input);
    expect(assets[0]).toMatchObject({ id: "asset", preview: { variantId: "variant", url: "/api/media/assets/asset/variants/variant/normalized.flac" } });
    expect(assets[0]).not.toHaveProperty("objectKey");
    expect(mocks.query.mock.calls[0][0]).toMatch(/asset\.owner_id = \$1/);
  });

  it("resolves only paths beneath the authorized variant directory", async () => {
    mocks.query.mockResolvedValue({ rows: [{ object_key: "owners/user/media/asset/hls/master.m3u8" }] });
    await expect(ownerVariantObject("asset", "variant", "user", ["master.m3u8"])).resolves.toBe("owners/user/media/asset/hls/master.m3u8");
    await expect(ownerVariantObject("asset", "variant", "user", ["720p", "index.m3u8"])).resolves.toBe("owners/user/media/asset/hls/720p/index.m3u8");
    await expect(ownerVariantObject("asset", "variant", "user", [".."])) .rejects.toMatchObject({ status: 404 });
  });

  it("archives only terminal media and records its exact prior status", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{ version: "4", status: "PARTIAL", archived_from_status: null }] })
      .mockResolvedValueOnce({ rows: [{ id: "asset" }], rowCount: 1 });
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: "asset", media_type: "AUDIO", status: "ARCHIVED", archived_from_status: "PARTIAL", version: "5", title: "Program",
      original_file_name: null, mime_type: "audio/flac", quota_bytes: "100", metadata: {}, duration_ms: "1000",
      width: null, height: null, created_at: new Date("2026-08-18T12:00:00Z"), updated_at: new Date("2026-08-18T12:00:01Z"),
      variant_id: null, variant_role: null, variant_mime_type: null, variant_object_key: null,
    }] });

    await expect(updateOwnerMediaAsset("asset", "user", { archived: true, expectedVersion: 4 }))
      .resolves.toMatchObject({ status: "ARCHIVED" });

    expect(mocks.client.query.mock.calls[1][0]).toMatch(/archived_from_status = CASE/);
    expect(mocks.client.query.mock.calls[1][1]).toEqual([null, "ARCHIVED", true, "asset", "user", 4]);
  });

  it("restores the exact archived status and rejects nonterminal archives", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{ version: "5", status: "ARCHIVED", archived_from_status: "FAILED" }] })
      .mockResolvedValueOnce({ rows: [{ id: "asset" }], rowCount: 1 });
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: "asset", media_type: "AUDIO", status: "FAILED", archived_from_status: null, version: "6", title: "Failed program",
      original_file_name: null, mime_type: null, quota_bytes: "0", metadata: {}, duration_ms: null,
      width: null, height: null, created_at: new Date("2026-08-18T12:00:00Z"), updated_at: new Date("2026-08-18T12:00:01Z"),
      variant_id: null, variant_role: null, variant_mime_type: null, variant_object_key: null,
    }] });

    await updateOwnerMediaAsset("asset", "user", { archived: false, expectedVersion: 5 });
    expect(mocks.client.query.mock.calls[1][1]).toEqual([null, "FAILED", false, "asset", "user", 5]);

    mocks.client.query.mockReset().mockResolvedValueOnce({ rows: [{ version: "1", status: "PROCESSING", archived_from_status: null }] });
    await expect(updateOwnerMediaAsset("asset", "user", { archived: true, expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "MEDIA_STATUS_CONFLICT" });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });
});
