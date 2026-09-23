import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  studioOverview: vi.fn(),
  setStudioEnabled: vi.fn(),
  studioKindForStation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/studio", () => ({
  studioOverview: mocks.studioOverview,
  setStudioEnabled: mocks.setStudioEnabled,
  studioKindForStation: mocks.studioKindForStation,
}));

import { GET, PATCH } from "@/app/api/stations/[id]/studio/route";

const stationId = "00000000-0000-4000-8000-000000000001";
const overview = {
  station: { id: stationId, name: "Station", kind: "RADIO", broadcastState: "RUNNING" },
  settings: { enabled: true, readiness: "WORKSPACE", version: 2, liveAvailable: false },
  projects: [],
};

describe("Studio owner routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner-1" });
    mocks.studioOverview.mockResolvedValue(overview);
    mocks.setStudioEnabled.mockResolvedValue(overview.settings);
    mocks.studioKindForStation.mockResolvedValue("RADIO");
  });

  it("scopes reads to the authenticated owner and product kind", async () => {
    const response = await GET(new Request(`https://radio.streamtumi.test/api/stations/${stationId}/studio`, {
      headers: { "x-streamtumi-product": "RADIO" },
    }), { params: Promise.resolve({ id: stationId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.studioKindForStation).toHaveBeenCalledWith(stationId, "owner-1");
    expect(mocks.studioOverview).toHaveBeenCalledWith(stationId, "owner-1", "RADIO");
  });

  it("uses a TV database row even when the client asserts Radio", async () => {
    mocks.studioKindForStation.mockResolvedValueOnce("TV");
    await GET(new Request(`https://streamtumi.test/api/stations/${stationId}/studio`, {
      headers: { "x-streamtumi-product": "RADIO" },
    }), { params: Promise.resolve({ id: stationId }) });

    expect(mocks.studioOverview).toHaveBeenCalledWith(stationId, "owner-1", "TV");
  });

  it("validates and forwards optimistic enablement changes", async () => {
    const response = await PATCH(new Request(`https://radio.streamtumi.test/api/stations/${stationId}/studio`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-streamtumi-product": "RADIO" },
      body: JSON.stringify({ enabled: false, expectedVersion: 2 }),
    }), { params: Promise.resolve({ id: stationId }) });

    expect(response.status).toBe(200);
    expect(mocks.setStudioEnabled).toHaveBeenCalledWith(stationId, "owner-1", "RADIO", false, 2);
  });

  it("rejects unknown mutation fields before calling the service", async () => {
    const response = await PATCH(new Request(`https://streamtumi.test/api/stations/${stationId}/studio`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, expectedVersion: 2, live: true }),
    }), { params: Promise.resolve({ id: stationId }) });

    expect(response.status).toBe(400);
    expect(mocks.setStudioEnabled).not.toHaveBeenCalled();
  });
});
