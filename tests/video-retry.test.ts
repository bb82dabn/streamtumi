import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  assertVideoOwner: vi.fn(),
  query: vi.fn(),
  getJob: vi.fn(),
  add: vi.fn(),
  rateLimitByKey: vi.fn(),
  reserveYouTubeRetry: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
  assertVideoOwner: mocks.assertVideoOwner,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/queue", () => ({ getTranscodeQueue: () => ({ getJob: mocks.getJob, add: mocks.add }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/youtube-import", () => ({ reserveYouTubeRetry: mocks.reserveYouTubeRetry }));

import { POST } from "@/app/api/videos/[id]/retry/route";

function request() {
  return new Request("http://localhost/api/videos/video-id/retry", { method: "POST" });
}

describe("video retry queue safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner" });
    mocks.assertVideoOwner.mockResolvedValue({ stationId: "station" });
    mocks.query.mockResolvedValueOnce({ rows: [{ source_kind: "YOUTUBE", ingestion_status: "FAILED" }], rowCount: 1 });
    mocks.reserveYouTubeRetry.mockResolvedValue(true);
    mocks.getJob.mockResolvedValue(null);
  });

  it("rate-limits YouTube retry rounds and queues a stable job", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: "video-id" }) });
    expect(response.status).toBe(200);
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("youtube-import-retry", "owner", 10, 3_600);
    expect(mocks.reserveYouTubeRetry).toHaveBeenCalledWith("video-id", "owner");
    expect(mocks.add).toHaveBeenCalledWith("transcode-video", { videoId: "video-id" }, { jobId: "video-video-id" });
  });

  it("returns the row to failed when Redis queueing fails", async () => {
    mocks.add.mockRejectedValueOnce(new Error("Redis unavailable"));
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const response = await POST(request(), { params: Promise.resolve({ id: "video-id" }) });
    expect(response.status).toBe(503);
    expect(String(mocks.query.mock.calls[1][0])).toMatch(/SET status = 'FAILED'/);
    expect(String(mocks.query.mock.calls[1][0])).toMatch(/ingestion_status/);
    expect(String(mocks.query.mock.calls[1][0])).toMatch(/size_bytes/);
  });
});
