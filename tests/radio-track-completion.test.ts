import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunkManifest, radioTrackChunkSourcePrefix, UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload-chunks";

const mocks = vi.hoisted(() => ({
  state: { status: "UPLOADING", chunks: [] as Array<{ name: string; size: number }> },
  requireApiUser: vi.fn(),
  assertRadioTrackOwner: vi.fn(),
  query: vi.fn(),
  clientQuery: vi.fn(),
  transaction: vi.fn(),
  ensureBucket: vi.fn(),
  listObjectsV2: vi.fn(),
  statObject: vi.fn(),
  addJob: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser, assertRadioTrackOwner: mocks.assertRadioTrackOwner }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/storage", () => ({ bucket: "test-bucket", ensureBucket: mocks.ensureBucket, storage: { listObjectsV2: mocks.listObjectsV2, statObject: mocks.statObject } }));
vi.mock("@/lib/queue", () => ({ getRadioPrepQueue: () => ({ add: mocks.addJob }) }));

import { POST } from "@/app/api/radio/tracks/[id]/upload/complete/route";

const prefix = radioTrackChunkSourcePrefix("station-1", "track-1");
const totalSize = UPLOAD_CHUNK_SIZE_BYTES + 19;

describe("Radio track completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.status = "UPLOADING";
    mocks.state.chunks = chunkManifest(prefix, totalSize).map(({ name, size }) => ({ name, size }));
    mocks.requireApiUser.mockResolvedValue({ id: "owner-1" });
    mocks.assertRadioTrackOwner.mockResolvedValue({ stationId: "station-1" });
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes("SELECT status")
      ? { rows: [{ status: mocks.state.status, source_key: prefix, size_bytes: String(totalSize) }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => work({ query: mocks.clientQuery }));
    mocks.listObjectsV2.mockImplementation(() => {
      const stream = new EventEmitter();
      queueMicrotask(() => { mocks.state.chunks.forEach((chunk) => stream.emit("data", chunk)); stream.emit("end"); });
      return stream;
    });
    mocks.statObject.mockImplementation(async (_bucket: string, name: string) => ({ size: mocks.state.chunks.find((chunk) => chunk.name === name)?.size }));
  });

  it("verifies every chunk and queues one stable preparation job", async () => {
    const response = await POST(new Request("http://localhost/api/radio/tracks/track-1/upload/complete", { method: "POST" }), { params: Promise.resolve({ id: "track-1" }) });
    expect(response.status).toBe(202);
    expect(mocks.statObject).toHaveBeenCalledTimes(2);
    expect(mocks.addJob).toHaveBeenCalledWith("prepare-radio-track", { trackId: "track-1" }, { jobId: "radio-track-track-1" });
  });

  it("does not queue an incomplete upload", async () => {
    mocks.state.chunks.pop();
    const response = await POST(new Request("http://localhost/api/radio/tracks/track-1/upload/complete", { method: "POST" }), { params: Promise.resolve({ id: "track-1" }) });
    expect(response.status).toBe(409);
    expect(mocks.addJob).not.toHaveBeenCalled();
  });
});
