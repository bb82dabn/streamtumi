import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  reserveYouTubeImport: vi.fn(),
  rateLimitByKey: vi.fn(),
  add: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/env", () => ({ env: () => ({ YOUTUBE_IMPORT_ENABLED: true }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/queue", () => ({ getTranscodeQueue: () => ({ add: mocks.add }) }));
vi.mock("@/lib/youtube-import", () => ({ reserveYouTubeImport: mocks.reserveYouTubeImport }));

import { POST } from "@/app/api/stations/[id]/imports/youtube/route";

const stationId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";

function request(rightsConfirmed: boolean) {
  return new Request(`http://localhost/api/stations/${stationId}/imports/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ", rightsConfirmed, requestId }),
  });
}

describe("YouTube import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner" });
    mocks.reserveYouTubeImport.mockResolvedValue({ videoId: "video", status: "QUEUED", created: true });
  });

  it("requires rights confirmation before reserving or queueing", async () => {
    const response = await POST(request(false), { params: Promise.resolve({ id: stationId }) });
    expect(response.status).toBe(400);
    expect(mocks.rateLimitByKey).not.toHaveBeenCalled();
    expect(mocks.reserveYouTubeImport).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("normalizes, reserves, rate-limits, and queues one stable transcode job", async () => {
    const response = await POST(request(true), { params: Promise.resolve({ id: stationId }) });
    expect(response.status).toBe(202);
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("youtube-import", "owner", 60, 3_600);
    expect(mocks.reserveYouTubeImport).toHaveBeenCalledWith(expect.objectContaining({
      stationId,
      requestId,
      source: { videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    }));
    expect(mocks.add).toHaveBeenCalledWith("transcode-video", { videoId: "video" }, { jobId: "video-video" });
  });
});
