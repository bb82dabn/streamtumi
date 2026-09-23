import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("mobile community safety UI", () => {
  it("uses message-id block and mobile report endpoints without sender user ids", async () => {
    const source = await readFile(new URL("../apps/mobile/components/ChatPanel.tsx", import.meta.url), "utf8");

    expect(source).toContain("/chat/messages/${encodeURIComponent(message.id)}/block");
    expect(source).toContain(">Block<");
    expect(source).toContain(">Report<");
    expect(source).toContain("<ReportModal");
    expect(source).not.toContain("authorUserId");
  });

  it("reports stations from Details and submits through the mobile endpoint", async () => {
    const detail = await readFile(new URL("../apps/mobile/app/station/[token].tsx", import.meta.url), "utf8");
    const modal = await readFile(new URL("../apps/mobile/components/ReportModal.tsx", import.meta.url), "utf8");

    expect(detail).toContain("Report station");
    expect(modal).toContain("/api/mobile/v1/stations/${encodeURIComponent(stationToken)}/reports");
    expect(modal).toContain("communityReportReasons.map");
    expect(modal).toContain("Reference");
  });

  it("manages blocks only through opaque account block ids", async () => {
    const source = await readFile(new URL("../apps/mobile/app/blocked-users.tsx", import.meta.url), "utf8");
    const account = await readFile(new URL("../apps/mobile/app/(tabs)/account.tsx", import.meta.url), "utf8");

    expect(account).toContain("Blocked users");
    expect(source).toContain('requestJson("/api/mobile/v1/account/blocks"');
    expect(source).toContain("/api/mobile/v1/account/blocks/${encodeURIComponent(block.id)}");
    expect(source).not.toContain("blockedUserId");
  });
});
