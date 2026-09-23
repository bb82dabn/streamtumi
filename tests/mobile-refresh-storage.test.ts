import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("mobile refresh credential storage", () => {
  it("stores access and refresh credentials together in SecureStore and validates token lengths", async () => {
    const storage = await readFile(new URL("../apps/mobile/lib/storage.ts", import.meta.url), "utf8");
    expect(storage).toContain('import * as SecureStore from "expo-secure-store"');
    expect(storage).toContain('streamtumi.auth-credentials.v2');
    expect(storage).toContain("JSON.stringify(credentials)");
    expect(storage).toContain("credentials.refreshToken");
    expect(storage).toContain("authTokenPattern = /^[A-Za-z0-9_-]{43}$/");
    expect(storage).toContain("replaceAuthCredentials");
  });

  it("subscribes AuthProvider to successful rotation and terminal clearing events", async () => {
    const provider = await readFile(new URL("../apps/mobile/providers/AuthProvider.tsx", import.meta.url), "utf8");
    expect(provider).toContain("subscribeMobileAuth");
    expect(provider).toContain("setSession(user ?");
    expect(provider).toContain("clearAuthCredentials");
    expect(provider).toContain("refreshToken: stored.refreshToken");
  });

  it("stores only opaque room sessions for renewable private-room access", async () => {
    const storage = await readFile(new URL("../apps/mobile/lib/storage.ts", import.meta.url), "utf8");
    const joinRoom = await readFile(new URL("../apps/mobile/app/join-room.tsx", import.meta.url), "utf8");

    expect(storage).toContain("streamtumi.room-sessions.v1");
    expect(storage).toContain("setRoomSession");
    expect(joinRoom).toContain('"/api/mobile/v1/rooms/access"');
    expect(joinRoom).toContain("roomSessionToken");
    expect(joinRoom).not.toContain("setRoomKey");
  });
});
