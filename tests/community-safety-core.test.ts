import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/moderation", () => ({ reportReference: () => "ST-0123456789" }));

import {
  blockMessageAuthor,
  createContentReport,
  listUserBlocks,
  unblockById,
  unblockMessageAuthor,
} from "@/lib/community-safety";
import type { AuthUser } from "@/lib/auth";
import type { PublicStation } from "@/lib/public-access";

const blocker = { id: "00000000-0000-4000-8000-000000000001", emailVerified: true } as Pick<AuthUser, "id" | "emailVerified">;
const registeredId = "00000000-0000-4000-8000-000000000002";
const guestId = "00000000-0000-4000-8000-000000000003";
const messageId = "00000000-0000-4000-8000-000000000004";
const station = {
  id: "00000000-0000-4000-8000-000000000005",
  name: "Safety Radio",
  description: "A station description",
  active_schedule_id: "schedule-active",
  pending_schedule_id: null,
} as PublicStation;
const blockRow = {
  id: "00000000-0000-4000-8000-000000000006",
  blocked_user_id: registeredId,
  snapshot_display_name: "Casey",
  created_at: new Date("2026-08-18T12:00:00.000Z"),
};

describe("community blocking core", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives and idempotently blocks a registered target without returning its user id", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ author_kind: "REGISTERED", author_user_id: registeredId, author_guest_id: null, author_name: "Casey", guest_exists: false }] })
      .mockResolvedValueOnce({ rows: [blockRow] })
      .mockResolvedValueOnce({ rows: [{ author_kind: "REGISTERED", author_user_id: registeredId, author_guest_id: null, author_name: "Casey", guest_exists: false }] })
      .mockResolvedValueOnce({ rows: [blockRow] });

    const block = await blockMessageAuthor(blocker, station.id, messageId);
    const repeated = await blockMessageAuthor(blocker, station.id, messageId);

    expect(block).toEqual({
      id: blockRow.id,
      kind: "REGISTERED",
      snapshotDisplayName: "Casey",
      blockedAt: "2026-08-18T12:00:00.000Z",
    });
    expect(block).not.toHaveProperty("blockedUserId");
    expect(repeated).toEqual(block);
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain("ON CONFLICT (blocker_user_id, blocked_user_id)");
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([blocker.id, registeredId, "Casey"]);
  });

  it("blocks and unblocks an existing historical guest identity", async () => {
    const guestTarget = { author_kind: "GUEST", author_user_id: null, author_guest_id: guestId, author_name: "Earlier Guest", guest_exists: true };
    mocks.query
      .mockResolvedValueOnce({ rows: [guestTarget] })
      .mockResolvedValueOnce({ rows: [{ ...blockRow, blocked_user_id: null, snapshot_display_name: "Earlier Guest" }] })
      .mockResolvedValueOnce({ rows: [guestTarget] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(blockMessageAuthor(blocker, station.id, messageId)).resolves.toMatchObject({ kind: "GUEST", snapshotDisplayName: "Earlier Guest" });
    await expect(unblockMessageAuthor(blocker.id, station.id, messageId)).resolves.toBe(true);
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain("blocked_guest_id");
    expect(String(mocks.query.mock.calls[3]?.[0])).toContain("blocked_guest_id = $2");
  });

  it("rejects self-blocking and guest messages whose identity has expired", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ author_kind: "REGISTERED", author_user_id: blocker.id, author_guest_id: null, author_name: "Me", guest_exists: false }] });
    await expect(blockMessageAuthor(blocker, station.id, messageId)).rejects.toMatchObject({ code: "SELF_BLOCK" });
    expect(mocks.query).toHaveBeenCalledTimes(1);

    mocks.query.mockReset();
    mocks.query.mockResolvedValueOnce({ rows: [{ author_kind: "GUEST", author_user_id: null, author_guest_id: null, author_name: "Gone", guest_exists: false }] });
    await expect(blockMessageAuthor(blocker, station.id, messageId)).rejects.toMatchObject({ code: "BLOCK_TARGET_UNAVAILABLE" });
  });

  it("lists and removes blocks only through opaque block ids", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [blockRow] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const blocks = await listUserBlocks(blocker.id);
    expect(blocks[0]).not.toHaveProperty("blockedUserId");
    await expect(unblockById(blocker.id, blockRow.id)).resolves.toBe(true);
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([blockRow.id, blocker.id]);
  });
});

describe("community reporting evidence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("captures current message evidence and associates a signed-in reporter", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: messageId, author_name: "Casey", author_kind: "REGISTERED", body: "Evidence body", created_at: new Date("2026-08-18T10:00:00.000Z") }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(createContentReport(station, {
      subjectType: "CHAT_MESSAGE",
      messageId,
      reason: "HATE_OR_HARASSMENT",
      details: "This message needs moderator review.",
    }, { userId: blocker.id })).resolves.toBe("ST-0123456789");

    const values = mocks.query.mock.calls[1]?.[1] as unknown[];
    expect(values[5]).toBe(blocker.id);
    expect(values[6]).toBeNull();
    expect(values[10]).toMatchObject({
      stationName: station.name,
      authorName: "Casey",
      messageBody: "Evidence body",
      messageCreatedAt: "2026-08-18T10:00:00.000Z",
    });
  });

  it("creates an anonymous station report without a reporter identity", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await createContentReport(station, {
      subjectType: "STATION",
      reason: "OTHER",
      details: "Station details need review.",
    });
    const values = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(values.slice(5, 8)).toEqual([null, null, null]);
  });
});
