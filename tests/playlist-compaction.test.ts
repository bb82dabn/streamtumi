import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const clientQuery = vi.fn(async (text: string) => {
    void text;
    return { rows: [], rowCount: 1 };
  });
  return {
    clientQuery,
    query: vi.fn(),
    transaction: vi.fn(async (work: (client: { query: typeof clientQuery }) => Promise<unknown>) => work({ query: clientQuery })),
    requireApiUser: vi.fn(),
    assertVideoOwner: vi.fn(),
    lockPublicationStation: vi.fn(),
    publishAfterScheduleMutation: vi.fn(),
    publishScheduleRefresh: vi.fn(),
    releaseInactiveVideoSource: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
  assertVideoOwner: mocks.assertVideoOwner,
}));
vi.mock("@/lib/schedule-publication", () => ({
  lockPublicationStation: mocks.lockPublicationStation,
  publishAfterScheduleMutation: mocks.publishAfterScheduleMutation,
  publishScheduleRefresh: mocks.publishScheduleRefresh,
}));
vi.mock("@/lib/video-source-lifecycle", () => ({ releaseInactiveVideoSource: mocks.releaseInactiveVideoSource }));

import { DELETE } from "@/app/api/videos/[id]/route";

describe("playlist compaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "user-1", email: "owner@example.com", displayName: "Owner" });
    mocks.assertVideoOwner.mockResolvedValue({ stationId: "station-1" });
    mocks.lockPublicationStation.mockResolvedValue({ station: { id: "station-1", broadcast_state: "STOPPED" }, promoted: false });
    mocks.publishAfterScheduleMutation.mockResolvedValue({ activeChanged: false });
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("offsets unique positions before assigning compacted positions", async () => {
    const response = await DELETE(new Request("http://localhost/api/videos/video-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "video-1" }),
    });

    expect(response.status).toBe(200);
    const statements = mocks.clientQuery.mock.calls.map(([text]) => text);
    const deletion = statements.findIndex((text) => text.includes("DELETE FROM playlist_items"));
    const offset = statements.findIndex((text) => text.includes("SET position = position + 1000000"));
    const compaction = statements.findIndex((text) => text.includes("row_number() OVER (ORDER BY position) - 1"));
    expect(deletion).toBeGreaterThanOrEqual(0);
    expect(offset).toBeGreaterThan(deletion);
    expect(compaction).toBeGreaterThan(offset);
    expect(mocks.releaseInactiveVideoSource).toHaveBeenCalledWith("video-1");
  });
});
