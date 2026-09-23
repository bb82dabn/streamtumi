import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), upgradeTvStudioProjectToV2: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://streamtumi.test" }) }));
vi.mock("@/lib/studio", () => ({ upgradeTvStudioProjectToV2: mocks.upgradeTvStudioProjectToV2 }));

import { POST as upgradeProject } from "@/app/api/stations/[id]/studio/projects/[projectId]/upgrade/route";

const stationId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "00000000-0000-4000-8000-000000000004";
const project = { id: projectId, draftVersion: 4, document: { schemaVersion: 2 } };

function request(body: unknown, origin = "https://streamtumi.test"): Request {
  return new Request(`https://streamtumi.test/api/stations/${stationId}/studio/projects/${projectId}/upgrade`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
}

const valid = { targetSchemaVersion: 2, expectedDraftVersion: 3, idempotencyKey };

describe("TV production project upgrade route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner" });
    mocks.upgradeTvStudioProjectToV2.mockResolvedValue(project);
  });

  it("upgrades an owner project", async () => {
    const response = await upgradeProject(request(valid), { params: Promise.resolve({ id: stationId, projectId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.upgradeTvStudioProjectToV2).toHaveBeenCalledWith(stationId, projectId, "owner", 3, idempotencyKey);
  });

  it("requires authentication", async () => {
    mocks.requireApiUser.mockRejectedValue(new HttpError(401, "Sign in is required.", "UNAUTHENTICATED"));
    const response = await upgradeProject(request(valid), { params: Promise.resolve({ id: stationId, projectId }) });
    expect(response.status).toBe(401);
  });

  it("rejects cross-origin and malformed requests", async () => {
    expect((await upgradeProject(request(valid, "https://hostile.test"), { params: Promise.resolve({ id: stationId, projectId }) })).status).toBe(403);
    expect((await upgradeProject(request({ ...valid, targetSchemaVersion: 1 }), { params: Promise.resolve({ id: stationId, projectId }) })).status).toBe(400);
  });
});
