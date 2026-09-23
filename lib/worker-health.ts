import os from "node:os";
import { getRedis } from "@/lib/redis";

export type WorkerHeartbeat = {
  stop: () => Promise<void>;
};

export async function startWorkerHeartbeat(name: string): Promise<WorkerHeartbeat> {
  const redis = getRedis();
  const key = `health:worker:${name}:${os.hostname()}`;
  const readyKey = `health:worker:${name}-ready`;
  const write = async () => {
    const now = String(Date.now());
    await Promise.all([
      redis.set(key, now, "EX", 30),
      redis.set(readyKey, now, "EX", 30),
    ]);
  };
  await write();
  const timer = setInterval(() => void write().catch((error) => {
    console.error(`${name} worker heartbeat failed:`, error);
  }), 10_000);
  timer.unref();
  return {
    stop: async () => {
      clearInterval(timer);
      await redis.del(key);
    },
  };
}
