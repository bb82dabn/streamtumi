import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(async () => ({
    id: "user-1",
    email: "moderator@example.com",
    displayName: "Moderator",
    role: "MODERATOR",
    mustChangePassword: true,
  })),
}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/chat-events", () => ({ publishStationEvent: vi.fn() }));

import { moderationActor } from "@/lib/moderation";

describe("forced password management isolation", () => {
  it("blocks a forced-change human session from moderation features", async () => {
    await expect(moderationActor(new Request("http://localhost/api/moderation/reports"), "reports:read"))
      .rejects.toMatchObject({ status: 403, code: "PASSWORD_CHANGE_REQUIRED" });
  });
});
