import { describe, expect, it, vi } from "vitest";
import { aggregateChunkProgress, createConcurrencyLimiter, retryChunkUpload } from "@/lib/chunk-upload-client";
import {
  chunkCountForSize,
  chunkManifest,
  chunkSizeForIndex,
  chunkSourcePrefix,
  radioTrackChunkSourcePrefix,
  UPLOAD_CHUNK_SIZE_BYTES,
  validateChunkInventory,
  validateChunkLength,
} from "@/lib/upload-chunks";
import { readBoundedUploadBody } from "@/lib/upload-body";

const chunk = UPLOAD_CHUNK_SIZE_BYTES;
const prefix = chunkSourcePrefix("station-1", "video-1");

describe("chunk upload math", () => {
  it("calculates chunk counts and exact final chunk sizes", () => {
    expect(chunkCountForSize(1)).toBe(1);
    expect(chunkCountForSize(chunk)).toBe(1);
    expect(chunkCountForSize(chunk + 1)).toBe(2);
    expect(chunkCountForSize(chunk * 2)).toBe(2);
    expect(chunkSizeForIndex(chunk + 17, 0)).toBe(chunk);
    expect(chunkSizeForIndex(chunk + 17, 1)).toBe(17);
    expect(chunkSizeForIndex(chunk * 2, 1)).toBe(chunk);
  });

  it("produces zero-padded object paths in numeric order", () => {
    const manifest = chunkManifest(prefix, chunk * 11);
    expect(manifest[0].name).toBe(`${prefix}00000000.part`);
    expect(manifest[10].name).toBe(`${prefix}00000010.part`);
    expect(manifest.map((item) => item.name)).toEqual(manifest.map((item) => item.name).sort());
  });

  it("supports isolated Radio track chunk prefixes", () => {
    const radioPrefix = radioTrackChunkSourcePrefix("station-1", "track-1");
    expect(chunkManifest(radioPrefix, 17)).toEqual([{ index: 0, name: `${radioPrefix}00000000.part`, size: 17 }]);
  });

  it("validates declared bounded chunk sizes", () => {
    expect(validateChunkLength(String(chunk), chunk)).toEqual({ ok: true, length: chunk });
    expect(validateChunkLength(null, chunk)).toEqual({ ok: false, reason: "invalid" });
    expect(validateChunkLength(String(chunk - 1), chunk)).toEqual({ ok: false, reason: "mismatch" });
    expect(validateChunkLength(String(chunk + 1), chunk)).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects an overlong body without retaining bytes past the bound", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await expect(readBoundedUploadBody(body, 8, 8)).rejects.toMatchObject({ code: "CHUNK_TOO_LARGE" });
  });
});

describe("chunk completion inventory", () => {
  it("accepts only the deterministic paths and exact total bytes", () => {
    const expected = chunkManifest(prefix, chunk + 23).map(({ name, size }) => ({ name, size }));
    expect(validateChunkInventory(prefix, chunk + 23, expected)).toEqual({ ok: true, totalBytes: chunk + 23 });
    expect(validateChunkInventory(prefix, chunk + 23, expected.slice(0, 1))).toEqual({ ok: false, reason: "count" });
    expect(validateChunkInventory(prefix, chunk + 23, [expected[0], { ...expected[1], size: 22 }])).toEqual({ ok: false, reason: "size" });
    expect(validateChunkInventory(prefix, chunk + 23, [expected[0], { ...expected[1], name: `${prefix}unexpected.part` }])).toEqual({ ok: false, reason: "path" });
  });
});

describe("chunk client helpers", () => {
  it("computes progress from aggregate bytes and reflects retry resets", () => {
    expect(aggregateChunkProgress([chunk, 100], [chunk, 0])).toBe(99);
    expect(aggregateChunkProgress([900, 100], [450, 100])).toBe(55);
    expect(aggregateChunkProgress([900, 100], [0, 100])).toBe(10);
    expect(aggregateChunkProgress([900, 100], [900, 100])).toBe(100);
  });

  it("allows three retries after the initial failed chunk attempt", async () => {
    const operation = vi.fn(async (attempt: number) => {
      if (attempt < 4) throw new Error("temporary");
      return "uploaded";
    });
    const waits: number[] = [];
    await expect(retryChunkUpload(operation, 3, async (delay) => { waits.push(delay); })).resolves.toBe("uploaded");
    expect(operation).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([250, 500, 1000]);
  });

  it("limits concurrent chunk operations across uploads", async () => {
    const limit = createConcurrencyLimiter(3);
    let active = 0;
    let maximum = 0;
    let started = 0;
    const releases: Array<() => void> = [];
    const operations = Array.from({ length: 7 }, () => limit(async () => {
      active += 1;
      started += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => { releases.push(resolve); });
      active -= 1;
    }));
    await vi.waitFor(() => expect(started).toBe(3));
    while (started < 7) {
      const previous = started;
      releases.shift()?.();
      await vi.waitFor(() => expect(started).toBe(previous + 1));
    }
    releases.splice(0).forEach((release) => release());
    await Promise.all(operations);
    expect(maximum).toBe(3);
  });
});
