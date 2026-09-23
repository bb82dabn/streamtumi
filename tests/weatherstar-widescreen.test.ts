import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { weatherstarViewport, weatherstarWidescreenUrl } from "@/lib/weatherstar";

describe("WeatherStar renderer display mode", () => {
  it("locks every local feed to classic 16:9 widescreen", () => {
    const url = new URL(weatherstarWidescreenUrl("http://ws4kp:8080", "12345"));
    expect(weatherstarViewport).toEqual({ width: 1280, height: 720 });
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latLonQuery: "12345",
      kiosk: "true",
      viewMode: "wide",
      wide: "true",
      enhanced: "false",
      portrait: "false",
    });
  });

  it("captures a borderless app window with bundled WeatherStar music", async () => {
    const renderer = await readFile(new URL("../src-weather-renderer.ts", import.meta.url), "utf8");
    expect(renderer).toContain('"--app=about:blank"');
    expect(renderer).toContain("page.goto(weatherUrl");
    expect(renderer).toContain("context.addInitScript(installWs4kpSummaryCapture)");
    expect(renderer).toContain('windowState: "fullscreen"');
    expect(renderer).toContain('"--test-type"');
    expect(renderer).toContain('"Catch the Sun.mp3"');
    expect(renderer).toContain("downloadWeatherMusic(directory)");
    expect(renderer).toContain("Buffer.from(await response.arrayBuffer())");
    expect(renderer).toContain('"-stream_loop", "-1"');
    expect(renderer).toContain('"-protocol_whitelist", "file"');
    expect(renderer).not.toContain("anullsrc=");
    expect(renderer).toContain('status: ready ? "RUNNING" : "STARTING"');
    expect(renderer).toContain('"-hls_time", "1"');
    expect(renderer).toContain('"-hls_list_size", "5"');
    expect(renderer).toContain('"-hls_start_number_source", "epoch"');
    expect(renderer).toContain("program_date_time+temp_file");
    expect(renderer).toContain('"-thread_queue_size", "512"');
    expect(renderer).toContain('"-profile:v", "baseline", "-level:v", "3.1"');
    expect(renderer).toContain('"-b:v", "2200k", "-maxrate", "2800k", "-bufsize", "5600k"');
    expect(renderer).toContain('throw new Error("Weather HLS playlist stopped advancing.")');
    expect(renderer).toContain('status: "IDLE"');
    expect(renderer).toContain("storage.removeObject");
    expect(renderer).toContain("Date.now() - 120_000");
    expect(renderer).toContain("health:worker:weather-ready");
    expect(renderer).toContain("worker.pause(true)");
  });
});
