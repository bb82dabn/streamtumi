import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const httpSource = readFileSync("roku/source/http.brs", "utf8");
const sceneSource = readFileSync("roku/components/MainScene.brs", "utf8");
const manifest = readFileSync("roku/manifest", "utf8");

describe("Roku device authentication HTTP client", () => {
  it("initializes Roku certificates in the documented order and retains error bodies", () => {
    expect(httpSource.indexOf("SetCertificatesFile")).toBeLessThan(httpSource.indexOf("InitClientCertificates"));
    expect(httpSource.indexOf("InitClientCertificates")).toBeLessThan(httpSource.indexOf("RetainBodyOnError"));
    expect(httpSource).toContain("RetainBodyOnError(true)");
  });

  it("returns transport diagnostics and safely scopes the optional client header", () => {
    expect(httpSource).toContain("GetFailureReason()");
    expect(httpSource).toContain("failureReason: failureReason");
    expect(httpSource).toContain("X-StreamTumi-Client");
    expect(httpSource).toContain("GetChannelClientId");
  });

  it("preserves case-sensitive device API JSON keys", () => {
    expect(sceneSource).toContain('{ "deviceType": "ROKU", "displayName": "StreamTumi Roku" }');
    expect(sceneSource).toContain('{ "deviceCode": m.deviceCode }');
    expect(sceneSource).toContain('{ "accessKey": m.roomAccessKey }');
    expect(sceneSource).toContain('{ "roomSessionToken": m.roomSessionActiveToken }');
    expect(sceneSource).toContain('{ "id": m.tuneSessionId, "stationToken": m.tuneStationToken }');
    expect(sceneSource).toContain('{ "id": m.weatherActiveTuneId, "stationToken": m.weatherActiveStationToken }');
  });

  it("shows activation HTTP errors and identifies source build 0.1.0", () => {
    expect(sceneSource).toContain('Activation failed (HTTP " + response.status.ToStr() + "). " + response.error');
    expect(manifest).toContain("major_version=0");
    expect(manifest).toContain("minor_version=1");
    expect(manifest).toContain("build_version=0");
  });
});
