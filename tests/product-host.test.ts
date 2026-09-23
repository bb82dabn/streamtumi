import { afterEach, describe, expect, it, vi } from "vitest";
import { productForHostname, productOrigin, productRouteDecision } from "@/lib/product-host";

describe("product host isolation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resolves only exact configured hosts", () => {
    vi.stubEnv("APP_URL", "https://streamtumi.com");
    expect(productForHostname("streamtumi.com")).toBe("MAIN");
    expect(productForHostname("radio.streamtumi.com:443")).toBeNull();
    expect(productForHostname("radio.streamtumi.com.attacker.example")).toBeNull();
    expect(productOrigin("MAIN")).toBe("https://streamtumi.com");
  });

  it("allows only explicitly configured internal service hosts", () => {
    vi.stubEnv("APP_URL", "https://streamtumi.com");
    vi.stubEnv("APP_INTERNAL_HOSTS", "app,render-gateway");
    expect(productForHostname("app:3000")).toBe("MAIN");
    expect(productForHostname("render-gateway")).toBe("MAIN");
    expect(productForHostname("app.attacker.example")).toBeNull();
  });

  it("keeps same-host Radio compatibility routes without a second product host", () => {
    expect(productRouteDecision("MAIN", "/radio")).toEqual({ action: "redirect", product: "MAIN", pathname: "/guide?type=radio" });
    expect(productRouteDecision("MAIN", "/radio/dashboard")).toEqual({ action: "allow" });
    expect(productRouteDecision("MAIN", "/radio/stations/id")).toEqual({ action: "allow" });
  });

  it("serves shared brand metadata and images on both product hosts", () => {
    expect(productRouteDecision("MAIN", "/manifest.webmanifest")).toEqual({ action: "allow" });
    expect(productRouteDecision("MAIN", "/.well-known/apple-app-site-association")).toEqual({ action: "allow" });
  });

  it("serves TV and Radio experiences and APIs on the main host", () => {
    expect(productRouteDecision("MAIN", "/guide")).toEqual({ action: "allow" });
    expect(productRouteDecision("MAIN", "/listen/token")).toEqual({ action: "allow" });
    expect(productRouteDecision("MAIN", "/api/radio/tracks/id")).toEqual({ action: "allow" });
    expect(productRouteDecision("MAIN", "/api/public/stations/token/radio/audio/master.m3u8")).toEqual({ action: "allow" });
    expect(productRouteDecision("MAIN", "/radio/stations/id")).toEqual({ action: "allow" });
  });
});
