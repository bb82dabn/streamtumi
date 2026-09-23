import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
  removeAvatarRevision: vi.fn(),
  storeAvatarVariants: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/crypto", () => ({ randomToken: () => "R".repeat(43) }));
vi.mock("@/lib/avatar-image", () => ({
  avatarUrl: (revision: string, size = 96) => `/api/community/avatars/${revision}/${size}.jpg`,
  removeAvatarRevision: mocks.removeAvatarRevision,
  storeAvatarVariants: mocks.storeAvatarVariants,
}));

import { normalizeDisplayName, updateCommunityAvatar, updateCommunityDisplayName } from "@/lib/community-profile";

describe("community profile display names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storeAvatarVariants.mockResolvedValue(undefined);
    mocks.removeAvatarRevision.mockResolvedValue(2);
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
  });

  it("normalizes compatibility characters and whitespace", () => {
    expect(normalizeDisplayName("  Casey\u00a0\u00a0Ｏwner  ")).toBe("Casey Owner");
  });

  it.each(["A", "a".repeat(33), "Admin", "StreamTumi Support", "Casey\u202eOwner", "Casey\nOwner"])(
    "rejects an unsafe or reserved name: %s",
    (displayName) => {
      expect(() => normalizeDisplayName(displayName)).toThrow();
    },
  );

  it("updates the normalized name only at the expected users.version", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ display_name: "Casey Owner", avatar_revision: null, version: 8 }],
      rowCount: 1,
    });

    await expect(updateCommunityDisplayName("user-1", " Casey   Owner ", 7)).resolves.toEqual({
      displayName: "Casey Owner",
      avatarUrl: null,
      version: 8,
    });
    expect(mocks.query.mock.calls[0][0]).toContain("version = $3");
    expect(mocks.query.mock.calls[0][1]).toEqual(["user-1", "Casey Owner", 7]);
  });

  it("reports an optimistic concurrency conflict", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(updateCommunityDisplayName("user-1", "Casey Owner", 7))
      .rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });

  it("publishes a new avatar only after locking the expected profile version", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ display_name: "Casey", avatar_revision: "O".repeat(43), version: 7 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ display_name: "Casey", avatar_revision: "R".repeat(43), version: 8 }], rowCount: 1 });
    const variants = { 96: Buffer.from("small"), 256: Buffer.from("large") };

    await expect(updateCommunityAvatar("user-1", 7, variants)).resolves.toMatchObject({
      avatarUrl: `/api/community/avatars/${"R".repeat(43)}/256.jpg`,
      version: 8,
    });
    expect(mocks.storeAvatarVariants).toHaveBeenCalledWith("R".repeat(43), variants);
    expect(mocks.clientQuery.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(mocks.clientQuery.mock.calls[1][1]).toEqual(["user-1", "R".repeat(43), 7]);
    expect(mocks.removeAvatarRevision).toHaveBeenCalledWith("O".repeat(43));
  });

  it("removes an unpublished avatar when the profile version is stale", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [{ display_name: "Casey", avatar_revision: null, version: 8 }], rowCount: 1 });

    await expect(updateCommunityAvatar("user-1", 7, { 96: Buffer.from("small"), 256: Buffer.from("large") }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(mocks.removeAvatarRevision).toHaveBeenCalledWith("R".repeat(43));
  });
});
