import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const oldCredentials = {
  token: "A".repeat(43),
  accessExpiresAt: "2099-08-18T12:15:00.000Z",
  refreshToken: "R".repeat(43),
  refreshExpiresAt: "2099-09-17T12:00:00.000Z",
};
const replacement = {
  token: "B".repeat(43),
  accessExpiresAt: "2099-08-18T12:30:00.000Z",
  refreshToken: "N".repeat(43),
  refreshExpiresAt: "2099-09-17T12:15:00.000Z",
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "listener@example.com",
    displayName: "Listener",
    role: "USER" as const,
    emailVerified: true,
  },
};
const storage = vi.hoisted(() => ({
  clearAuthCredentials: vi.fn(),
  getAuthCredentials: vi.fn(),
  replaceAuthCredentials: vi.fn(),
}));

vi.mock("@/lib/storage", () => storage);

const okSchema = z.object({ ok: z.literal(true) });
const mobileApiModule: string = "../apps/mobile/lib/api";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mobile API refresh handling", () => {
  let current: typeof oldCredentials | Omit<typeof replacement, "user"> | null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    current = { ...oldCredentials };
    storage.getAuthCredentials.mockImplementation(async () => current);
    storage.replaceAuthCredentials.mockImplementation(async (expected: string, next: typeof oldCredentials) => {
      if (current?.refreshToken !== expected) return false;
      current = next;
      return true;
    });
    storage.clearAuthCredentials.mockImplementation(async (expected?: string) => {
      if (expected && current?.refreshToken !== expected) return false;
      current = null;
      return true;
    });
  });

  it("serializes concurrent 401 refreshes and retries each request once with the replacement access token", async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get("authorization");
      if (url.endsWith("/api/mobile/v1/auth/refresh")) {
        await refreshGate;
        return jsonResponse(200, replacement);
      }
      if (authorization === `Bearer ${oldCredentials.token}`) {
        return jsonResponse(401, { error: "Expired", code: "UNAUTHENTICATED" });
      }
      return jsonResponse(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await import(mobileApiModule);

    const requests = [
      api.requestJson("/api/mobile/v1/catalog", okSchema),
      api.requestJson("/api/mobile/v1/catalog", okSchema),
    ];
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/mobile/v1/auth/refresh"))).toHaveLength(1);
    });
    releaseRefresh();

    await expect(Promise.all(requests)).resolves.toEqual([{ ok: true }, { ok: true }]);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/mobile/v1/auth/refresh"));
    const protectedCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/mobile/v1/catalog"));
    expect(refreshCalls).toHaveLength(1);
    expect(protectedCalls).toHaveLength(4);
    expect(new Headers(protectedCalls[2]?.[1]?.headers).get("authorization")).toBe(`Bearer ${replacement.token}`);
    expect(new Headers(protectedCalls[3]?.[1]?.headers).get("authorization")).toBe(`Bearer ${replacement.token}`);
    expect(String(refreshCalls[0]?.[0])).not.toContain(oldCredentials.refreshToken);
    expect(String(refreshCalls[0]?.[1]?.body)).toContain(oldCredentials.refreshToken);
  });

  it("does not recursively refresh any mobile auth endpoint", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("/api/mobile/v1/auth/me");
      return jsonResponse(401, { error: "Expired", code: "UNAUTHENTICATED" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await import(mobileApiModule);

    await expect(api.requestJson("/api/mobile/v1/auth/me", okSchema)).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/refresh"))).toBe(false);
  });

  it("clears credentials and notifies AuthProvider listeners after terminal refresh failure", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => (
      String(input).endsWith("/auth/refresh")
        ? jsonResponse(401, { error: "Reused", code: "REFRESH_TOKEN_REUSED" })
        : jsonResponse(401, { error: "Expired", code: "UNAUTHENTICATED" })
    ));
    vi.stubGlobal("fetch", fetchMock);
    const api = await import(mobileApiModule);
    const listener = vi.fn();
    api.subscribeMobileAuth(listener);

    await expect(api.requestJson("/api/mobile/v1/catalog", okSchema)).rejects.toMatchObject({
      status: 401,
      code: "REFRESH_TOKEN_REUSED",
    });

    expect(storage.clearAuthCredentials).toHaveBeenCalledWith(oldCredentials.refreshToken);
    expect(current).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("retains credentials when refresh is transiently rate limited", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => (
      String(input).endsWith("/auth/refresh")
        ? jsonResponse(429, { error: "Try again later", code: "RATE_LIMITED" })
        : jsonResponse(401, { error: "Expired", code: "UNAUTHENTICATED" })
    ));
    vi.stubGlobal("fetch", fetchMock);
    const api = await import(mobileApiModule);

    await expect(api.requestJson("/api/mobile/v1/catalog", okSchema)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });

    expect(storage.clearAuthCredentials).not.toHaveBeenCalled();
    expect(current).toEqual(oldCredentials);
  });

  it("does not retry a protected request more than once", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => (
      String(input).endsWith("/auth/refresh")
        ? jsonResponse(200, replacement)
        : jsonResponse(401, { error: "Unauthorized", code: "UNAUTHENTICATED" })
    ));
    vi.stubGlobal("fetch", fetchMock);
    const api = await import(mobileApiModule);

    await expect(api.requestJson("/api/mobile/v1/catalog", okSchema)).rejects.toMatchObject({ status: 401 });

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/mobile/v1/catalog"))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
  });
});
