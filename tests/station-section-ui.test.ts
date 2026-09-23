import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StationSectionNav } from "@/components/station-section-nav";

describe("route-backed station management", () => {
  it("renders stable Overview, Programming, Media, Studio, and Settings links", () => {
    const markup = renderToStaticMarkup(createElement(StationSectionNav, { stationId: "station-one", active: "programming" }));
    expect(markup).toContain('href="/stations/station-one"');
    expect(markup).toContain('href="/stations/station-one/programming"');
    expect(markup).toContain('href="/stations/station-one/media"');
    expect(markup).toContain('href="/stations/station-one/production"');
    expect(markup).toContain('href="/stations/station-one/settings"');
    expect(markup).toContain('aria-current="page"');
  });

  it("wires every canonical route through the shared station section shell", async () => {
    const routes = await Promise.all(["programming", "media", "production", "settings"].map((name) => readFile(new URL(`../app/stations/[id]/${name}/page.tsx`, import.meta.url), "utf8")));
    for (const source of routes) expect(source).toContain("<StationSectionPage");
    expect(routes[0]).toContain('section="programming"');
    expect(routes[1]).toContain('section="media"');
    expect(routes[2]).toContain('section="production"');
    expect(routes[3]).toContain('section="settings"');
  });

  it("defaults to Basic mode while preserving the complete Advanced workflow", async () => {
    const [nav, tv, radio, studio] = await Promise.all([
      readFile(new URL("../components/station-section-nav.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/station-editor.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/radio-programming-editor.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/studio-dashboard-panel.tsx", import.meta.url), "utf8"),
    ]);
    expect(nav).toContain('useState<"basic" | "advanced">("basic")');
    expect(nav).toContain("streamtumi:station-dashboard-mode");
    expect(tv).toContain("Channel Lineup");
    expect(tv).toContain("ENPS Rundown");
    expect(tv).toContain("Update Channel Now");
    expect(radio).toContain("Radio Schedule");
    expect(radio).toContain("Rotations and Weekly Clock");
    expect(studio).toContain("Prepare a Show Project");
    expect(studio).toContain("Production Projects &amp; Releases");
  });

  it("exposes a safe operating-model migration planner without changing air", async () => {
    const [panel, route] = await Promise.all([
      readFile(new URL("../components/station-operating-model.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/stations/[id]/programming-profiles/route.ts", import.meta.url), "utf8"),
    ]);
    expect(panel).toContain("How This Station Runs");
    expect(panel).toContain("Format");
    expect(panel).toContain("Explore another programming mode");
    expect(panel).toContain("cannot change what is currently on air");
    expect(route).toContain("migrationPreview");
    expect(route).toContain("activatable");
    expect(route).not.toContain("active_programming_profile_id = $1");
  });
});
