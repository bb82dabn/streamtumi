import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const token = "A".repeat(43);
const tuneId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  assertCanRecordTune: vi.fn(),
  clearTuneHistory: vi.fn(),
  parseTune: vi.fn(),
  rateLimitByKey: vi.fn(),
  recordTune: vi.fn(),
  requireMobileAuth: vi.fn(),
  resolvePublicStation: vi.fn(),
}));

vi.mock("@/lib/mobile-auth", () => ({ requireMobileAuth: mocks.requireMobileAuth }));
vi.mock("@/lib/public-access", () => ({ resolvePublicStation: mocks.resolvePublicStation }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/tune-history", () => ({
  TUNE_HISTORY_RETENTION_DAYS: 90,
  assertCanRecordTune: mocks.assertCanRecordTune,
  clearTuneHistory: mocks.clearTuneHistory,
  mobileTuneSchema: { parse: mocks.parseTune },
  recordTune: mocks.recordTune,
}));

import { DELETE } from "@/app/api/mobile/v1/account/tune-history/route";
import { POST } from "@/app/api/mobile/v1/tunes/route";

const user = { id: "user" };
const station = { id: "station", owner_id: "owner", visibility: "PUBLIC", access_password_hash: null };

function request(path: string, method: "POST" | "DELETE", body?: unknown) {
  return new Request(`https://example.test/api/mobile/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("mobile personalization routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileAuth.mockResolvedValue({ token, user });
    mocks.parseTune.mockReturnValue({ id: tuneId, stationToken: token });
    mocks.resolvePublicStation.mockResolvedValue(station);
    mocks.recordTune.mockResolvedValue({
      id: tuneId,
      stationId: station.id,
      client: "MOBILE",
      tunedAt: "2026-08-18T12:00:00.000Z",
      created: true,
    });
  });

  it("rate limits a verified mobile user and records a resolved public station", async () => {
    const response = await POST(request("tunes", "POST", { id: tuneId, stationToken: token }));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.requireMobileAuth).toHaveBeenCalled();
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("mobile-v1-tunes", user.id, 30, 60);
    expect(mocks.resolvePublicStation).toHaveBeenCalledWith(token);
    expect(mocks.assertCanRecordTune).toHaveBeenCalledWith(station, user.id);
    expect(mocks.recordTune).toHaveBeenCalledWith(tuneId, user.id, station.id, "MOBILE");
    await expect(response.json()).resolves.toEqual({
      tune: {
        id: tuneId,
        stationId: station.id,
        client: "MOBILE",
        tunedAt: "2026-08-18T12:00:00.000Z",
      },
    });
  });

  it("returns 200 for an idempotent retry", async () => {
    mocks.recordTune.mockResolvedValueOnce({
      id: tuneId,
      stationId: station.id,
      client: "MOBILE",
      tunedAt: "2026-08-18T12:00:00.000Z",
      created: false,
    });

    expect((await POST(request("tunes", "POST", { id: tuneId, stationToken: token }))).status).toBe(200);
  });

  it("does not resolve or record a station without a verified bearer", async () => {
    mocks.requireMobileAuth.mockRejectedValueOnce(new HttpError(401, "A valid bearer token is required.", "UNAUTHENTICATED"));

    const response = await POST(request("tunes", "POST", { id: tuneId, stationToken: token }));
    expect(response.status).toBe(401);
    expect(mocks.rateLimitByKey).not.toHaveBeenCalled();
    expect(mocks.resolvePublicStation).not.toHaveBeenCalled();
    expect(mocks.recordTune).not.toHaveBeenCalled();
  });

  it("deletes only the authenticated user's history", async () => {
    mocks.clearTuneHistory.mockResolvedValueOnce(4);

    const response = await DELETE(request("account/tune-history", "DELETE"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.clearTuneHistory).toHaveBeenCalledWith(user.id);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 4, retentionDays: 90 });
  });
});
