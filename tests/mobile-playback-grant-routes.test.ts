import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({
  authenticateStationPassword: vi.fn(),
  objectResponse: vi.fn(),
  query: vi.fn(),
  rateLimit: vi.fn(),
  resolvePublicStation: vi.fn(),
  resolveCalendarRuntime: vi.fn(),
  stationByToken: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: () => ({
  APP_SECRET: "mobile-playback-route-test-secret-32-chars",
  APP_URL: "https://streamtumi.test",
  APP_ALLOWED_ORIGINS: "",
}) }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/calendar-runtime", () => ({ resolveCalendarRuntime: mocks.resolveCalendarRuntime }));
vi.mock("@/lib/public-access", () => ({
  authenticateStationPassword: mocks.authenticateStationPassword,
  resolvePublicStation: mocks.resolvePublicStation,
  stationByToken: mocks.stationByToken,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/media", () => ({
  objectResponse: mocks.objectResponse,
  rewriteHlsPlaylist: (playlist: string, grant: string) => playlist.split("\n").map((line) => (
    line && !line.startsWith("#") ? `${line}?grant=${grant}` : line
  )).join("\n"),
}));

import { POST as accessStation } from "@/app/api/mobile/v1/stations/[token]/access/route";
import { GET as resolveStation } from "@/app/api/mobile/v1/stations/[token]/resolve/route";
import { GET as stationState } from "@/app/api/public/stations/[token]/route";
import { GET as stationAsset } from "@/app/api/public/stations/[token]/assets/[kind]/route";
import { GET as tvMedia } from "@/app/api/public/stations/[token]/media/[videoId]/[...path]/route";
import { GET as radioMaster } from "@/app/api/public/stations/[token]/radio/[output]/master.m3u8/route";
import { GET as radioSessionMedia } from "@/app/api/public/stations/[token]/radio/sessions/[sessionId]/[output]/[...path]/route";
import { validateMobilePlaybackGrant } from "@/lib/mobile-playback-grant";

const token = "public-token";
const stationId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000015";
const context = { params: Promise.resolve({ token }) };
const protectedTv = {
  id: stationId,
  station_kind: "TV",
  name: "Protected TV",
  description: "A private broadcast",
  access_password_hash: "private-password-hash",
  broadcast_state: "RUNNING",
  active_schedule_id: "schedule-1",
  pending_schedule_id: null,
  schedule_started_at: new Date(0),
  logo_key: "logo.png",
  offline_slate_key: null,
  time_zone: "UTC",
  effective_explicit: false,
};

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://streamtumi.test${path}`, init);
}

