import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  query: vi.fn(),
  jar: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/crypto", () => ({ hashToken: (value: string) => value, randomToken: () => "token" }));
vi.mock("@/lib/env", () => ({ env: () => ({ CHAT_RETENTION_DAYS: 30 }) }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.jar }));

import { pinnedMessages, recentMessages } from "@/lib/chat";

describe("blocked chat filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("filters registered and guest block targets for authenticated history and pins", async () => {
    await recentMessages("station-1", undefined, 100, "viewer-1");
    await pinnedMessages("station-1", "viewer-1");

    for (const [sql, values] of mocks.query.mock.calls) {
      expect(String(sql)).toContain("NOT EXISTS");
      expect(String(sql)).toContain("b.blocked_user_id = m.author_user_id");
      expect(String(sql)).toContain("b.blocked_guest_id = m.author_guest_id");
      expect(values).toContain("viewer-1");
    }
  });

  it("leaves anonymous history and pinned reads unchanged", async () => {
    await recentMessages("station-1");
    await pinnedMessages("station-1");

    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain("user_blocks");
    expect(String(mocks.query.mock.calls[1]?.[0])).not.toContain("user_blocks");
  });
});
