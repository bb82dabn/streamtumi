import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ transaction: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ MAX_UPLOAD_BYTES: 1_000, MAX_STORAGE_BYTES_PER_USER: 10_000 }) }));
vi.mock("@/lib/queue", () => ({ getMediaProcessingQueue: vi.fn() }));
vi.mock("@/lib/storage", () => ({ bucket: "test", ensureBucket: vi.fn(), storage: {} }));

import {
  initiateOwnerMediaUploadSchema,
  ownerMediaPartKey,
  ownerMediaUploadPrefix,
  parseOwnerMediaPartNumber,
} from "@/lib/media-uploads";

describe("canonical media upload contract", () => {
  it("uses deterministic, owner-scoped, one-based part keys", () => {
    const prefix = ownerMediaUploadPrefix("owner-1", "asset-1", "upload-1");
    expect(prefix).toBe("owners/owner-1/media/asset-1/uploads/upload-1/parts/");
    expect(ownerMediaPartKey(prefix, 1)).toBe(`${prefix}00000001.part`);
    expect(ownerMediaPartKey(prefix, 4096)).toBe(`${prefix}00004096.part`);
    expect(prefix).not.toContain("station");
    expect(() => ownerMediaPartKey("stations/one/chunks/", 1)).toThrow(/prefix/);
    expect(parseOwnerMediaPartNumber("12")).toBe(12);
    expect(() => parseOwnerMediaPartNumber("0")).toThrow(/positive/);
  });

  it("requires a UUID idempotency key and explicit versionable rights details", () => {
    const input = {
      stationId: "00000000-0000-4000-8000-000000000002",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      mediaType: "IMAGE",
      filename: "poster.png",
      mimeType: "image/png",
      size: 100,
      rights: { basis: "OWNER", statement: "I own this image." },
    };
    expect(initiateOwnerMediaUploadSchema.parse(input)).toMatchObject({
      idempotencyKey: input.idempotencyKey,
      rights: { basis: "OWNER", territories: [], evidence: {} },
    });
    expect(() => initiateOwnerMediaUploadSchema.parse({ ...input, idempotencyKey: "retry-me" })).toThrow();
    expect(() => initiateOwnerMediaUploadSchema.parse({ ...input, rights: undefined })).toThrow();
  });

  it("protects every mutation route with same-origin and owner authentication", async () => {
    const routes = [
      "app/api/media/uploads/initiate/route.ts",
      "app/api/media/uploads/[uploadId]/parts/[partNumber]/route.ts",
      "app/api/media/uploads/[uploadId]/complete/route.ts",
      "app/api/media/uploads/[uploadId]/abort/route.ts",
    ];
    for (const route of routes) {
      const source = await readFile(path.join(process.cwd(), route), "utf8");
      expect(source).toContain("assertSameOrigin(request)");
      expect(source).toContain("await requireApiUser()");
    }
  });

  it("retains the owner-wide upload idempotency index in the standalone schema", async () => {
    const sql = await readFile(path.join(process.cwd(), "sql/001_initial.sql"), "utf8");
    expect(sql).toMatch(/CREATE UNIQUE INDEX media_upload_sessions_owner_idempotency_idx ON public\.media_upload_sessions USING btree \(initiated_by_user_id, idempotency_key\)/);
    expect(sql).toContain("WHERE (initiated_by_user_id IS NOT NULL)");
  });
});
