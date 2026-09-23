import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  becomeFan: vi.fn(),
  rateLimitByKey: vi.fn(),
  rateStation: vi.fn(),
  requireApiUser: vi.fn(),
  resolvePublicStation: vi.fn(),
  stationEngagement: vi.fn(),
  stopBeingFan: vi.fn(),
  clearStationRating: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/guide", () => ({
  becomeFan: mocks.becomeFan,
  clearStationRating: mocks.clearStationRating,
  rateStation: mocks.rateStation,
  stationEngagement: mocks.stationEngagement,
  stopBeingFan: mocks.stopBeingFan,
}));
vi.mock("@/lib/public-access", () => ({ resolvePublicStation: mocks.resolvePublicStation }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));

import { PUT as becomeFan } from "@/app/api/public/stations/[token]/fan/route";
import { PUT as rateStation } from "@/app/api/public/stations/[token]/rating/route";

const context = { params: Promise.resolve({ token: "station-token" }) };

describe("web community email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      id: "user-1",
      email: "listener@example.com",
      displayName: "Listener",
      role: "USER",
      mustChangePassword: false,
      emailVerified: false,
    });
  });

  it.each([
    ["fan", becomeFan, undefined],
    ["rating", rateStation, { rating: 5 }],
  ])("blocks an unverified account from the %s mutation without blocking auth", async (_name, handler, body) => {
    const response = await handler(new Request("http://localhost/api/public/stations/station-token", {
      method: "PUT",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
    expect(mocks.resolvePublicStation).not.toHaveBeenCalled();
    expect(mocks.becomeFan).not.toHaveBeenCalled();
    expect(mocks.rateStation).not.toHaveBeenCalled();
  });
});
