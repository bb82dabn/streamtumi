import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Radio listener chat integration", () => {
  it("mounts shared station chat after Radio access and keeps video reporting disabled", async () => {
    const source = await readFile(new URL("../components/radio-listen-experience.tsx", import.meta.url), "utf8");
    expect(source).toContain("<StationChat");
    expect(source).toContain("currentVideo={null}");
    expect(source).toContain("onViewerCount={updateViewerCount}");
    expect(source).toContain("Radio chat");
  });

  it("uses the existing presence and station event channels", async () => {
    const source = await readFile(new URL("../components/station-chat.tsx", import.meta.url), "utf8");
    expect(source).toContain("/chat/events");
    expect(source).toContain("/presence");
    expect(source).toContain("message.created");
    expect(source).toContain("station.updated");
  });
});