async function issuedGrant(): Promise<string> {
  const response = await accessStation(request(`/api/mobile/v1/stations/${token}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "correct horse battery staple" }),
  }), context);
  return (await response.json()).grant;
}

describe("mobile station resolve and access routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "https://streamtumi.test");
    mocks.stationByToken.mockResolvedValue(protectedTv);
    mocks.resolveCalendarRuntime.mockResolvedValue(null);
    mocks.authenticateStationPassword.mockResolvedValue(protectedTv);
    mocks.resolveCalendarRuntime.mockResolvedValue(null);
    mocks.objectResponse.mockResolvedValue(new Response("media"));
  });

  it("resolves a protected valid token without granting playback or leaking a hash", async () => {
    const response = await resolveStation(request(`/api/mobile/v1/stations/${token}/resolve`, {
      headers: { "X-StreamTumi-Product": "MAIN" },
    }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toMatchObject({
      apiVersion: 1,
      stationUrl: `https://streamtumi.test/api/public/stations/${token}`,
      stationKind: "TV",
      playbackKind: "SCHEDULED_TV",
      name: protectedTv.name,
      description: protectedTv.description,
      requiresPassword: true,
    });
    expect(JSON.stringify(body)).not.toContain(protectedTv.access_password_hash);
    expect(body).not.toHaveProperty("grant");
    expect(mocks.stationByToken).toHaveBeenCalledWith(token, false);
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "mobile-v1-station-resolve", 120, 60);
  });

  it("returns the canonical application station URL for a Radio token", async () => {
    mocks.stationByToken.mockResolvedValueOnce({ ...protectedTv, station_kind: "RADIO", name: "Protected Radio" });

    const body = await (await resolveStation(request(`/api/mobile/v1/stations/${token}/resolve`), context)).json();
    expect(body).toMatchObject({
      stationUrl: `https://streamtumi.test/api/public/stations/${token}`,
      stationKind: "RADIO",
      playbackKind: "CONTINUOUS_RADIO",
    });
  });

  it("reports passwordless stations without creating a grant", async () => {
    mocks.stationByToken.mockResolvedValueOnce({ ...protectedTv, access_password_hash: null });

    const body = await (await resolveStation(request(`/api/mobile/v1/stations/${token}/resolve`), context)).json();
    expect(body.requiresPassword).toBe(false);
    expect(body).not.toHaveProperty("grant");
  });

  it("returns a valid grant with a maximum two-hour expiry without setting a browser cookie", async () => {
    const before = Date.now();
    const response = await accessStation(request(`/api/mobile/v1/stations/${token}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple" }),
    }), context);
    const after = Date.now();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(validateMobilePlaybackGrant(body.grant, token, stationId, before)).toBe(true);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(after);
    expect(new Date(body.expiresAt).getTime() - before).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
    expect(JSON.stringify(body)).not.toContain("correct horse battery staple");
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "public-password", 15, 900);
  });

  it("returns the existing password error without issuing a grant", async () => {
    mocks.authenticateStationPassword.mockRejectedValueOnce(new HttpError(401, "The station password is incorrect.", "INVALID_PASSWORD"));
    const response = await accessStation(request(`/api/mobile/v1/stations/${token}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-secret" }),
    }), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "The station password is incorrect.", code: "INVALID_PASSWORD" });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("grant propagation through public playback routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateStationPassword.mockResolvedValue(protectedTv);
    mocks.resolvePublicStation.mockResolvedValue(protectedTv);
    mocks.objectResponse.mockResolvedValue(new Response("media"));
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("propagates a validated grant into protected TV state media URLs", async () => {
    const grant = await issuedGrant();
    mocks.query.mockResolvedValueOnce({ rows: [{
      transition_ms: 0,
      playback_order: "SEQUENTIAL",
      shuffle_seed: "1",
      items: [{
        video_id: "video-1",
        title: "Program",
        duration_ms: "60000",
        position: 0,
        thumbnail_key: "thumb.jpg",
        captions_key: "captions.vtt",
      }],
    }] });
    const stateRequest = request(`/api/public/stations/${token}?grant=${grant}`);
    const response = await stationState(stateRequest, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.playlist[0].hlsUrl).toContain(`master.m3u8?grant=${grant}`);
    expect(body.playlist[0].thumbnailUrl).toContain(`thumbnail.jpg?grant=${grant}`);
    expect(body.playlist[0].captionsUrl).toContain(`captions.vtt?grant=${grant}`);
    expect(mocks.resolvePublicStation).toHaveBeenCalledWith(token, stateRequest);
  });

  it("never appends grants to passwordless station state", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({ ...protectedTv, access_password_hash: null });
    mocks.query.mockResolvedValueOnce({ rows: [{
      transition_ms: 0,
      playback_order: "SEQUENTIAL",
      shuffle_seed: "1",
      items: [{ video_id: "video-1", title: "Program", duration_ms: "60000", position: 0, thumbnail_key: null, captions_key: null }],
    }] });

    const body = await (await stationState(request(`/api/public/stations/${token}?grant=untrusted`), context)).json();
    expect(body.playlist[0].hlsUrl).toBe(`/api/public/stations/${token}/media/video-1/master.m3u8`);
  });

  it("passes the grant into protected TV manifests but not public manifests", async () => {
    const grant = await issuedGrant();
    mocks.query.mockResolvedValue({ rows: [{ hls_key: "tv/master.m3u8", thumbnail_key: null, captions_key: null }] });
    const mediaRequest = request(`/api/public/stations/${token}/media/video-1/variant/index.m3u8?grant=${grant}`);

    await tvMedia(mediaRequest, { params: Promise.resolve({ token, videoId: "video-1", path: ["variant", "index.m3u8"] }) });
    expect(mocks.objectResponse).toHaveBeenLastCalledWith("tv/variant/index.m3u8", mediaRequest, "private, max-age=3600", grant);

    mocks.resolvePublicStation.mockResolvedValueOnce({ ...protectedTv, access_password_hash: null });
    const publicRequest = request(`/api/public/stations/${token}/media/video-1/master.m3u8?grant=untrusted`);
    await tvMedia(publicRequest, { params: Promise.resolve({ token, videoId: "video-1", path: ["master.m3u8"] }) });
    expect(mocks.objectResponse).toHaveBeenLastCalledWith("tv/master.m3u8", publicRequest, "private, max-age=3600", undefined);
  });

  it("passes grant-bearing requests through station asset authorization", async () => {
    const grant = await issuedGrant();
    const assetRequest = request(`/api/public/stations/${token}/assets/logo?grant=${grant}`);
    await stationAsset(assetRequest, { params: Promise.resolve({ token, kind: "logo" }) });
    expect(mocks.resolvePublicStation).toHaveBeenLastCalledWith(token, assetRequest);
    expect(mocks.objectResponse).toHaveBeenLastCalledWith("logo.png", assetRequest, "private, max-age=300");

  });

  it("rewrites Radio stable masters and propagates grants to session indexes and segments", async () => {
    const radio = { ...protectedTv, station_kind: "RADIO" };
    mocks.resolvePublicStation.mockResolvedValue(radio);
    mocks.query
      .mockResolvedValueOnce({ rows: [{ active_session_id: sessionId }] })
      .mockResolvedValueOnce({ rows: [{ object_prefix: "radio/session" }] })
      .mockResolvedValueOnce({ rows: [{ object_prefix: "radio/session" }] });
    const grant = await issuedGrant();
    const masterRequest = request(`/api/public/stations/${token}/radio/audio/master.m3u8?grant=${grant}`);
    const master = await radioMaster(masterRequest, { params: Promise.resolve({ token, output: "audio" }) });

    expect(await master.text()).toContain(`index.m3u8?grant=${grant}`);

    const indexRequest = request(`/api/public/stations/${token}/radio/sessions/${sessionId}/audio/index.m3u8?grant=${grant}`);
    await radioSessionMedia(indexRequest, { params: Promise.resolve({ token, sessionId, output: "audio", path: ["index.m3u8"] }) });
    expect(mocks.objectResponse).toHaveBeenLastCalledWith("radio/session/audio/index.m3u8", indexRequest, "private, no-store", grant);

    const segmentRequest = request(`/api/public/stations/${token}/radio/sessions/${sessionId}/audio/segment_0000000001.ts?grant=${grant}`);
    await radioSessionMedia(segmentRequest, { params: Promise.resolve({ token, sessionId, output: "audio", path: ["segment_0000000001.ts"] }) });
    expect(mocks.objectResponse).toHaveBeenLastCalledWith("radio/session/audio/segment_0000000001.ts", segmentRequest, "private, max-age=86400, immutable", grant);
  });

  it("does not append a supplied grant to a public Radio master", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({ ...protectedTv, station_kind: "RADIO", access_password_hash: null });
    mocks.query.mockResolvedValueOnce({ rows: [{ active_session_id: sessionId }] });

    const response = await radioMaster(request(`/api/public/stations/${token}/radio/audio/master.m3u8?grant=untrusted`), {
      params: Promise.resolve({ token, output: "audio" }),
    });
    expect(await response.text()).not.toContain("grant=");
  });
});
