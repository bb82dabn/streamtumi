import { env } from "@/lib/env";

type CacheEntry = {
  expiresAt: number;
  promise: Promise<unknown>;
};

const entries = new Map<string, CacheEntry>();

export async function readGuideCatalogCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  const ttlSeconds = env().GUIDE_CATALOG_CACHE_SECONDS;
  if (ttlSeconds <= 0) return load();
  const cached = entries.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise as Promise<T>;
  const promise = load();
  entries.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, promise });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}

export function invalidateGuideCatalogCache(): void {
  entries.clear();
}

export function resetGuideCatalogCache(): void {
  entries.clear();
}
