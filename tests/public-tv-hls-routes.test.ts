import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({
  mobilePlaybackGrantFromRequest: vi.fn(),
  objectResponse: vi.fn(),
  query: vi.fn(),
  rateLimit: vi.fn(),
  resolvePublicStation: vi.fn(),
  resolvePublicTvChannelReadiness: vi.fn(),
  resolveCalendarRuntime: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/calendar-runtime", () => ({ resolveCalendarRuntime: mocks.resolveCalendarRuntime }));
vi.mock("@/lib/media", () => ({
  objectResponse: mocks.objectResponse,
  rewriteHlsPlaylist: (playlist: string, grant: string) => playlist.split("\n").map((line) => (
    line && !line.startsWith("#") ? `${line}?grant=${encodeURIComponent(grant)}` : line
  )).join("\n"),
}));
vi.mock("@/lib/mobile-playback-grant", () => ({ mobilePlaybackGrantFromRequest: mocks.mobilePlaybackGrantFromRequest }));
vi.mock("@/lib/public-access", () => ({
  resolvePublicStation: mocks.resolvePublicStation,
  resolvePublicTvChannelReadiness: mocks.resolvePublicTvChannelReadiness,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { GET as master } from "@/app/api/public/stations/[token]/tv/master.m3u8/route";
import { GET as rendition } from "@/app/api/public/stations/[token]/tv/[rendition]/index.m3u8/route";
import { GET as segment } from "@/app/api/public/stations/[token]/tv/[rendition]/segments/[sequence]/route";

const token = "public-token";
const station = {
  id: "station-1",
  station_kind: "TV",
  tv_delivery_mode: "CHANNEL_HLS",
  tv_channel_rendition_mode: "DUAL",
  broadcast_state: "RUNNING",
  active_schedule_id: "schedule-1",
  schedule_started_at: new Date(0),
  access_password_hash: "password-hash",
};
const segments = [
  {
    mediaSequence: 42,
    discontinuitySequence: 7,
    discontinuity: false,
    startsAt: new Date("2026-08-19T12:00:00.000Z"),
    endsAt: new Date("2026-08-19T12:00:02.000Z"),
    durationMs: 2000,
    scheduleId: "schedule-1",
    playoutFence: 8,
    uris: { "720p": "private/object/high-42.ts", "360p": "private/object/low-42.ts" },
  },
  {
    mediaSequence: 43,
    discontinuitySequence: 7,
    discontinuity: false,
    startsAt: new Date("2026-08-19T12:00:02.000Z"),
    endsAt: new Date("2026-08-19T12:00:04.000Z"),
    durationMs: 2000,
    scheduleId: "schedule-1",
    playoutFence: 8,
    uris: { "720p": "private/object/high-43.ts", "360p": "private/object/low-43.ts" },
  },
];

function request(path: string): Request {
  return new Request(`https://streamtumi.test${path}`);
}

describe("public TV CHANNEL_HLS routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePublicStation.mockResolvedValue(station);
    mocks.resolveCalendarRuntime.mockResolvedValue(null);
    mocks.resolvePublicTvChannelReadiness.mockResolvedValue({ status: "AVAILABLE", version: "schedule-1:8", renditionMode: "DUAL", segments });
    mocks.mobilePlaybackGrantFromRequest.mockReturnValue("mobile-grant");
    mocks.objectResponse.mockResolvedValue(new Response("segment-data"));
  });

  it("returns a no-store master with authorized stable rendition URLs", async () => {
    const source = request(`/api/public/stations/${token}/tv/master.m3u8?grant=mobile-grant`);
    const response = await master(source, { params: Promise.resolve({ token }) });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toContain(`/api/public/stations/${token}/tv/720p/index.m3u8?grant=mobile-grant`);
    expect(body).toContain(`/api/public/stations/${token}/tv/360p/index.m3u8?grant=mobile-grant`);
    expect(body).not.toContain("private/object");
    expect(mocks.resolvePublicStation).toHaveBeenCalledWith(token, source);
  });

  it("advertises one authorized stream for an HD-only window", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({ ...station, tv_channel_rendition_mode: "HD_ONLY" });
    mocks.resolvePublicTvChannelReadiness.mockResolvedValueOnce({
      status: "AVAILABLE",
      version: "schedule-1:8",
      renditionMode: "HD_ONLY",
      segments: [],
    });
    const response = await master(request(`/api/public/stations/${token}/tv/master.m3u8?grant=mobile-grant`), {
      params: Promise.resolve({ token }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.match(/#EXT-X-STREAM-INF:/g)).toHaveLength(1);
    expect(body).toContain(`/api/public/stations/${token}/tv/720p/index.m3u8?grant=mobile-grant`);
    expect(body).not.toContain("360p");
  });

  it("returns a rolling media manifest using only rendition and sequence URLs", async () => {
    const response = await rendition(request(`/api/public/stations/${token}/tv/720p/index.m3u8?grant=mobile-grant`), {
      params: Promise.resolve({ token, rendition: "720p" }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toContain("#EXT-X-MEDIA-SEQUENCE:42");
    expect(body).toContain(`/api/public/stations/${token}/tv/720p/segments/42.ts?grant=mobile-grant`);
    expect(body).toContain(`/api/public/stations/${token}/tv/720p/segments/43.ts?grant=mobile-grant`);
    expect(body).not.toContain("#EXT-X-ENDLIST");
    expect(body).not.toContain("private/object");
  });
it("rejects 360p without leaking rows and recovers when readiness returns dual", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({ ...station, tv_channel_rendition_mode: "HD_ONLY" });
    mocks.resolvePublicTvChannelReadiness.mockResolvedValueOnce({
      status: "AVAILABLE",
      version: "schedule-1:8",
      renditionMode: "HD_ONLY",
      segments: [],
    });
    const unavailable = await rendition(request(`/api/public/stations/${token}/tv/360p/index.m3u8`), {
      params: Promise.resolve({ token, rendition: "360p" }),
    });
    const unavailableBody = await unavailable.json();
    const recovered = await rendition(request(`/api/public/stations/${token}/tv/360p/index.m3u8`), {
      params: Promise.resolve({ token, rendition: "360p" }),
    });
    const recoveredBody = await recovered.text();

    expect(unavailable.status).toBe(404);
    expect(unavailableBody).toEqual(expect.objectContaining({ code: "RENDITION_UNAVAILABLE" }));
    expect(JSON.stringify(unavailableBody)).not.toContain("private/object");
    expect(recovered.status).toBe(200);
    expect(recoveredBody).toContain(`/tv/360p/segments/42.ts?grant=mobile-grant`);
  });

  it("rejects invalid renditions and sequences before station or journal lookup", async () => {
    const invalidRendition = await rendition(request(`/api/public/stations/${token}/tv/1080p/index.m3u8`), {
      params: Promise.resolve({ token, rendition: "1080p" }),
    });
    const invalidSequence = await segment(request(`/api/public/stations/${token}/tv/720p/segments/not-a-sequence.ts`), {
      params: Promise.resolve({ token, rendition: "720p", sequence: "not-a-sequence.ts" }),
    });

    expect(invalidRendition.status).toBe(404);
    expect(invalidSequence.status).toBe(404);
    expect(mocks.resolvePublicStation).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("scopes segment resolution to the authorized station journal and a drain window", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ object_key: "private/object/high-42.ts" }] });
    const source = request(`/api/public/stations/${token}/tv/720p/segments/42.ts?grant=mobile-grant`);
    const response = await segment(source, {
      params: Promise.resolve({ token, rendition: "720p", sequence: "42.ts" }),
    });

    expect(response.status).toBe(200);
    const [sql, values] = mocks.query.mock.calls[0];
    expect(String(sql)).toContain("journal.station_id = $1 AND journal.media_sequence = $2");
    expect(String(sql)).toContain("schedule.station_id = journal.station_id");
    expect(String(sql)).toContain("journal.source_kind = 'AUTOMATION'");
    expect(String(sql)).toContain("interval '2 minutes'");
    expect(values).toEqual([station.id, 42, "720p"]);
    expect(mocks.objectResponse).toHaveBeenCalledWith(
      "private/object/high-42.ts",
      source,
      "private, max-age=86400, immutable",
    );
  });

  it("rejects direct 360p segment access for an HD_ONLY station before object lookup", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({ ...station, tv_channel_rendition_mode: "HD_ONLY" });
    const response = await segment(request(`/api/public/stations/${token}/tv/360p/segments/52.ts`), {
      params: Promise.resolve({ token, rendition: "360p", sequence: "52.ts" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.objectResponse).not.toHaveBeenCalled();
  });

  it("does not query journal objects when station authorization fails", async () => {
    mocks.resolvePublicStation.mockRejectedValueOnce(new HttpError(401, "Password required.", "PASSWORD_REQUIRED"));
    const response = await segment(request(`/api/public/stations/${token}/tv/720p/segments/42.ts`), {
      params: Promise.resolve({ token, rendition: "720p", sequence: "42.ts" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.objectResponse).not.toHaveBeenCalled();
  });

  it("rejects legacy and stopped stations cleanly", async () => {
    mocks.resolvePublicStation.mockResolvedValueOnce({ ...station, tv_delivery_mode: "LEGACY_VOD" });
    const legacy = await master(request(`/api/public/stations/${token}/tv/master.m3u8`), {
      params: Promise.resolve({ token }),
    });
    mocks.resolvePublicStation.mockResolvedValueOnce({ ...station, broadcast_state: "STOPPED" });
    const stopped = await master(request(`/api/public/stations/${token}/tv/master.m3u8`), {
      params: Promise.resolve({ token }),
    });

    expect(legacy.status).toBe(404);
    expect(stopped.status).toBe(409);
  });

  it("removes Calendar OFFLINE manifests while old segment objects remain drainable", async () => {
    mocks.resolveCalendarRuntime.mockResolvedValueOnce({ plannedStatus: "OFFLINE" });
    const unavailable = await master(request(`/api/public/stations/${token}/tv/master.m3u8`), {
      params: Promise.resolve({ token }),
    });

    expect(unavailable.status).toBe(409);
    expect(mocks.resolvePublicTvChannelReadiness).not.toHaveBeenCalled();
    expect(mocks.resolveCalendarRuntime).toHaveBeenCalledTimes(1);

    mocks.query.mockResolvedValueOnce({ rows: [{ object_key: "private/object/high-42.ts" }] });
    const draining = await segment(request(`/api/public/stations/${token}/tv/720p/segments/42.ts`), {
      params: Promise.resolve({ token, rendition: "720p", sequence: "42.ts" }),
    });
    expect(draining.status).toBe(200);
    expect(mocks.objectResponse).toHaveBeenCalledWith(
      "private/object/high-42.ts",
      expect.any(Request),
      "private, max-age=86400, immutable",
    );
  });
});
