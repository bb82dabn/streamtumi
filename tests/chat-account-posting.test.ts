import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  query: vi.fn(),
  jar: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/crypto", () => ({
  hashToken: (value: string) => `hash:${value}`,
  randomToken: () => "new-guest-token",
}));
vi.mock("@/lib/env", () => ({ env: () => ({ CHAT_RETENTION_DAYS: 30 }) }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.jar }));

import { chatActor, createMessage, presentMessage, recentMessages, registeredChatActor } from "@/lib/chat";
import type { PublicStation } from "@/lib/public-access";

const station = { id: "station-1", owner_id: "owner-1" } as PublicStation;
const guest = { kind: "GUEST", id: "guest-1", name: "Legacy Guest" } as const;

describe("registered-account chat posting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue(null);
  });

  it("does not accept a persisted guest identity for a posting actor", async () => {
    mocks.jar.get.mockReturnValue({ value: "legacy-guest-token" });

    await expect(chatActor(station)).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(mocks.jar.get).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps guest identities available to anonymous read-side callers", async () => {
    mocks.jar.get.mockReturnValue({ value: "legacy-guest-token" });
    mocks.query.mockResolvedValue({
      rows: [{ id: guest.id, display_name: guest.name, token_hash: "hash:legacy-guest-token" }],
      rowCount: 1,
    });

    await expect(chatActor(station, false)).resolves.toMatchObject(guest);
  });

  it("rejects guest message creation as a domain invariant", async () => {
    await expect(createMessage(station.id, guest, "No longer allowed"))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("continues presenting historical guest messages", () => {
    expect(presentMessage({
      id: "message-1",
      station_id: station.id,
      author_kind: "GUEST",
      author_name: guest.name,
      avatar_revision: null,
      body: "Earlier message",
      created_at: new Date("2026-08-18T12:00:00.000Z"),
      pinned_at: null,
      hidden_at: null,
    })).toMatchObject({ authorKind: "GUEST", authorName: guest.name, avatarUrl: null, body: "Earlier message" });
  });

  it("presents a current opaque avatar URL without a public user id", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: "message-2",
      station_id: station.id,
      author_kind: "REGISTERED",
      author_name: "Casey",
      avatar_revision: "R".repeat(43),
      body: "Hello",
      created_at: new Date("2026-08-18T12:00:00.000Z"),
      pinned_at: null,
      hidden_at: null,
    }] });

    const [message] = await recentMessages(station.id);
    expect(message).toMatchObject({ avatarUrl: `/api/community/avatars/${"R".repeat(43)}/96.jpg` });
    expect(message).not.toHaveProperty("authorUserId");
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("LEFT JOIN users");
    expect(sql).toContain("u.deletion_requested_at IS NULL");
  });

  it("preserves the host actor used by moderation", async () => {
    const owner = {
      id: station.owner_id,
      email: "owner@example.com",
      displayName: "Host",
      role: "USER" as const,
      mustChangePassword: false,
      emailVerified: true,
    };
    mocks.currentUser.mockResolvedValue(owner);

    await expect(chatActor(station)).resolves.toMatchObject({ kind: "HOST", id: owner.id });
    expect(registeredChatActor(station, owner)).toMatchObject({ kind: "HOST", id: owner.id });
  });

  it("lets an unverified account read chat but not post", async () => {
    const listener = {
      id: "listener-1",
      email: "listener@example.com",
      displayName: "Listener",
      role: "USER" as const,
      mustChangePassword: false,
      emailVerified: false,
    };
    mocks.currentUser.mockResolvedValue(listener);

    await expect(chatActor(station, false)).resolves.toMatchObject({ kind: "REGISTERED", id: listener.id });
    await expect(chatActor(station)).rejects.toMatchObject({ status: 403, code: "EMAIL_VERIFICATION_REQUIRED" });
  });
});
