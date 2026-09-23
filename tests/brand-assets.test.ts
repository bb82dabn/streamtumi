import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const assets = [
  ["assets/branding/streamtumi-logo.png", 749, 145],
  ["assets/branding/streamtumi-mark.png", 207, 145],
  ["public/branding/apple-touch-icon.png", 180, 180],
  ["public/branding/icon-192.png", 192, 192],
  ["public/branding/icon-512.png", 512, 512],
  ["public/branding/icon-maskable-512.png", 512, 512],
  ["public/branding/streamtumi-social.png", 1200, 630],
  ["roku/images/streamtumi-logo.png", 749, 145],
  ["roku/images/channel-poster_fhd.png", 540, 405],
  ["roku/images/channel-poster_hd.png", 336, 210],
  ["roku/images/splash_fhd.png", 1920, 1080],
  ["roku/images/splash_hd.png", 1280, 720],
] as const;

describe("StreamTumi brand assets", () => {
  for (const [assetPath, width, height] of assets) {
    it(`${assetPath} has the required dimensions`, async () => {
      const metadata = await sharp(assetPath).metadata();
      expect(metadata.format).toBe("png");
      expect([metadata.width, metadata.height]).toEqual([width, height]);
    });
  }

  it("packages six PNG favicon sizes in one icon", () => {
    const favicon = readFileSync("app/favicon.ico");
    expect([...favicon.subarray(0, 6)]).toEqual([0, 0, 1, 0, 6, 0]);
    expect(Array.from({ length: 6 }, (_, index) => favicon[6 + index * 16] || 256)).toEqual([16, 32, 48, 64, 128, 256]);
  });
});
