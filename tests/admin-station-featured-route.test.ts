import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  setStationFeatured: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin-stations", () => ({ setStationFeatured: mocks.setStationFeatured }));

import { PATCH } from "@/app/api/admin/stations/[id]/featured/route";
import { HttpError } from "@/lib/http";

const stationId = "00000000-0000-4000-8000-000000000002";
const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  displayName: "Avery Admin",
  role: "ADMIN" as const,
  mustChangePassword: false,
};

function request(body: unknown): Request {
  return new Request(`http://localhost:3000/api/admin/stations/${stationId}/featured`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin station Featured route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(actor);
    mocks.setStationFeatured.mockResolvedValue({
      station: { id: stationId, name: "Editorial Station", isFeatured: true, updatedAt: "2026-08-18T12:00:00.000Z" },
      audit: null,
    });
  });

  it("accepts only the admin PATCH featured boolean contract", async () => {
    const response = await PATCH(request({ featured: true }), { params: Promise.resolve({ id: stationId }) });

    expect(response.status).toBe(200);
    expect(mocks.setStationFeatured).toHaveBeenCalledWith(stationId, true, actor);
    await expect(response.json()).resolves.toMatchObject({ station: { isFeatured: true } });

    const invalid = await PATCH(request({ featured: true, rank: 1 }), { params: Promise.resolve({ id: stationId }) });
    expect(invalid.status).toBe(400);
    expect(mocks.setStationFeatured).toHaveBeenCalledTimes(1);
  });

  it("rejects callers without administrator access before mutation", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new HttpError(403, "Administrator access is required.", "FORBIDDEN"));

    const response = await PATCH(request({ featured: true }), { params: Promise.resolve({ id: stationId }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.setStationFeatured).not.toHaveBeenCalled();
  });
});
