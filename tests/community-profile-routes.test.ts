import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMobileAuth: vi.fn(),
  requireVerifiedMobileUser: vi.fn(),
  communityProfile: vi.fn(),
  updateCommunityDisplayName: vi.fn(),
  updateCommunityAvatar: vi.fn(),
  deleteCommunityAvatar: vi.fn(),
  readAvatarUpload: vi.fn(),
  createAvatarVariants: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/mobile-auth", () => ({ requireMobileAuth: mocks.requireMobileAuth }));
vi.mock("@/lib/mobile-community", () => ({ requireVerifiedMobileUser: mocks.requireVerifiedMobileUser }));
vi.mock("@/lib/community-profile", () => ({
  communityProfile: mocks.communityProfile,
  updateCommunityDisplayName: mocks.updateCommunityDisplayName,
  updateCommunityAvatar: mocks.updateCommunityAvatar,
  deleteCommunityAvatar: mocks.deleteCommunityAvatar,
}));
vi.mock("@/lib/avatar-image", () => ({
  readAvatarUpload: mocks.readAvatarUpload,
  createAvatarVariants: mocks.createAvatarVariants,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { GET, PATCH } from "@/app/api/mobile/v1/account/profile/route";
import { DELETE, PUT } from "@/app/api/mobile/v1/account/avatar/route";

const user = { id: "user-1", emailVerified: true };
const profile = { displayName: "Casey Owner", avatarUrl: null, version: 4 };

describe("mobile community profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileAuth.mockResolvedValue({ token: "T".repeat(43), user });
    mocks.requireVerifiedMobileUser.mockResolvedValue(user);
    mocks.communityProfile.mockResolvedValue(profile);
    mocks.updateCommunityDisplayName.mockResolvedValue({ ...profile, version: 5 });
    mocks.updateCommunityAvatar.mockResolvedValue({ ...profile, avatarUrl: "/avatar.jpg", version: 5 });
    mocks.deleteCommunityAvatar.mockResolvedValue({ ...profile, version: 5 });
    mocks.readAvatarUpload.mockResolvedValue({ body: Buffer.from("image"), contentType: "image/jpeg" });
    mocks.createAvatarVariants.mockResolvedValue({ 96: Buffer.from("small"), 256: Buffer.from("large") });
  });

  it("allows a MOBILE bearer read but requires verified bearer auth for name changes", async () => {
    const read = await GET(new Request("https://streamtumi.test/api/mobile/v1/account/profile"));
    const update = await PATCH(new Request("https://streamtumi.test/api/mobile/v1/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Casey Owner", expectedVersion: 4 }),
    }));

    expect(read.status).toBe(200);
    expect(update.status).toBe(200);
    expect(mocks.requireMobileAuth).toHaveBeenCalledTimes(1);
    expect(mocks.requireVerifiedMobileUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateCommunityDisplayName).toHaveBeenCalledWith(user.id, "Casey Owner", 4);
    expect(update.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("uses the URL version for raw avatar upload and removal", async () => {
    const upload = await PUT(new Request("https://streamtumi.test/api/mobile/v1/account/avatar?expectedVersion=4", { method: "PUT" }));
    const remove = await DELETE(new Request("https://streamtumi.test/api/mobile/v1/account/avatar?expectedVersion=5", { method: "DELETE" }));

    expect(upload.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(mocks.updateCommunityAvatar).toHaveBeenCalledWith(user.id, 4, expect.objectContaining({ 96: expect.any(Buffer), 256: expect.any(Buffer) }));
    expect(mocks.deleteCommunityAvatar).toHaveBeenCalledWith(user.id, 5);
    expect(mocks.requireVerifiedMobileUser).toHaveBeenCalledTimes(2);
  });
});
