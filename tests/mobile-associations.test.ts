import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getAppleAssociation } from "@/app/.well-known/apple-app-site-association/route";
import { GET as getAndroidAssociation } from "@/app/.well-known/assetlinks.json/route";
import { mobileLinkPaths } from "@/lib/mobile-associations";

const fingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join(":").toUpperCase();

describe("signed mobile app associations", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves the exact Apple application and supported paths as uncached JSON", async () => {
    vi.stubEnv("APPLE_APP_ID", "ABCDE12345.com.streamtumi.mobile");

    const response = getAppleAssociation();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({
      applinks: {
        apps: [],
        details: [{ appID: "ABCDE12345.com.streamtumi.mobile", paths: [...mobileLinkPaths] }],
      },
    });
  });

  it("serves normalized Android signing fingerprints as uncached JSON", async () => {
    vi.stubEnv("ANDROID_APP_CERT_SHA256", fingerprint.toLowerCase());

    const response = getAndroidAssociation();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.streamtumi.mobile",
        sha256_cert_fingerprints: [fingerprint],
      },
    }]);
  });

  it("fails closed without signing values and does not identify missing configuration", async () => {
    vi.stubEnv("APPLE_APP_ID", "");
    vi.stubEnv("ANDROID_APP_CERT_SHA256", "");

    for (const response of [getAppleAssociation(), getAndroidAssociation()]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
      expect(await response.json()).toEqual({ error: "Mobile app association is unavailable." });
    }
  });
});
