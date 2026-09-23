import { beforeEach, describe, expect, it, vi } from "vitest";

const bearerToken = "M".repeat(43);
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveSessionUser: vi.fn(),
  recentMessages: vi.fn(),
  pinnedMessages: vi.fn(),
  createMessage: vi.fn(),
  registeredChatActor: vi.fn(),
  publishStationEvent: vi.fn(),
  resolvePublicStation: vi.fn(),
  stationByToken: vi.fn(),
  stationEngagement: vi.fn(),
  becomeFan: vi.fn(),
  stopBeingFan: vi.fn(),
  rateStation: vi.fn(),
  clearStationRating: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitByKey: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/auth", () => ({ resolveSessionUser: mocks.resolveSessionUser }));
vi.mock("@/lib/chat", () => ({
  recentMessages: mocks.recentMessages,
  pinnedMessages: mocks.pinnedMessages,
  createMessage: mocks.createMessage,
  registeredChatActor: mocks.registeredChatActor,
}));
vi.mock("@/lib/chat-events", () => ({ publishStationEvent: mocks.publishStationEvent }));
vi.mock("@/lib/crypto", () => ({ hashToken: (value: string) => `hash:${value}` }));
vi.mock("@/lib/public-access", () => ({
  resolvePublicStation: mocks.resolvePublicStation,
  stationByToken: mocks.stationByToken,
}));
vi.mock("@/lib/guide", () => ({
  stationEngagement: mocks.stationEngagement,
  becomeFan: mocks.becomeFan,
  stopBeingFan: mocks.stopBeingFan,
  rateStation: mocks.rateStation,
  clearStationRating: mocks.clearStationRating,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  rateLimitByKey: mocks.rateLimitByKey,
}));

import { GET as getChat, POST as postChat } from "@/app/api/mobile/v1/stations/[token]/chat/messages/route";
import { GET as getEngagement } from "@/app/api/mobile/v1/stations/[token]/engagement/route";
import { DELETE as deleteFan, PUT as putFan } from "@/app/api/mobile/v1/stations/[token]/fan/route";
import { DELETE as deleteRating, PUT as putRating } from "@/app/api/mobile/v1/stations/[token]/rating/route";

const station = {
  id: "station-1",
  owner_id: "owner-1",
  visibility: "PUBLIC",
};
const listener = {
  id: "listener-1",
  email: "listener@example.com",
  displayName: "Listener",
  role: "USER",
  mustChangePassword: false,
  emailVerified: true,
};
const guestMessage = {
  id: "message-1",
  stationId: station.id,
  authorKind: "GUEST",
  authorName: "Earlier Guest",
  avatarUrl: null,
  body: "Historical message",
  createdAt: "2026-08-18T12:00:00.000Z",
  pinnedAt: null,
  hidden: false,
};
const registeredMessage = {
  ...guestMessage,
  id: "message-2",
  authorKind: "REGISTERED",
  authorName: listener.displayName,
  avatarUrl: `/api/community/avatars/${"R".repeat(43)}/96.jpg`,
  body: "Bearer-authenticated message",
};
const engagement = {
  fanCount: 4,
  ratingAverage: 4.5,
  ratingCount: 2,
  isFan: true,
  viewerRating: 5,
};
const context = { params: Promise.resolve({ token: "public-token" }) };

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://streamtumi.test/api/mobile/v1/stations/public-token/${path}`, init);
}

