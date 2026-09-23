import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunkManifest, chunkSourcePrefix, UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload-chunks";

const mocks = vi.hoisted(() => ({
  state: {
    status: "UPLOADING",
    chunks: [] as Array<{ name: string; size: number }>,
  },
  requireApiUser: vi.fn(),
  assertVideoOwner: vi.fn(),
  query: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
  ensureBucket: vi.fn(),
  listObjectsV2: vi.fn(),
  statObject: vi.fn(),
  addJob: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
  assertVideoOwner: mocks.assertVideoOwner,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/storage", () => ({
  bucket: "test-bucket",
  ensureBucket: mocks.ensureBucket,
  storage: { listObjectsV2: mocks.listObjectsV2, statObject: mocks.statObject },
}));
vi.mock("@/lib/queue", () => ({ getTranscodeQueue: () => ({ add: mocks.addJob }) }));

import { POST } from "@/app/api/videos/[id]/upload/complete/route";

const sourcePrefix = chunkSourcePrefix("station-1", "video-1");
const totalSize = UPLOAD_CHUNK_SIZE_BYTES + 23;

function request(): Request {
  return new Request("http://localhost/api/videos/video-1/upload/complete", { method: "POST" });
}

describe("chunk upload completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.status = "UPLOADING";
    mocks.state.chunks = chunkManifest(sourcePrefix, totalSize).map(({ name, size }) => ({ name, size }));
    mocks.requireApiUser.mockResolvedValue({ id: "user-1" });
    mocks.assertVideoOwner.mockResolvedValue({ stationId: "station-1" });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT status")) {
        return { rows: [{ status: mocks.state.status, source_key: sourcePrefix, size_bytes: String(totalSize) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.listObjectsV2.mockImplementation(() => {
      const stream = new EventEmitter();
      queueMicrotask(() => {
        mocks.state.chunks.forEach((chunk) => stream.emit("data", chunk));
        stream.emit("end");
      });
      return stream;
    });
    mocks.statObject.mockImplementation(async (_bucket: string, name: string) => ({
      size: mocks.state.chunks.find((chunk) => chunk.name === name)?.size,
    }));
  });

  it("lists and stats every deterministic chunk before queueing one stable job id", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: "video-1" }) });

    expect(response.status).toBe(202);
    expect(mocks.assertVideoOwner).toHaveBeenCalledWith("video-1", "user-1");
    expect(mocks.listObjectsV2).toHaveBeenCalledWith("test-bucket", sourcePrefix, true);
    expect(mocks.statObject).toHaveBeenCalledTimes(2);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("status = 'QUEUED'"))).toBe(true);
    expect(mocks.addJob).toHaveBeenCalledWith("transcode-video", { videoId: "video-1" }, { jobId: "video-video-1" });
  });

  it("rejects a mismatched final chunk without queueing or changing status", async () => {
    mocks.state.chunks[1] = { ...mocks.state.chunks[1], size: 22 };

    const response = await POST(request(), { params: Promise.resolve({ id: "video-1" }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "INCOMPLETE_UPLOAD" });
    expect(mocks.statObject).not.toHaveBeenCalled();
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("status = 'QUEUED'"))).toBe(false);
    expect(mocks.addJob).not.toHaveBeenCalled();
  });

  it("requires the upload to remain UPLOADING", async () => {
    mocks.state.status = "FAILED";

    const response = await POST(request(), { params: Promise.resolve({ id: "video-1" }) });

    expect(response.status).toBe(409);
    expect(mocks.listObjectsV2).not.toHaveBeenCalled();
    expect(mocks.addJob).not.toHaveBeenCalled();
  });
});
