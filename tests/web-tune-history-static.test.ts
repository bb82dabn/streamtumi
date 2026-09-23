import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { productRouteDecision } from "@/lib/product-host";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("web tune-history player integration", () => {
  it("uses the same recorder for primary TV video and Radio audio", async () => {
    const [tv, radio] = await Promise.all([
      source("components/tv-player.tsx"),
      source("components/radio-listen-experience.tsx"),
    ]);
    expect(tv).toContain("useTuneRecorder<HTMLVideoElement>(token, !diagnostic)");
    expect(tv).toContain("ref={setVideoRef}");
    expect(radio).toContain("useTuneRecorder<HTMLAudioElement>(token)");
    expect(radio).toContain("ref={setAudioRef}");
  });

  it("never attaches tracking to diagnostics, visual-only media, or muted guide previews", async () => {
    const [diagnostic, radio, guide] = await Promise.all([
      source("components/diagnostic-preview-player.tsx"),
      source("components/radio-listen-experience.tsx"),
      source("components/guide-artwork-preview.tsx"),
    ]);
    expect(diagnostic).toContain("diagnostic");
    expect(radio).not.toContain("ref={setVideoRef}");
    expect(guide).not.toContain("useTuneRecorder");
    expect(guide).toContain("muted = true");
    expect(guide).toContain("muted={muted} playsInline");
  });

  it("posts once without adding presence or polling writes on the canonical host", async () => {
    const recorder = await source("components/tune-recorder.ts");
    expect(recorder).toContain('fetch("/api/client/v1/tunes"');
    expect(recorder).toContain('credentials: "same-origin"');
    expect(recorder).not.toContain("setInterval");
    expect(recorder).not.toContain("/presence");
    expect(productRouteDecision("MAIN", "/api/client/v1/tunes", "POST")).toEqual({ action: "allow" });
  });
});
