import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("mobile signed-in community UI", () => {
  it("uses main-host mobile community routes for reads and mutations", async () => {
    const source = await readFile(new URL("../apps/mobile/components/ChatPanel.tsx", import.meta.url), "utf8");

    expect(source).toContain("/api/mobile/v1/stations/");
    expect(source).toContain("/chat/messages");
    expect(source).toContain("/engagement");
    expect(source).toContain("/fan");
    expect(source).toContain("/rating");
    expect(source).not.toContain("station.chatUrl");
    expect(source).not.toContain("/chat/identity");
  });

  it("lets guests read and offers sign in instead of a nickname", async () => {
    const source = await readFile(new URL("../apps/mobile/components/ChatPanel.tsx", import.meta.url), "utf8");

    expect(source).toContain("You can read every message as a guest.");
    expect(source).toContain('router.push("/login")');
    expect(source).toContain("session?.emailVerified");
    expect(source).not.toContain("nickname");
    expect(source).not.toContain("Choose a chat name");
  });

  it("accepts backward-compatible avatar URLs and renders them without user ids", async () => {
    const source = await readFile(new URL("../apps/mobile/components/ChatPanel.tsx", import.meta.url), "utf8");

    expect(source).toContain("avatarUrl: z.string().nullable().optional()");
    expect(source).toContain("<AvatarImage avatarUrl={message.avatarUrl}");
    expect(source).not.toContain("authorUserId");
  });
});
