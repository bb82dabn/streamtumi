import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("weather settings UI", () => {
  it("links web settings from the guide and provides a ZIP form", async () => {
    const [guide, page, form, player] = await Promise.all([
      readFile(new URL("../app/guide/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/account/settings/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/weather-location-form.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/tv-player.tsx", import.meta.url), "utf8"),
    ]);
    expect(guide).toContain('href="/account/settings"');
    expect(page).toContain("WeatherLocationForm");
    expect(form).toContain('pattern="[0-9]{5}"');
    expect(player).toContain("Set your ZIP code");
    expect(player).toContain('href="/account/settings"');
    expect(player).toContain("weatherLocationRequired");
    expect(player).toContain("Enable sound");
    expect(player).toContain("video.muted = weatherAudio ? true : volumeRef.current === 0");
    expect(player).toContain("video.muted = true");
    expect(player).toContain("weatherAudioRef");
    expect(player).toContain("/api/public/weather/music/");
    expect(player).toContain('dataRef.current?.station.playbackKind === "PERSONALIZED_WEATHER"');
    expect(player).toContain("levelLoadingTimeOut: 70_000");
    expect(player).toContain("liveSyncDurationCount: 2");
    expect(player).toContain("maxLiveSyncPlaybackRate: 1.5");
  });

  it("provides mobile ZIP input and save behavior", async () => {
    const mobile = await readFile(new URL("../apps/mobile/app/settings.tsx", import.meta.url), "utf8");
    expect(mobile).toContain("Weather ZIP code");
    expect(mobile).toContain("/api/mobile/v1/account/weather-location");
    expect(mobile).toContain("weatherLocationUpdateRequestSchema.safeParse");
  });
});
