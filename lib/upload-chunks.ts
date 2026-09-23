export const UPLOAD_CHUNK_SIZE_BYTES = 512 * 1024;
export const UPLOAD_CHUNK_CONCURRENCY = 3;
export const UPLOAD_CHUNK_RETRIES = 3;

const CHUNK_SOURCE_SEGMENT = "/chunked-sources/";
const RADIO_TRACK_CHUNK_SOURCE_SEGMENT = "/radio-track-chunked-sources/";
const CHUNK_INDEX_WIDTH = 8;

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
}

export function chunkCountForSize(totalSize: number, chunkSize = UPLOAD_CHUNK_SIZE_BYTES): number {
  assertPositiveSafeInteger(totalSize, "Upload size");
  assertPositiveSafeInteger(chunkSize, "Chunk size");
  return Math.ceil(totalSize / chunkSize);
}

export function chunkSizeForIndex(totalSize: number, index: number, chunkSize = UPLOAD_CHUNK_SIZE_BYTES): number {
  const chunkCount = chunkCountForSize(totalSize, chunkSize);
  if (!Number.isSafeInteger(index) || index < 0 || index >= chunkCount) throw new RangeError("Chunk index is out of range.");
  return index === chunkCount - 1 ? totalSize - index * chunkSize : chunkSize;
}

export function chunkSourcePrefix(stationId: string, videoId: string): string {
  return `stations/${stationId}/chunked-sources/${videoId}/`;
}

export function isChunkSourcePrefix(sourceKey: string): boolean {
  return /^stations\/[^/]+\/chunked-sources\/[^/]+\/$/.test(sourceKey) && sourceKey.includes(CHUNK_SOURCE_SEGMENT);
}

export function radioTrackChunkSourcePrefix(stationId: string, trackId: string): string {
  return `stations/${stationId}/radio-track-chunked-sources/${trackId}/`;
}

export function isRadioTrackChunkSourcePrefix(sourceKey: string): boolean {
  return /^stations\/[^/]+\/radio-track-chunked-sources\/[^/]+\/$/.test(sourceKey) && sourceKey.includes(RADIO_TRACK_CHUNK_SOURCE_SEGMENT);
}

export function chunkObjectKey(sourcePrefix: string, index: number): string {
  if (!isChunkSourcePrefix(sourcePrefix) && !isRadioTrackChunkSourcePrefix(sourcePrefix)) throw new RangeError("The source key is not a chunk-storage prefix.");
  if (!Number.isSafeInteger(index) || index < 0 || index >= 10 ** CHUNK_INDEX_WIDTH) throw new RangeError("Chunk index is invalid.");
  return `${sourcePrefix}${String(index).padStart(CHUNK_INDEX_WIDTH, "0")}.part`;
}

export type ChunkManifestItem = { index: number; name: string; size: number };

export function chunkManifest(sourcePrefix: string, totalSize: number, chunkSize = UPLOAD_CHUNK_SIZE_BYTES): ChunkManifestItem[] {
  return Array.from({ length: chunkCountForSize(totalSize, chunkSize) }, (_, index) => ({
    index,
    name: chunkObjectKey(sourcePrefix, index),
    size: chunkSizeForIndex(totalSize, index, chunkSize),
  }));
}

export type ChunkLengthValidation =
  | { ok: true; length: number }
  | { ok: false; reason: "invalid" | "too-large" | "mismatch" };

export function validateChunkLength(
  contentLength: string | null,
  expectedSize: number,
  maxSize = UPLOAD_CHUNK_SIZE_BYTES,
): ChunkLengthValidation {
  if (!contentLength || !/^\d+$/.test(contentLength)) return { ok: false, reason: "invalid" };
  const length = Number(contentLength);
  if (!Number.isSafeInteger(length) || length <= 0) return { ok: false, reason: "invalid" };
  if (length > maxSize) return { ok: false, reason: "too-large" };
  if (length !== expectedSize) return { ok: false, reason: "mismatch" };
  return { ok: true, length };
}

export type StoredChunk = { name: string; size: number };
export type ChunkInventoryValidation =
  | { ok: true; totalBytes: number }
  | { ok: false; reason: "count" | "path" | "size" | "total" };

export function validateChunkInventory(
  sourcePrefix: string,
  totalSize: number,
  chunks: StoredChunk[],
  chunkSize = UPLOAD_CHUNK_SIZE_BYTES,
): ChunkInventoryValidation {
  const expected = chunkManifest(sourcePrefix, totalSize, chunkSize);
  if (chunks.length !== expected.length) return { ok: false, reason: "count" };
  const ordered = [...chunks].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  let totalBytes = 0;
  for (let index = 0; index < expected.length; index += 1) {
    if (ordered[index].name !== expected[index].name) return { ok: false, reason: "path" };
    if (ordered[index].size !== expected[index].size) return { ok: false, reason: "size" };
    totalBytes += ordered[index].size;
  }
  return totalBytes === totalSize ? { ok: true, totalBytes } : { ok: false, reason: "total" };
}
