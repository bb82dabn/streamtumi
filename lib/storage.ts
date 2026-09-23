import { Client } from "minio";
import { env } from "@/lib/env";

const config = env();
const globalForStorage = globalThis as unknown as { channelLoopStorage?: Client };

export const storage =
  globalForStorage.channelLoopStorage ??
  new Client({
    endPoint: config.S3_ENDPOINT,
    port: config.S3_PORT,
    useSSL: config.S3_USE_SSL,
    accessKey: config.S3_ACCESS_KEY,
    secretKey: config.S3_SECRET_KEY,
    region: config.S3_REGION,
  });

if (process.env.NODE_ENV !== "production") globalForStorage.channelLoopStorage = storage;

export const bucket = config.S3_BUCKET;

export async function ensureBucket(): Promise<void> {
  if (!(await storage.bucketExists(bucket))) await storage.makeBucket(bucket, config.S3_REGION);
}

export async function removePrefix(prefix: string): Promise<number> {
  const stream = storage.listObjectsV2(bucket, prefix, true);
  let batch: string[] = [];
  let removed = 0;
  for await (const item of stream) {
    if (!item.name) continue;
    batch.push(item.name);
    if (batch.length >= 1000) {
      await storage.removeObjects(bucket, batch);
      removed += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await storage.removeObjects(bucket, batch);
    removed += batch.length;
  }
  return removed;
}
