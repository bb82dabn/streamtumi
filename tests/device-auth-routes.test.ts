import { beforeEach, describe, expect, it, vi } from "vitest";

const stationToken = "S".repeat(43);
const tuneId = "00000000-0000-4000-8000-000000000001";
const deviceId = "00000000-0000-4000-8000-000000000002";
const mocks = vi.hoisted(() => ({
  assertCanRecordTune: vi.fn(),
  rateLimitByKey: vi.fn(),
  recordTune: vi.fn(),
  requireDeviceAuth: vi.fn(),
  requireMobileAuth: vi.fn(),
  resolvePublicStation: vi.fn(),
  revokeCurrentDevice: vi.fn(),
  revokeLinkedDevice: vi.fn(),
}));

vi.mock("@/lib/device-auth", () => ({
  requireDeviceAuth: mocks.requireDeviceAuth,
  revokeCurrentDevice: mocks.revokeCurrentDevice,
  revokeLinkedDevice: mocks.revokeLinkedDevice,
}));
vi.mock("@/lib/mobile-auth", () => ({ requireMobileAuth: mocks.requireMobileAuth }));
vi.mock("@/lib/public-access", () => ({ resolvePublicStation: mocks.resolvePublicStation }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/tune-history", () => ({
  assertCanRecordTune: mocks.assertCanRecordTune,
  recordTune: mocks.recordTune,
}));

import { POST as postTune } from "@/app/api/device/v1/tunes/route";
import { POST as unlinkCurrent } from "@/app/api/device/v1/session/route";
import { DELETE as revokeMobileDevice } from "@/app/api/mobile/v1/account/devices/[deviceId]/route";

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://streamtumi.test/api/${path}`, init);
}

describe("device session routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDeviceAuth.mockResolvedValue({
      sessionId: deviceId,
      deviceType: "ROKU",
      user: { id: "user-id" },
    });
    mocks.requireMobileAuth.mockResolvedValue({ user: { id: "user-id" } });
    mocks.resolvePublicStation.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000003",
      owner_id: "owner-id",
      visibility: "PUBLIC",
      access_password_hash: null,
    });
    mocks.recordTune.mockResolvedValue({
      id: tuneId,
      stationId: "00000000-0000-4000-8000-000000000003",
      client: "ROKU",
      tunedAt: "2026-08-18T12:00:30.000Z",
      created: true,
    });
    mocks.revokeLinkedDevice.mockResolvedValue(true);
  });

  it("records an idempotent tune using the authenticated device type", async () => {
    const response = await postTune(request("device/v1/tunes", {
      method: "POST",
      headers: { Authorization: `Device ${"T".repeat(43)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: tuneId, stationToken }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireDeviceAuth).toHaveBeenCalledWith(expect.any(Request), "tunes:write");
    expect(mocks.recordTune).toHaveBeenCalledWith(tuneId, "user-id", "00000000-0000-4000-8000-000000000003", "ROKU");
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("device-v1-tunes", deviceId, 30, 60);

    mocks.recordTune.mockResolvedValueOnce({
      id: tuneId,
      stationId: "00000000-0000-4000-8000-000000000003",
      client: "ROKU",
      tunedAt: "2026-08-18T12:00:30.000Z",
      created: false,
    });
    expect((await postTune(request("device/v1/tunes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tuneId, stationToken }),
    }))).status).toBe(200);
  });

  it("revokes the current scoped session without affecting playback APIs", async () => {
    const response = await unlinkCurrent(request("device/v1/session", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.requireDeviceAuth).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.revokeCurrentDevice).toHaveBeenCalledWith(deviceId);
  });

  it("constrains mobile revocation to the bearer user", async () => {
    const response = await revokeMobileDevice(
      request(`mobile/v1/account/devices/${deviceId}`, { method: "DELETE" }),
      { params: Promise.resolve({ deviceId }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.revokeLinkedDevice).toHaveBeenCalledWith("user-id", deviceId);
  });
});
