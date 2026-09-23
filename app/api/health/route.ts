import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { bucket, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function withTimeout<T>(operation: Promise<T>, timeoutMs = 3_000): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Health check timed out.")), timeoutMs)),
  ]);
}

export async function GET() {
  const results = await Promise.allSettled([
    withTimeout(query("SELECT 1")),
    withTimeout(getRedis().ping()),
    withTimeout(storage.bucketExists(bucket)),
  ]);
  const checks = {
    database: results[0].status === "fulfilled" ? "ok" : "error",
    redis: results[1].status === "fulfilled" && results[1].value === "PONG" ? "ok" : "error",
    storage: results[2].status === "fulfilled" && results[2].value ? "ok" : "error",
  };
  const healthy = Object.values(checks).every((value) => value === "ok");
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
