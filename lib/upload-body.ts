import { HttpError } from "@/lib/http";

export async function readBoundedUploadBody(
  body: ReadableStream<Uint8Array> | null,
  expectedSize: number,
  maxSize: number,
): Promise<Buffer> {
  if (!body) throw new HttpError(400, "The chunk body is empty.", "EMPTY_CHUNK");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxSize || total > expectedSize) {
        await reader.cancel("Chunk body exceeded its declared size.").catch(() => undefined);
        throw new HttpError(413, "The chunk body exceeds the allowed size.", "CHUNK_TOO_LARGE");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedSize) throw new HttpError(400, "The chunk body size does not match Content-Length.", "CHUNK_SIZE_MISMATCH");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}
