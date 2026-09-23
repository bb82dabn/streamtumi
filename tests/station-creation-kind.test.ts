import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  lockActiveUser: vi.fn(),
  query: vi.fn(),
  dbQuery: vi.fn(),
  activeGenreId: vi.fn(),
  rateLimitByKey: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser, lockActiveUser: mocks.lockActiveUser }));
vi.mock("@/lib/db", () => ({
  query: mocks.dbQuery,
  transaction: async (operation: (client: { query: typeof mocks.query }) => unknown) => operation({ query: mocks.query }),
}));
vi.mock("@/lib/genres", () => ({ activeGenreId: mocks.activeGenreId }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByKey: mocks.rateLimitByKey }));
vi.mock("@/lib/stations", () => ({
  newAccessToken: () => ({ hash: "hash", ciphertext: "ciphertext", hint: "hint", token: "token" }),
  viewerUrl: (_: string, kind: "TV" | "RADIO") => kind === "RADIO" ? "https://example/listen/token" : "https://example/watch/token",
}));

import { GET, POST } from "@/app/api/stations/route";

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/stations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test station", genreId: "00000000-0000-4000-8000-000000000001", ...body }),
  });
}

function productRequest(product: "MAIN" | "RADIO", body: Record<string, unknown>): Request {
  const result = request(body);
  result.headers.set("x-streamtumi-product", product);
  return result;
}

describe("station creation kinds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner-1" });
    mocks.activeGenreId.mockResolvedValue("00000000-0000-4000-8000-000000000001");
  });

  it("creates legacy TV stations by default", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "station-tv", station_kind: "TV" }] });
    const response = await POST(request({}));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ stationKind: "TV", managementUrl: "/stations/station-tv", viewerUrl: "https://example/watch/token" });
    expect(mocks.rateLimitByKey).toHaveBeenCalledWith("station-create", "owner-1", 20, 3_600);
    expect(mocks.query.mock.calls[0][1]).toEqual(expect.arrayContaining(["TV", "LEGACY_LOOP", "UTC"]));
  });

  it("creates Radio stations in clock mode with a listener URL", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "station-radio", station_kind: "RADIO" }] });
    const response = await POST(request({ stationKind: "RADIO", timeZone: "America/Chicago" }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ stationKind: "RADIO", managementUrl: "/stations/station-radio", viewerUrl: "https://example/listen/token" });
    expect(mocks.query.mock.calls[0][1]).toEqual(expect.arrayContaining(["RADIO", "CLOCK", "America/Chicago"]));
  });

  it("honors the validated body kind and ignores the compatibility product header", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "station-radio", station_kind: "RADIO" }] });
    const response = await POST(productRequest("MAIN", { stationKind: "RADIO" }));
    expect(response.status).toBe(201);
    expect(mocks.query.mock.calls[0][1]).toEqual(expect.arrayContaining(["RADIO", "CLOCK"]));
  });

  it("lists both kinds by default and accepts only explicit kind filters", async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    expect((await GET(new Request("https://example/api/stations"))).status).toBe(200);
    expect(mocks.dbQuery.mock.calls[0][1]).toEqual(["owner-1", null]);

    expect((await GET(new Request("https://example/api/stations?kind=RADIO"))).status).toBe(200);
    expect(mocks.dbQuery.mock.calls[1][1]).toEqual(["owner-1", "RADIO"]);
    expect((await GET(new Request("https://example/api/stations?kind=radio"))).status).toBe(400);
  });
});
