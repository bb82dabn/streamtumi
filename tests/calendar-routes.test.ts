import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  getCalendarDraft: vi.fn(),
  replaceCalendarDraft: vi.fn(),
  previewCalendarDraft: vi.fn(),
  publishCalendarRelease: vi.fn(),
  activateCalendarRelease: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/calendar-publication", () => ({
  getCalendarDraft: mocks.getCalendarDraft,
  replaceCalendarDraft: mocks.replaceCalendarDraft,
  previewCalendarDraft: mocks.previewCalendarDraft,
  publishCalendarRelease: mocks.publishCalendarRelease,
  activateCalendarRelease: mocks.activateCalendarRelease,
}));

import { GET, PUT } from "@/app/api/stations/[id]/calendar/route";
import { POST as preview } from "@/app/api/stations/[id]/calendar/preview/route";
import { POST as publish } from "@/app/api/stations/[id]/calendar/publish/route";
import { POST as activate } from "@/app/api/stations/[id]/calendar/releases/[releaseId]/activate/route";

const stationId = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";
const releaseId = "00000000-0000-4000-8000-000000000003";
const eventId = "00000000-0000-4000-8000-000000000004";
const scheduleId = "00000000-0000-4000-8000-000000000005";
const key = "00000000-0000-4000-8000-000000000006";

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("calendar owner routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "owner" });
    mocks.getCalendarDraft.mockResolvedValue({ profile: { id: profileId }, draftVersion: 0, events: [], exceptions: [] });
    mocks.replaceCalendarDraft.mockResolvedValue({ draftVersion: 1 });
    mocks.previewCalendarDraft.mockResolvedValue({ draftVersion: 1, valid: true, occurrences: [], issues: [] });
    mocks.publishCalendarRelease.mockResolvedValue({ releaseId, idempotent: false });
    mocks.activateCalendarRelease.mockResolvedValue({ releaseId, profileId, activated: true });
  });

  it("requires authentication and keeps owner GET responses private", async () => {
    const response = await GET(new Request(`http://localhost/api/stations/${stationId}/calendar?profileId=${profileId}`), { params: Promise.resolve({ id: stationId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getCalendarDraft).toHaveBeenCalledWith(stationId, "owner", profileId);
    mocks.requireApiUser.mockRejectedValueOnce(new HttpError(401, "Sign in is required.", "UNAUTHENTICATED"));
    const unauthorized = await GET(new Request(`http://localhost/api/stations/${stationId}/calendar?profileId=${profileId}`), { params: Promise.resolve({ id: stationId }) });
    expect(unauthorized.status).toBe(401);
  });

  it("validates and forwards draft replacement without accepting owner or station IDs", async () => {
    const body = {
      profileId,
      expectedDraftVersion: 0,
      events: [{
        id: eventId, title: "Program", eventKind: "PROGRAM",
        source: { kind: "TV_SCHEDULE", scheduleId }, fallbackSource: { kind: "NONE" },
        localStartDate: "2026-01-01", localStartTime: "12:00", timeZone: "UTC",
        durationMs: 60_000, recurrenceKind: "NONE",
      }],
      exceptions: [],
    };
    const response = await PUT(new Request(`http://localhost/api/stations/${stationId}/calendar`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: stationId }) });
    expect(response.status).toBe(200);
    expect(mocks.replaceCalendarDraft).toHaveBeenCalledWith(stationId, "owner", expect.objectContaining({ profileId, expectedDraftVersion: 0 }));
    const invalid = await PUT(new Request(`http://localhost/api/stations/${stationId}/calendar`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ownerId: "owner" }),
    }), { params: Promise.resolve({ id: stationId }) });
    expect(invalid.status).toBe(400);
  });

  it("forwards bounded preview, idempotent publish, and explicit activation", async () => {
    expect((await preview(request(`/api/stations/${stationId}/calendar/preview`, { profileId, from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z" }), { params: Promise.resolve({ id: stationId }) })).status).toBe(200);
    const publishResponse = await publish(request(`/api/stations/${stationId}/calendar/publish`, { profileId, expectedDraftVersion: 1, idempotencyKey: key }), { params: Promise.resolve({ id: stationId }) });
    expect(publishResponse.status).toBe(201);
    expect(mocks.publishCalendarRelease).toHaveBeenCalledWith(stationId, "owner", profileId, 1, key);
    const activationResponse = await activate(request(`/api/stations/${stationId}/calendar/releases/${releaseId}/activate`, { activation: "IMMEDIATE" }), { params: Promise.resolve({ id: stationId, releaseId }) });
    expect(activationResponse.status).toBe(200);
    expect(mocks.activateCalendarRelease).toHaveBeenCalledWith(stationId, "owner", releaseId, "IMMEDIATE");
  });
});
