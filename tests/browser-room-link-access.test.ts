import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("browser private-room share links", () => {
  it("bootstraps TV and Radio links without rendering a room-key password form", async () => {
    const [tv, radio] = await Promise.all([
      source("components/tv-player.tsx"),
      source("components/radio-listen-experience.tsx"),
    ]);

    expect(tv).toContain("/link-access");
    expect(radio).toContain("/link-access");
    expect(tv).not.toContain("Room key required");
    expect(radio).not.toContain("Room key required");
    expect(tv).toContain("PASSWORD_REQUIRED");
    expect(radio).toContain("PASSWORD_REQUIRED");
  });

  it("explains separate key and link revocation to station owners", async () => {
    const control = await source("components/station-room-key-control.tsx");
    expect(control).toContain("full share link opens directly in a browser");
    expect(control).toContain("regenerate the station share link");
  });
});
