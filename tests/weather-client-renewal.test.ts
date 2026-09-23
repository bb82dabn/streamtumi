import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("long-running Weather clients", () => {
  it("renews web playback five minutes before grant expiration", async () => {
    const web = await source("components/tv-player.tsx");
    expect(web).toContain("weatherPlaybackRef");
    expect(web).toContain("provisionWeather(true)");
    expect(web).toContain("new Date(weatherPlayback.expiresAt).getTime() - Date.now() - 5 * 60_000");
  });

  it("renews mobile playback five minutes before grant expiration", async () => {
    const mobile = await source("apps/mobile/app/station/[token].tsx");
    expect(mobile).toContain("provisionWeatherPlayback");
    expect(mobile).toContain("renewWeatherFromEffect");
    expect(mobile).toContain("new Date(weatherPlayback.expiresAt).getTime() - Date.now() - 5 * 60_000");
  });
});
