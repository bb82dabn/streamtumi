import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Roku linked-device client", () => {
  it("keeps anonymous catalog playback and opens the account menu from browse options", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const view = await source("roku/components/MainScene.xml");
    expect(scene).toContain('m.apiOrigin + "/api/roku/v2/catalog"');
    expect(scene).toContain('m.apiOrigin + "/api/device/v1/catalog"');
    expect(scene).toMatch(/if key = "options" or key = "info"\s+showAccountMenu\(\)/);
    expect(scene).toContain('"deviceType": "ROKU"');
    expect(scene).toContain("ReadDeviceToken()");
    expect(scene).toContain('SaveTextSetting("deviceToken", token)');
    expect(scene).toContain('DeleteSetting("deviceToken")');
    expect(view).toContain('id="accountOverlay"');
    expect(view).toContain('id="accountPairButton"');
    expect(view).toContain('id="accountLoginButton"');
    expect(view).toContain('id="accountUnlinkButton"');
    expect(view).toContain('id="activationOverlay"');
    expect(view).toContain('id="activationCode"');
    expect(view).toContain('id="activationUrl"');
  });

  it("supports direct email login without retaining password input", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const view = await source("roku/components/MainScene.xml");
    expect(view).toContain('id="accountLoginGroup"');
    expect(view).toContain('id="loginKeyboard"');
    expect(scene).toContain("m.loginKeyboard.textEditBox.secureMode = true");
    expect(scene).toContain('queueDeviceRequest("login", m.apiOrigin + "/api/device/v1/login", body, "")');
    expect(scene).toContain('FormatJson({ "email": m.loginEmail, "password": password, "deviceType": "ROKU", "displayName": "StreamTumi Roku" })');
    expect(scene).toMatch(/body = FormatJson\([\s\S]*?\)\s+m\.loginKeyboard\.text = ""/);
    expect(scene).toMatch(/m\.loginKeyboard\.text = ""\s+password = ""/);
    expect(scene).toMatch(/if action = "login"[\s\S]*?setDeviceToken\(response\.data\.deviceToken\)/);
  });

  it("enters six-digit room keys but persists only opaque guest session tokens", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const view = await source("roku/components/MainScene.xml");
    const config = await source("roku/source/config.brs");

    expect(view).toContain('id="roomCode"');
    expect(view).toContain('id="roomDigit0"');
    expect(view).toContain('id="roomDigit9"');
    expect(view).toContain('id="roomJoin"');
    expect(scene).toContain("if Len(value) <> 6 then return false");
    expect(scene).toContain('m.roomAccessTask.url = m.apiOrigin + "/api/roku/v2/rooms/access"');
    expect(scene).toContain('FormatJson({ "accessKey": m.roomAccessKey })');
    expect(scene).toContain("rememberRoomSession(station, sessionToken)");
    expect(scene).toContain("Explicit room. Select Join again to confirm you are 18 or older.");
    expect(view).toMatch(/id="roomStatus"[^>]+height="105"[^>]+maxLines="3"/);
    expect(scene).toMatch(/if Left\(buttonId, 9\) = "roomDigit"\s+m\.pendingExplicitRoom = invalid/);
    expect(scene).toMatch(/else if buttonId = "roomDelete"\s+m\.pendingExplicitRoom = invalid/);
    expect(config).toContain('ReadSetting("roomSessionTokens")');
    expect(config).toContain('SaveTextSetting("roomSessionTokens", FormatJson(result))');
    expect(config).toContain("if result.Count() = 12 then exit for");
    expect(`${scene}\n${config}`).not.toMatch(/(?:ReadSetting|SaveTextSetting)\("(?:roomAccessKey|accessKey|roomKey)"/);
  });

  it("submits one fire-and-forget tune after a client-enforced 30 seconds", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const view = await source("roku/components/MainScene.xml");
    expect(view).toContain('<Timer id="tuneTimer" duration="30" repeat="false" />');
    expect(scene).toContain("m.tuneSubmitted = true");
    expect(scene).toContain('m.tuneTask.url = m.apiOrigin + "/api/device/v1/tunes"');
    expect(scene).toContain('m.tuneStationToken = stationTokenFor(m.currentStation)');
    expect(scene).toContain('"stationToken": m.tuneStationToken');
    expect(scene).not.toContain('"stationToken": m.currentStation.token');
    const beginTune = scene.match(/sub beginTuneSession\(\)[\s\S]*?end sub/)?.[0] ?? "";
    const startTimer = scene.match(/sub startTuneTimer\(\)[\s\S]*?end sub/)?.[0] ?? "";
    const submitTune = scene.match(/sub submitTuneSession\(\)[\s\S]*?end sub/)?.[0] ?? "";
    expect(beginTune).toContain("isPrivateStation() then return");
    expect(startTimer).toContain("isPrivateStation() then return");
    expect(submitTune).toContain("isPrivateStation() then return");
    const callback = scene.match(/sub onTuneSubmitted\(\)[\s\S]*?end sub/)?.[0] ?? "";
    expect(callback).toContain("clearDeviceToken(authGeneration)");
    expect(callback).not.toContain("m.video.control");
  });

  it("renews generation-bound room playback before expiry and after stream failure", async () => {
    const scene = await source("roku/components/MainScene.brs");
    expect(scene).toContain("return currentEpochSeconds() + 90 >= m.roomGrantExpiresAt");
    expect(scene).toMatch(/if m\.currentRoomType = "device"[\s\S]*?requestDeviceRoom\(station, "renew"\)[\s\S]*?requestGuestRoom\(m\.currentRoomSessionToken, "renew"\)/);
    expect(scene).toContain('m.roomSessionTask.url = m.apiOrigin + "/api/roku/v2/rooms/session"');
    expect(scene).toContain("if m.isPlaying and isPrivateStation() and roomGrantNeedsRenewal()");
    expect(scene).toMatch(/if state = "error" or state = "finished"[\s\S]*?if isPrivateStation\(\)[\s\S]*?roomGrantNeedsRenewal\(\)/);
    expect(scene).toContain("setRoomGrantExpiration(station.grantExpiresAt)");
  });

  it("sends scoped credentials only to trusted device APIs and never prints secrets", async () => {
    const http = await source("roku/source/http.brs");
    const scene = await source("roku/components/MainScene.brs");
    expect(http).toContain('origin + "/api/device/v1/"');
    expect(http).toContain('return url = origin + "/api/roku/v2/rooms/access"');
    expect(http).not.toContain('origin + "/api/roku/v2/rooms/session"');
    expect(http).toContain('transfer.AddHeader("Authorization", "Device " + deviceToken)');
    expect(http).toContain("not IsTrustedDeviceApiUrl(url)");
    expect(http).toContain("AsyncPostFromString(body)");
    expect(scene).toContain('queueDeviceRequest("login", m.apiOrigin + "/api/device/v1/login", body, "")');
    expect(scene).toMatch(/m\.roomAccessTask\.url = m\.apiOrigin \+ "\/api\/roku\/v2\/rooms\/access"[\s\S]*?m\.roomAccessTask\.deviceToken = m\.roomAccessActiveToken/);
    expect(scene).toMatch(/m\.roomSessionTask\.url = m\.apiOrigin \+ "\/api\/roku\/v2\/rooms\/session"[\s\S]*?m\.roomSessionTask\.deviceToken = ""/);
    expect(http).not.toMatch(/\bprint\b/i);
    expect(await source("roku/source/config.brs")).toContain("return Left(value, slash - 1)");
  });

  it("renders absolute 96px chat avatars with an initials fallback for old messages", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const itemXml = await source("roku/components/views/ChatMessageItem.xml");
    const item = await source("roku/components/views/ChatMessageItem.brs");
    expect(scene).toContain('item.AddField("avatarUrl", "string", false)');
    expect(scene).toContain("AbsoluteUrl(UrlOrigin(chatUrl), message.avatarUrl)");
    expect(itemXml).toContain('id="avatar"');
    expect(itemXml).toContain('loadWidth="96" loadHeight="96"');
    expect(item).toContain('content.HasField("avatarUrl")');
    expect(item).toContain("m.avatarInitials.visible = avatarUrl = \"\"");
  });
});
