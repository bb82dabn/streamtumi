import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Weather renderer production hardening", () => {
  it("bounds publication storage and publishes only completed HLS files", async () => {
    const renderer = await source("src-weather-renderer.ts");
    expect(renderer).toContain("program_date_time+temp_file");
    expect(renderer).toContain("storage.removeObject");
    expect(renderer).toContain("Date.now() - 120_000");
    expect(renderer).toContain("uploaded.delete(filename)");
    expect(renderer).toContain("pruneRemoteSegments(feedKey, referenced, Date.now() - 120_000)");
    expect(renderer).toContain("storage.removeObjects");
    expect(renderer).toContain("if (idleStop) await removePrefix");
  });

  it("supervises processes, startup, queue errors, heartbeat, and shutdown", async () => {
    const renderer = await source("src-weather-renderer.ts");
    expect(renderer).toContain("Weather HLS playlist did not start.");
    expect(renderer).toContain("Weather HLS playlist stopped advancing.");
    expect(renderer).toContain('worker.on("error"');
    expect(renderer).toContain("health:worker:weather-ready");
    expect(renderer).toContain("worker.pause(true)");
    expect(renderer).toContain("Promise.allSettled([...activeStops]");
  });

  it("captures and refreshes only validated Guide weather summaries", async () => {
    const renderer = await source("src-weather-renderer.ts");
    expect(renderer).toContain("installWs4kpSummaryCapture");
    expect(renderer).toContain("readWs4kpSummarySnapshot");
    expect(renderer).toContain("extractGuideWeatherSummary(snapshot)");
    expect(renderer).toContain("cacheGuideWeatherSummary(feedKey, summary)");
    expect(renderer).toContain("refreshed ? 30_000 : 5_000");
  });

  it("configures dependency health, bounded temporary storage, and graceful drain", async () => {
    const compose = await source("compose.yaml");
    expect(compose).toContain("stop_grace_period: 90s");
    expect(compose).toContain("/tmp:size=2g,mode=1777");
    expect(compose).toContain("health:worker:weather:");
    expect(compose).toContain("ws4kp: { condition: service_healthy }");
  });
});
