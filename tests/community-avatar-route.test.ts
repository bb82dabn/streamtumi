import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  objectResponse: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/avatar-image", () => ({
  avatarObjectKey: (revision: string, size: number) => `community/avatars/${revision}/${size}.jpg`,
  isAvatarRevision: (revision: string) => /^[A-Za-z0-9_-]{43}$/.test(revision),
}));
vi.mock("@/lib/media", () => ({ objectResponse: mocks.objectResponse }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { GET } from "@/app/api/community/avatars/[revision]/[variant]/route";

const revision = "R".repeat(43);

describe("public community avatar serving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });
    mocks.objectResponse.mockResolvedValue(new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } }));
  });

  it("proxies only a current active pointer with immutable public caching", async () => {
    const response = await GET(
      new Request(`https://streamtumi.test/api/community/avatars/${revision}/96.jpg`),
      { params: Promise.resolve({ revision, variant: "96.jpg" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.query.mock.calls[0][0]).toContain("deletion_requested_at IS NULL");
    expect(mocks.objectResponse).toHaveBeenCalledWith(
      `community/avatars/${revision}/96.jpg`,
      expect.any(Request),
      "public, max-age=31536000, immutable",
    );
  });

  it("does not read storage for an inactive or stale revision", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await GET(
      new Request(`https://streamtumi.test/api/community/avatars/${revision}/256.jpg`),
      { params: Promise.resolve({ revision, variant: "256.jpg" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.objectResponse).not.toHaveBeenCalled();
  });
});
