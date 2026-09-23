import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "00000000-0000-4000-8000-000000000001", emailVerified: true, displayName: "Listener" };
const station = { id: "00000000-0000-4000-8000-000000000002", name: "Private station" };
const messageId = "00000000-0000-4000-8000-000000000003";
const blockId = "00000000-0000-4000-8000-000000000004";
const block = { id: blockId, kind: "REGISTERED", snapshotDisplayName: "Casey", blockedAt: "2026-08-18T12:00:00.000Z" };
const mocks = vi.hoisted(() => ({
  blockMessageAuthor: vi.fn(),
  createContentReport: vi.fn(),
  listUserBlocks: vi.fn(),
  optionalMobileUser: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitByKey: vi.fn(),
  requireMobileAuth: vi.fn(),
  requireVerifiedMobileUser: vi.fn(),
  resolvePublicStation: vi.fn(),
  unblockById: vi.fn(),
  unblockMessageAuthor: vi.fn(),
}));

vi.mock("@/lib/community-safety", () => ({
  blockMessageAuthor: mocks.blockMessageAuthor,
  createContentReport: mocks.createContentReport,
  listUserBlocks: mocks.listUserBlocks,
  unblockById: mocks.unblockById,
  unblockMessageAuthor: mocks.unblockMessageAuthor,
}));
vi.mock("@/lib/mobile-auth", () => ({ requireMobileAuth: mocks.requireMobileAuth }));
vi.mock("@/lib/mobile-community", () => ({
  optionalMobileUser: mocks.optionalMobileUser,
  requireVerifiedMobileUser: mocks.requireVerifiedMobileUser,
}));
vi.mock("@/lib/public-access", () => ({ resolvePublicStation: mocks.resolvePublicStation }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitByKey: mocks.rateLimitByKey }));

import { GET as getBlocks } from "@/app/api/mobile/v1/account/blocks/route";
import { DELETE as deleteBlock } from "@/app/api/mobile/v1/account/blocks/[blockId]/route";
import { DELETE as deleteMessageBlock, PUT as putMessageBlock } from "@/app/api/mobile/v1/stations/[token]/chat/messages/[messageId]/block/route";
import { POST as postReport } from "@/app/api/mobile/v1/stations/[token]/reports/route";

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://streamtumi.test/api/mobile/v1/${path}`, init);
}

describe("mobile community safety routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileAuth.mockResolvedValue({ user });
    mocks.requireVerifiedMobileUser.mockResolvedValue(user);
    mocks.optionalMobileUser.mockResolvedValue(user);
    mocks.resolvePublicStation.mockResolvedValue(station);
    mocks.blockMessageAuthor.mockResolvedValue(block);
    mocks.unblockMessageAuthor.mockResolvedValue(true);
    mocks.listUserBlocks.mockResolvedValue([block]);
    mocks.unblockById.mockResolvedValue(true);
    mocks.createContentReport.mockResolvedValue("ST-0123456789");
  });

  it("blocks and unblocks by message id without leaking target ids", async () => {
    const context = { params: Promise.resolve({ token: "private-token", messageId }) };
    const blockResponse = await putMessageBlock(request(`stations/private-token/chat/messages/${messageId}/block?grant=private-grant`, { method: "PUT" }), context);
    const unblockResponse = await deleteMessageBlock(request(`stations/private-token/chat/messages/${messageId}/block?grant=private-grant`, { method: "DELETE" }), context);

    expect(blockResponse.status).toBe(200);
    const body = await blockResponse.json();
    expect(body.block).toEqual(block);
    expect(JSON.stringify(body)).not.toContain("blockedUserId");
    expect(mocks.blockMessageAuthor).toHaveBeenCalledWith(user, station.id, messageId);
    expect(mocks.unblockMessageAuthor).toHaveBeenCalledWith(user.id, station.id, messageId);
    expect(mocks.resolvePublicStation).toHaveBeenCalledWith("private-token", expect.any(Request));
    await expect(unblockResponse.json()).resolves.toEqual({ ok: true, removed: true });
  });

  it("lists and unblocks through an opaque account block id", async () => {
    const listed = await getBlocks(request("account/blocks"));
    const removed = await deleteBlock(request(`account/blocks/${blockId}`, { method: "DELETE" }), { params: Promise.resolve({ blockId }) });

    await expect(listed.json()).resolves.toEqual({ blocks: [block] });
    await expect(removed.json()).resolves.toEqual({ ok: true, removed: true });
    expect(mocks.unblockById).toHaveBeenCalledWith(user.id, blockId);
  });

  it("accepts private grants and associates a signed-in mobile reporter", async () => {
    const reportRequest = request("stations/private-token/reports?grant=private-grant", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer mobile-token" },
      body: JSON.stringify({ subjectType: "STATION", reason: "OTHER", details: "This station needs review." }),
    });
    const response = await postReport(reportRequest, { params: Promise.resolve({ token: "private-token" }) });

    expect(response.status).toBe(201);
    expect(mocks.resolvePublicStation).toHaveBeenCalledWith("private-token", reportRequest);
    expect(mocks.createContentReport).toHaveBeenCalledWith(station, expect.objectContaining({ subjectType: "STATION" }), { userId: user.id });
  });

  it("keeps mobile reporting available anonymously", async () => {
    mocks.optionalMobileUser.mockResolvedValueOnce(null);
    const response = await postReport(request("stations/public-token/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectType: "STATION", reason: "SPAM_OR_SCAM", details: "This station appears deceptive." }),
    }), { params: Promise.resolve({ token: "public-token" }) });

    expect(response.status).toBe(201);
    expect(mocks.createContentReport).toHaveBeenCalledWith(station, expect.anything(), { userId: undefined });
  });
});
