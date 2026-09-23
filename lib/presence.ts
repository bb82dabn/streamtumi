import { cookies } from "next/headers";
import { hashToken, randomToken } from "@/lib/crypto";
import { getRedis } from "@/lib/redis";
import { publishStationEvent } from "@/lib/chat-events";

const presenceCookie = "st_viewer";
export const PRESENCE_HEARTBEAT_MS = 15_000;
export const PRESENCE_TTL_MS = 45_000;

function key(stationId: string): string {
  return `presence:station:${stationId}`;
}

async function pruneAndCount(stationId: string, member?: string): Promise<number> {
  const now = Date.now();
  const script = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    if ARGV[2] ~= '' then redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2]) end
    redis.call('PEXPIRE', KEYS[1], ARGV[4])
    return redis.call('ZCARD', KEYS[1])
  `;
  return Number(await getRedis().eval(script, 1, key(stationId), now - PRESENCE_TTL_MS, member ?? "", now, PRESENCE_TTL_MS * 2));
}

export async function heartbeatPresence(stationId: string): Promise<number> {
  const jar = await cookies();
  let token = jar.get(presenceCookie)?.value;
  if (!token) {
    token = randomToken();
    jar.set(presenceCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  const count = await pruneAndCount(stationId, hashToken(token));
  const lastKey = `presence:last:${stationId}`;
  const previous = await getRedis().getset(lastKey, String(count));
  await getRedis().expire(lastKey, Math.ceil(PRESENCE_TTL_MS / 1000) * 2);
  if (previous !== String(count)) await publishStationEvent(stationId, { type: "presence", data: { viewerCount: count } });
  return count;
}

export async function viewerCount(stationId: string): Promise<number> {
  return pruneAndCount(stationId);
}

export async function viewerCounts(stationIds: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(stationIds.map(async (id) => [id, await viewerCount(id)] as const));
  return Object.fromEntries(entries);
}
