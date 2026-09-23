import { beforeEach, describe, expect, it, vi } from "vitest";

const accessToken = "A".repeat(43);
const user = { id: "user-1" };
const mocks = vi.hoisted(() => ({
  rateLimitByKey: vi.fn(),
  requestMobileAccountDeletion: vi.fn(),
  requireMobileAuth: vi.fn(),
  updateMobileAdultPreference: vi.fn(),
}));

vi.mock("@/lib/mobile-auth", () => ({ requireMobileAuth: mocks.requireMobileAuth }));
vi.mock("@/lib/mobile-account", () => ({
  requestMobileAccountDeletion: mocks.requestMobileAccountDeletion,
  updateMobileAdultPreference: mocks.updateMobileAdultPreference,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));

import { PATCH as updateContentPreference } from "@/app/api/mobile/v1/account/content-preferences/route";
import { POST as deleteAccount } from "@/app/api/mobile/v1/account/delete/route";

function request(path: string, body: unknown) {
  return new Request(`https://streamtumi.test/api/mobile/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mobile account lifecycle routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileAuth.mockResolvedValue({ token: accessToken, user });
  });

  it("requires explicit 18+ confirmation only when enabling adult content", async () => {
    const rejected = await updateContentPreference(request("account/content-preferences", { showExplicitContent: true }));
    expect(rejected.status).toBe(400);
    expect(mocks.updateMobileAdultPreference).not.toHaveBeenCalled();

    mocks.updateMobileAdultPreference.mockResolvedValueOnce({
      showExplicitContent: false,
      explicitAgeAttestedAt: "2026-08-18T12:00:00.000Z",
    });
    const disabled = await updateContentPreference(request("account/content-preferences", { showExplicitContent: false }));
    expect(disabled.status).toBe(200);
    await expect(disabled.json()).resolves.toMatchObject({
      showExplicitContent: false,
      explicitAgeAttestedAt: "2026-08-18T12:00:00.000Z",
    });
  });

  it("returns an accepted deletion-requested response", async () => {
    mocks.requestMobileAccountDeletion.mockResolvedValueOnce(undefined);
    const response = await deleteAccount(request("account/delete", {
      confirmationEmail: "owner@example.com",
      currentPassword: "current-password",
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletionRequested: true,
    });
    expect(mocks.requestMobileAccountDeletion).toHaveBeenCalledWith(
      user.id,
      "owner@example.com",
      "current-password",
    );
  });
});
