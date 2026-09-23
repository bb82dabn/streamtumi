import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/presence", () => ({ viewerCounts: vi.fn(async () => ({})) }));
vi.mock("@/lib/stations", () => ({ viewerUrl: vi.fn(() => "https://example.com/watch/token") }));

import { becomeFan, rateStation, stopBeingFan } from "@/lib/guide";
import type { PublicStation } from "@/lib/public-access";

const user = { id: "user-1", email: "fan@example.com", displayName: "Fan", role: "USER" as const, mustChangePassword: false };
const publicStation = { id: "station-1", owner_id: "owner-1", visibility: "PUBLIC" } as PublicStation;

describe("station fan and rating safeguards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects engagement on private stations", async () => {
    await expect(becomeFan({ ...publicStation, visibility: "PRIVATE" }, user))
      .rejects.toMatchObject({ status: 409, code: "STATION_PRIVATE" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects owner engagement", async () => {
    await expect(rateStation({ ...publicStation, owner_id: user.id }, user, 5))
      .rejects.toMatchObject({ status: 409, code: "OWNER_ENGAGEMENT" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("uses idempotent fan writes and an upserted rating", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
    await becomeFan(publicStation, user);
    await stopBeingFan(publicStation, user);
    await rateStation(publicStation, user, 4);

    expect(mocks.query.mock.calls[0][0]).toMatch(/ON CONFLICT DO NOTHING/);
    expect(mocks.query.mock.calls[1][0]).toMatch(/DELETE FROM station_fans/);
    expect(mocks.query.mock.calls[2][0]).toMatch(/ON CONFLICT \(user_id, station_id\) DO UPDATE/);
    expect(mocks.query.mock.calls[2][1]).toEqual([user.id, publicStation.id, 4]);
  });
});
