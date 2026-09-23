import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  end: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { end: mocks.end },
  query: mocks.query,
  transaction: mocks.transaction,
}));

import { parseBatchSize } from "@/scripts/backfill-media-assets";

describe("canonical media asset backfill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a bounded optional batch size", () => {
    expect(parseBatchSize([])).toBe(100);
    expect(parseBatchSize(["25"])).toBe(25);
    expect(parseBatchSize(["--batch-size", "250"])).toBe(250);
    expect(parseBatchSize(["--batch-size=500"])).toBe(500);
    expect(() => parseBatchSize(["0"])).toThrow(/between 1 and 10000/);
    expect(() => parseBatchSize(["1.5"])).toThrow(/positive integer/);
    expect(() => parseBatchSize(["--unknown", "5"])).toThrow(/Usage/);
  });

  it("locks bounded link-null legacy rows and derives ownership through stations", async () => {
    const source = await readFile(new URL("../scripts/backfill-media-assets.ts", import.meta.url), "utf8");

    expect(source).toMatch(/FROM videos video\s+JOIN stations station ON station\.id = video\.station_id/);
    expect(source).toMatch(/FROM radio_tracks track\s+JOIN stations station ON station\.id = track\.station_id/);
    expect(source).toContain("station.owner_id");
    expect(source).toContain("WHERE video.media_asset_id IS NULL");
    expect(source).toContain("WHERE track.media_asset_id IS NULL");
    expect(source.match(/LIMIT \$1/g)).toHaveLength(2);
    expect(source.match(/FOR UPDATE OF (video|track) SKIP LOCKED/g)).toHaveLength(2);
    expect(source).not.toMatch(/media_asset_id IS NULL[^`]+status\s+IN/i);
  });

  it("indexes existing objects and maps quota, status, metadata, and provenance transactionally", async () => {
    const source = await readFile(new URL("../scripts/backfill-media-assets.ts", import.meta.url), "utf8");
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };

    for (const kind of ["SOURCE", "HLS", "THUMBNAIL", "CAPTIONS", "MEZZANINE", "ARTWORK", "AUDIO_HLS"]) {
      expect(source).toContain(`kind: "${kind}"`);
    }
    expect(source).toContain("quota_bytes: row.size_bytes");
    expect(source).toContain('if (status === "REPLACED") return "ARCHIVED"');
    expect(source).toContain('if (status === "QUEUED") return "PROCESSING"');
    expect(source).toContain('["media_type", "media_kind", "asset_kind", "kind"]');
    expect(source).toContain('["role", "variant_kind", "kind"]');
    expect(source).toContain('storage_authority: legacyKind');
    expect(source).toContain("rights_attested_at");
    expect(source).toContain("normalized_source_url");
    expect(source).toContain("await transaction");
    expect(source).toContain("UPDATE videos SET media_asset_id");
    expect(source).toContain("UPDATE radio_tracks SET media_asset_id");
    expect(source).toContain("projectLegacyVideoMediaAsset");
    expect(source).toContain("sourceVariantId");
    expect(source).not.toMatch(/@\/lib\/(storage|media)/);
    expect(source).not.toMatch(/statObject|getObject|putObject|copyObject|removeObject/);
    expect(packageJson.scripts["media:backfill"]).toBe("tsx scripts/backfill-media-assets.ts");
  });
});
