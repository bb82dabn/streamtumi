import { UPLOAD_CHUNK_RETRIES } from "@/lib/upload-chunks";

export function aggregateChunkProgress(chunkSizes: number[], loadedBytes: number[]): number {
  if (chunkSizes.length !== loadedBytes.length || chunkSizes.length === 0) return 0;
  const total = chunkSizes.reduce((sum, size) => sum + size, 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const loaded = loadedBytes.reduce((sum, value, index) => sum + Math.max(0, Math.min(value, chunkSizes[index])), 0);
  return loaded >= total ? 100 : Math.floor((loaded / total) * 100);
}

export function createConcurrencyLimiter(maxConcurrent: number) {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent <= 0) throw new RangeError("Concurrency must be a positive integer.");
  let active = 0;
  const pending: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    const start = () => {
      active += 1;
      resolve();
    };
    if (active < maxConcurrent) start();
    else pending.push(start);
  });
  const release = () => {
    active -= 1;
    pending.shift()?.();
  };
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function retryChunkUpload<T>(
  operation: (attempt: number) => Promise<T>,
  retries = UPLOAD_CHUNK_RETRIES,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  if (!Number.isSafeInteger(retries) || retries < 0) throw new RangeError("Retry count must be a non-negative integer.");
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt + 1);
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      if (attempt === retries) break;
      await wait(250 * 2 ** attempt);
    }
  }
  throw lastError;
}
