import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { usageBytes: "0" };
  const events: string[] = [];
  const clientQuery = vi.fn(async (text: string, values: unknown[] = []) => {
    void values;
    if (text.includes("SELECT id FROM stations")) events.push("lock-station");
    else if (text.includes("station_media_storage_usage_v")) events.push("read-usage");
    else if (text.includes("INSERT INTO videos")) events.push("insert-video");
    if (text.includes("SELECT id FROM stations")) return { rows: [{ id: "station-1" }], rowCount: 1 };
    if (text.includes("station_media_storage_usage_v")) return { rows: [{ bytes: state.usageBytes }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
  const transaction = vi.fn(async (work: (client: { query: typeof clientQuery }) => Promise<unknown>) => {
    events.push("transaction-start");
    const result = await work({ query: clientQuery });
    events.push("transaction-commit");
    return result;
  });
  return {
    state,
    events,
    clientQuery,
    query,
    transaction,
    requireApiUser: vi.fn(),
    assertStationOwner: vi.fn(),
    assertStationOwnerKind: vi.fn(),
    fileTypeFromBuffer: vi.fn(),
    ensureBucket: vi.fn(),
    putObject: vi.fn(),
    addJob: vi.fn(),
    env: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
  assertStationOwner: mocks.assertStationOwner,
  assertStationOwnerKind: mocks.assertStationOwnerKind,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("file-type", () => ({ fileTypeFromBuffer: mocks.fileTypeFromBuffer }));
vi.mock("@/lib/storage", () => ({
  bucket: "test-bucket",
  ensureBucket: mocks.ensureBucket,
  storage: { putObject: mocks.putObject },
}));
vi.mock("@/lib/queue", () => ({ getTranscodeQueue: () => ({ add: mocks.addJob }) }));

import { POST } from "@/app/api/stations/[id]/uploads/route";
import { POST as INITIATE } from "@/app/api/stations/[id]/uploads/initiate/route";

function uploadRequest(size = 20, replacementForId?: string): Request {
  const url = new URL("http://localhost/api/stations/station-1/uploads");
  url.searchParams.set("filename", "clip.mp4");
  if (replacementForId) url.searchParams.set("replacementForId", replacementForId);
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "video/mp4", "content-length": String(size) },
    body: new Blob([new Uint8Array(size)]),
  });
}

function initiateRequest(size = 20, replacementForId?: string): Request {
  return new Request("http://localhost/api/stations/station-1/uploads/initiate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: "clip.mp4", mimeType: "video/mp4", size, replacementForId }),
  });
}

describe("upload storage reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.usageBytes = "0";
    mocks.events.length = 0;
    mocks.requireApiUser.mockResolvedValue({ id: "user-1", email: "owner@example.com", displayName: "Owner" });
    mocks.assertStationOwner.mockResolvedValue(undefined);
    mocks.assertStationOwnerKind.mockResolvedValue(undefined);
    mocks.env.mockReturnValue({ MAX_UPLOAD_BYTES: 1_000 });
    mocks.fileTypeFromBuffer.mockImplementation(async () => {
      mocks.events.push("signature-inspected");
      return { ext: "mp4", mime: "video/mp4" };
    });
    mocks.ensureBucket.mockImplementation(async () => {
      mocks.events.push("bucket-ready");
    });
    mocks.putObject.mockImplementation(async () => {
      mocks.events.push("s3-stream");
    });
  });

  it("locks the station and reserves its retained source bytes before streaming", async () => {
    const response = await POST(uploadRequest(), { params: Promise.resolve({ id: "station-1" }) });

    expect(response.status).toBe(202);
    expect(mocks.clientQuery.mock.calls.map(([text]) => text)).toEqual([
      expect.stringContaining("SELECT id FROM stations WHERE id = $1 AND owner_id = $2"),
      expect.stringContaining("station_media_storage_usage_v"),
      expect.stringContaining("INSERT INTO videos"),
    ]);
    const usageSql = mocks.clientQuery.mock.calls[1][0];
    expect(usageSql).toContain("WHERE station_id = $1");
    expect(usageSql).not.toContain("status");
    expect(mocks.events).toEqual([
      "signature-inspected",
      "transaction-start",
      "lock-station",
      "read-usage",
      "insert-video",
      "transaction-commit",
      "bucket-ready",
      "s3-stream",
    ]);
  });

  it("rejects an over-quota upload without inserting or streaming", async () => {
    mocks.state.usageBytes = "10737418231";

    const response = await POST(uploadRequest(), { params: Promise.resolve({ id: "station-1" }) });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "STATION_STORAGE_LIMIT" });
    expect(mocks.clientQuery).toHaveBeenCalledTimes(2);
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps replacement validation before reserving quota", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await POST(uploadRequest(20, "missing-video"), { params: Promise.resolve({ id: "station-1" }) });

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.fileTypeFromBuffer).not.toHaveBeenCalled();
  });

  it("reserves the full expected size for an initiated chunk upload", async () => {
    const response = await INITIATE(initiateRequest(20), { params: Promise.resolve({ id: "station-1" }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ chunkSize: 512 * 1024, chunkCount: 1 });
    expect(mocks.clientQuery.mock.calls.map(([text]) => text)).toEqual([
      expect.stringContaining("SELECT id FROM stations WHERE id = $1 AND owner_id = $2"),
      expect.stringContaining("station_media_storage_usage_v"),
      expect.stringContaining("INSERT INTO videos"),
    ]);
    const insertValues = mocks.clientQuery.mock.calls[2][1] as unknown[];
    expect(insertValues[3]).toMatch(/^stations\/station-1\/chunked-sources\/.+\/$/);
    expect(insertValues[6]).toBe(20);
    expect(mocks.fileTypeFromBuffer).not.toHaveBeenCalled();
    expect(mocks.putObject).not.toHaveBeenCalled();
  });
});
