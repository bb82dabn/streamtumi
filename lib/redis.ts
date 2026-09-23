import IORedis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { channelLoopRedis?: IORedis };

export function getRedis(): IORedis {
  if (!globalForRedis.channelLoopRedis) {
    const client = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
    client.on("error", (error) => console.error("Redis connection error:", error.message));
    globalForRedis.channelLoopRedis = client;
  }
  return globalForRedis.channelLoopRedis;
}
