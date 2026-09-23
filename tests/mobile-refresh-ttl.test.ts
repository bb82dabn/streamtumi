import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  hashToken: (token: string) => `sha256:${token}`,
  randomToken: () => "T".repeat(43),
}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: mocks.transaction }));
vi.mock("@/lib/env", () => ({ env: () => ({ SESSION_TTL_DAYS: 7 }) }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createSession, requestSessionAudience } from "@/lib/auth";

describe("mobile access token TTL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    mocks.transaction.mockImplementation(async (work: (client: { query: typeof mocks.clientQuery }) => Promise<unknown>) => (
      work({ query: mocks.clientQuery })
    ));
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ must_change_password: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ must_change_password: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ must_change_password: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses MAIN for every browser session and a short MOBILE TTL", async () => {
    await expect(requestSessionAudience()).resolves.toBe("MAIN");
    await createSession("00000000-0000-4000-8000-000000000001", "MAIN");
    await createSession("00000000-0000-4000-8000-000000000001", "RADIO");
    await createSession("00000000-0000-4000-8000-000000000001", "MOBILE");

    expect(mocks.clientQuery.mock.calls[1]?.[1]?.[2]).toEqual(new Date("2026-08-25T12:00:00.000Z"));
    expect(mocks.clientQuery.mock.calls[1]?.[1]?.[3]).toBe("MAIN");
    expect(mocks.clientQuery.mock.calls[3]?.[1]?.[3]).toBe("MAIN");
    expect(mocks.clientQuery.mock.calls[5]?.[1]?.[2]).toEqual(new Date("2026-08-18T12:15:00.000Z"));
    expect(mocks.clientQuery.mock.calls[5]?.[1]?.[3]).toBe("MOBILE");
  });
});
