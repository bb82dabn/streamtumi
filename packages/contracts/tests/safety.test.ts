import { describe, expect, it } from "vitest";
import {
  communityBlockResponseSchema,
  communityBlocksResponseSchema,
  communityReportRequestSchema,
  communityReportResponseSchema,
} from "../src/index";

describe("community safety contracts", () => {
  it("validates report subjects, reasons, and details", () => {
    expect(communityReportRequestSchema.safeParse({ subjectType: "CHAT_MESSAGE", reason: "OTHER", details: "Long enough details" }).success).toBe(false);
    expect(communityReportRequestSchema.safeParse({ subjectType: "STATION", reason: "UNKNOWN", details: "Long enough details" }).success).toBe(false);
    expect(communityReportRequestSchema.safeParse({ subjectType: "STATION", reason: "OTHER", details: "short" }).success).toBe(false);
    expect(communityReportResponseSchema.parse({ ok: true, reference: "ST-0123456789" }).reference).toBe("ST-0123456789");
  });

  it("exposes only opaque block identity and snapshots", () => {
    const block = {
      id: "00000000-0000-4000-8000-000000000001",
      kind: "GUEST",
      snapshotDisplayName: "Earlier Guest",
      blockedAt: "2026-08-18T12:00:00.000Z",
    };
    expect(communityBlockResponseSchema.parse({ ok: true, block }).block).toEqual(block);
    expect(communityBlocksResponseSchema.parse({ blocks: [block] }).blocks[0]).not.toHaveProperty("blockedUserId");
    expect(communityBlocksResponseSchema.safeParse({ blocks: [{ ...block, blockedUserId: "private-id" }] }).success).toBe(false);
  });
});
