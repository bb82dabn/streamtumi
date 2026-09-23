import { getRedis } from "@/lib/redis";
import { HttpError } from "@/lib/http";

function requestIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function rateLimit(request: Request, scope: string, limit: number, windowSeconds: number): Promise<void> {
  return rateLimitByKey(scope, requestIp(request), limit, windowSeconds);
}

export async function rateLimitByKey(scope: string, identity: string, limit: number, windowSeconds: number): Promise<void> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rate:${scope}:${identity}:${bucket}`;
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds + 1);
  if (count > limit) throw new HttpError(429, "Too many requests. Please try again shortly.", "RATE_LIMITED");
}
