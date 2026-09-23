import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureBucket: vi.fn(),
  putObject: vi.fn(),
  removePrefix: vi.fn(),
  listObjectsV2: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  bucket: "test-bucket",
  ensureBucket: mocks.ensureBucket,
  removePrefix: mocks.removePrefix,
  storage: { putObject: mocks.putObject, listObjectsV2: mocks.listObjectsV2 },
}));

import { createAvatarVariants, maxAvatarUploadBytes, readAvatarUpload } from "@/lib/avatar-image";

describe("avatar image processing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cover-crops input and emits only opaque 96px and 256px JPEGs", async () => {
    const input = await sharp({ create: { width: 640, height: 320, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.4 } } })
      .png()
      .toBuffer();

    const variants = await createAvatarVariants(input, "image/png");
    const small = await sharp(variants[96]).metadata();
    const large = await sharp(variants[256]).metadata();

    expect(small).toMatchObject({ format: "jpeg", width: 96, height: 96, channels: 3 });
    expect(large).toMatchObject({ format: "jpeg", width: 256, height: 256, channels: 3 });
  });

  it("rejects content-type mismatches and dimensions outside policy", async () => {
    const validPng = await sharp({ create: { width: 128, height: 128, channels: 3, background: "red" } }).png().toBuffer();
    const smallPng = await sharp({ create: { width: 127, height: 128, channels: 3, background: "red" } }).png().toBuffer();

    await expect(createAvatarVariants(validPng, "image/jpeg")).rejects.toMatchObject({ status: 415, code: "INVALID_AVATAR_TYPE" });
    await expect(createAvatarVariants(smallPng, "image/png")).rejects.toMatchObject({ status: 422, code: "INVALID_AVATAR_DIMENSIONS" });
  });

  it("rejects oversized requests from Content-Length before reading the body", async () => {
    const request = new Request("https://streamtumi.test/api/mobile/v1/account/avatar", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(maxAvatarUploadBytes + 1) },
      body: Buffer.from("not-read"),
    });

    await expect(readAvatarUpload(request)).rejects.toMatchObject({ status: 413, code: "AVATAR_TOO_LARGE" });
  });
});