function authenticated(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${bearerToken}`);
  return { ...init, headers };
}

describe("mobile station community routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSessionUser.mockResolvedValue(listener);
    mocks.resolvePublicStation.mockResolvedValue(station);
    mocks.stationByToken.mockResolvedValue(station);
    mocks.recentMessages.mockResolvedValue([guestMessage]);
    mocks.pinnedMessages.mockResolvedValue([]);
    mocks.createMessage.mockResolvedValue(registeredMessage);
    mocks.registeredChatActor.mockImplementation((resolvedStation, user) => ({
      kind: user.id === resolvedStation.owner_id ? "HOST" : "REGISTERED",
      id: user.id,
      name: user.displayName,
      user,
    }));
    mocks.stationEngagement.mockResolvedValue(engagement);
  });

  it("keeps chat history anonymous and includes historical guest messages", async () => {
    const response = await getChat(request("chat/messages", {
      headers: { Cookie: `${"cl_session"}=${bearerToken}; st_chat_guest=legacy-guest` },
    }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      messages: [{ authorKind: "GUEST", authorName: "Earlier Guest", avatarUrl: null }],
      viewer: null,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.resolveSessionUser).not.toHaveBeenCalled();
    expect(mocks.registeredChatActor).not.toHaveBeenCalled();
  });

  it("does not personalize engagement from cookies", async () => {
    const response = await getEngagement(request("engagement", {
      headers: { Cookie: `cl_session=${bearerToken}` },
    }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ signedIn: false, isOwner: false });
    expect(mocks.stationEngagement).toHaveBeenCalledWith(station.id, undefined);
    expect(mocks.resolveSessionUser).not.toHaveBeenCalled();
  });

  it("uses only a MOBILE bearer session for chat and engagement personalization", async () => {
    const chatResponse = await getChat(request("chat/messages", authenticated()), context);
    const engagementResponse = await getEngagement(request("engagement", authenticated()), context);

    expect(chatResponse.status).toBe(200);
    await expect(chatResponse.json()).resolves.toMatchObject({
      viewer: { kind: "REGISTERED", displayName: listener.displayName, canModerate: false },
    });
    expect(engagementResponse.status).toBe(200);
    await expect(engagementResponse.json()).resolves.toMatchObject({ signedIn: true, isFan: true });
    expect(mocks.resolveSessionUser).toHaveBeenCalledTimes(2);
    expect(mocks.resolveSessionUser).toHaveBeenNthCalledWith(1, bearerToken, "MOBILE");
    expect(mocks.resolveSessionUser).toHaveBeenNthCalledWith(2, bearerToken, "MOBILE");
    expect(mocks.stationEngagement).toHaveBeenCalledWith(station.id, listener.id);
  });

  it("rejects malformed bearer credentials instead of falling back to anonymous", async () => {
    const response = await getChat(request("chat/messages", {
      headers: { Authorization: "Bearer short", Cookie: `cl_session=${bearerToken}` },
    }), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mocks.recentMessages).not.toHaveBeenCalled();
    expect(mocks.resolveSessionUser).not.toHaveBeenCalled();
  });

  it("rejects cookie-backed guest chat posts", async () => {
    const response = await postChat(request("chat/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `cl_session=${bearerToken}; st_chat_guest=legacy-guest`,
      },
      body: JSON.stringify({ body: "Guest post" }),
    }), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mocks.resolveSessionUser).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it.each(["chat", "fan-put", "fan-delete", "rating-put", "rating-delete"])(
    "requires a verified email for the %s mutation",
    async (mutation) => {
      mocks.resolveSessionUser.mockResolvedValue({ ...listener, emailVerified: false });
      let response: Response;
      if (mutation === "chat") {
        response = await postChat(request("chat/messages", authenticated({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "Hello" }),
        })), context);
      } else if (mutation === "fan-put") {
        response = await putFan(request("fan", authenticated({ method: "PUT" })), context);
      } else if (mutation === "fan-delete") {
        response = await deleteFan(request("fan", authenticated({ method: "DELETE" })), context);
      } else if (mutation === "rating-put") {
        response = await putRating(request("rating", authenticated({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: 5 }),
        })), context);
      } else {
        response = await deleteRating(request("rating", authenticated({ method: "DELETE" })), context);
      }

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
      expect(mocks.createMessage).not.toHaveBeenCalled();
      expect(mocks.becomeFan).not.toHaveBeenCalled();
      expect(mocks.stopBeingFan).not.toHaveBeenCalled();
      expect(mocks.rateStation).not.toHaveBeenCalled();
      expect(mocks.clearStationRating).not.toHaveBeenCalled();
    },
  );

  it("posts chat as the bearer user and publishes the existing station event", async () => {
    const response = await postChat(request("chat/messages", authenticated({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Bearer-authenticated message" }),
    })), context);

    expect(response.status).toBe(201);
    expect(mocks.createMessage).toHaveBeenCalledWith(station.id, expect.objectContaining({
      kind: "REGISTERED",
      id: listener.id,
    }), "Bearer-authenticated message");
    expect(mocks.publishStationEvent).toHaveBeenCalledWith(station.id, {
      type: "message.created",
      data: registeredMessage,
    });
  });

  it("routes fan PUT and DELETE through the existing engagement functions", async () => {
    const putResponse = await putFan(request("fan", authenticated({ method: "PUT" })), context);
    const deleteResponse = await deleteFan(request("fan", authenticated({ method: "DELETE" })), context);

    expect(putResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(mocks.becomeFan).toHaveBeenCalledWith(station, listener);
    expect(mocks.stopBeingFan).toHaveBeenCalledWith(station, listener);
    expect(mocks.stationEngagement).toHaveBeenCalledWith(station.id, listener.id);
  });

  it("validates ratings and supports setting and clearing a valid rating", async () => {
    const invalid = await putRating(request("rating", authenticated({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 6 }),
    })), context);

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.rateStation).not.toHaveBeenCalled();

    const valid = await putRating(request("rating", authenticated({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 4 }),
    })), context);
    const cleared = await deleteRating(request("rating", authenticated({ method: "DELETE" })), context);

    expect(valid.status).toBe(200);
    expect(cleared.status).toBe(200);
    expect(mocks.rateStation).toHaveBeenCalledWith(station, listener, 4);
    expect(mocks.clearStationRating).toHaveBeenCalledWith(station, listener);
  });
});
