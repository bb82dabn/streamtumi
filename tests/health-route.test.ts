import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bucketExists: vi.fn(),
  ping: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ ping: mocks.ping }) }));
vi.mock("@/lib/storage", () => ({ bucket: "media", storage: { bucketExists: mocks.bucketExists } }));

import { GET } from "@/app/api/health/route";

describe("service health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [{ ok: 1 }] });
    mocks.ping.mockResolvedValue("PONG");
    mocks.bucketExists.mockResolvedValue(true);
  });

  it("checks dependencies independently and never returns raw errors", async () => {
    mocks.query.mockRejectedValueOnce(new Error("postgresql://secret@database/internal"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({
      status: "degraded",
      checks: { database: "error", redis: "ok", storage: "ok" },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(mocks.ping).toHaveBeenCalledOnce();
    expect(mocks.bucketExists).toHaveBeenCalledOnce();
  });

  it("reports healthy only when every core dependency succeeds", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok", storage: "ok" },
    });
    expect(response.status).toBe(200);
  });
});
