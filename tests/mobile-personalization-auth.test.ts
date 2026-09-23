import { beforeEach, describe, expect, it, vi } from "vitest";

const token = "A".repeat(43);
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveSessionUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/crypto", () => ({ hashToken: (value: string) => `hash:${value}` }));
vi.mock("@/lib/auth", () => ({ resolveSessionUser: mocks.resolveSessionUser }));

import { optionalMobileAuth } from "@/lib/mobile-auth";

describe("optional mobile bearer identity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays anonymous only when the authorization header is absent", async () => {
    await expect(optionalMobileAuth(new Request("https://example.test/catalog"))).resolves.toBeNull();
    expect(mocks.resolveSessionUser).not.toHaveBeenCalled();
  });

  it("rejects malformed or invalid credentials instead of silently becoming anonymous", async () => {
    await expect(optionalMobileAuth(new Request("https://example.test/catalog", {
      headers: { Authorization: "Bearer invalid" },
    }))).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });

    mocks.resolveSessionUser.mockResolvedValueOnce(null);
    await expect(optionalMobileAuth(new Request("https://example.test/catalog", {
      headers: { Authorization: `Bearer ${token}` },
    }))).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("resolves a supplied credential against only the MOBILE audience", async () => {
    const user = { id: "user", mustChangePassword: false };
    mocks.resolveSessionUser.mockResolvedValueOnce(user);

    await expect(optionalMobileAuth(new Request("https://example.test/catalog", {
      headers: { Authorization: `Bearer ${token}` },
    }))).resolves.toEqual({ token, user });
    expect(mocks.resolveSessionUser).toHaveBeenCalledWith(token, "MOBILE");
  });
});
