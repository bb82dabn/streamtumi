import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function routine(scene: string, name: string) {
  return scene.match(new RegExp(`(?:sub|function) ${name}\\([^]*?end (?:sub|function)`))?.[0] ?? "";
}

describe("Roku remaining reliability state", () => {
  it("serializes signature-bound catalog loads and defers anonymous retry", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const load = routine(scene, "loadCatalog");
    const start = routine(scene, "startQueuedCatalogRequest");
    const callback = routine(scene, "onCatalogLoaded");
    const state = routine(scene, "onCatalogTaskStateChanged");

    expect(load).not.toContain("if m.catalogLoading then return");
    expect(load).toContain("m.catalogQueuedUrl = url");
    expect(load).toContain("m.catalogQueuedToken = m.deviceToken");
    expect(load).toContain("m.catalogQueuedAuthGeneration = m.authGeneration");
    expect(load).toContain("m.catalogQueuedIncludeExplicit = m.includeExplicit");
    expect(start).toContain('if LCase(m.catalogTask.state) = "run" then return');
    expect(start).toContain("m.catalogTask.requestId = m.catalogActiveRequestId");
    expect(callback).toContain("response.requestId <> m.catalogDesiredRequestId");
    expect(callback).toContain("catalogRequestMatchesCurrent(requestUrl, authGeneration, requestToken, includeExplicit)");
    expect(callback).toContain("clearDeviceToken(authGeneration)");
    expect(callback).toContain("loadCatalog(silent)");
    expect(callback).not.toContain('m.catalogTask.control = "run"');
    expect(state).toContain('state = "done" or state = "stop"');
    expect(state).toContain("startQueuedCatalogRequest()");
  });

  it("binds chat requests and avatars to the captured playback identity", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const load = routine(scene, "loadChat");
    const start = routine(scene, "startQueuedChatRequest");
    const callback = routine(scene, "onChatLoaded");
    const invalidate = routine(scene, "invalidateChatRequests");

    expect(load).toContain("m.chatQueuedUrl = m.currentStation.chatUrl.ToStr()");
    expect(load).toContain("m.chatQueuedPlaybackGeneration = m.playbackGeneration");
    expect(start).toContain('if LCase(m.chatTask.state) = "run" then return');
    expect(callback).toContain("playbackGeneration <> m.playbackGeneration");
    expect(callback).toContain("stationTokenFor(m.currentStation) <> stationToken");
    expect(callback).toContain("UrlOrigin(chatUrl)");
    expect(callback).not.toContain("UrlOrigin(m.currentStation.chatUrl)");
    expect(invalidate).toContain("clearChatContent()");
  });

  it("drains room retries and saved-token sequencing only after Task completion", async () => {
    const scene = await source("roku/components/MainScene.brs");

    for (const [startName, taskName] of [
      ["startQueuedRoomAccessRequest", "roomAccessTask"],
      ["startQueuedPrivateRoomRequest", "privateRoomTask"],
      ["startQueuedRoomSessionRequest", "roomSessionTask"],
    ]) {
      expect(routine(scene, startName)).toContain(`if LCase(m.${taskName}.state) = "run" then return`);
    }
    expect(routine(scene, "onRoomAccessCompleted")).toContain('queueRoomAccessRequest(requestBody, "", m.authGeneration)');
    expect(routine(scene, "onRoomAccessCompleted")).not.toContain('m.roomAccessTask.control = "run"');
    expect(routine(scene, "onPrivateRoomCompleted")).toContain("playbackGeneration <> m.playbackGeneration");
    expect(routine(scene, "onRoomSessionCompleted")).toContain("playbackGeneration <> m.playbackGeneration");
    expect(routine(scene, "resolveNextSavedRoom")).toContain('LCase(m.savedRoomTask.state) = "run"');
    expect(routine(scene, "onSavedRoomCompleted")).toContain("m.savedRoomAdvancePending = true");
    expect(routine(scene, "onSavedRoomCompleted")).not.toContain("resolveNextSavedRoom()");
    expect(routine(scene, "onSavedRoomTaskStateChanged")).toContain("resolveNextSavedRoom()");
  });

  it("uses immutable device actions, generation-safe auth, and bounded polling", async () => {
    const [scene, config] = await Promise.all([
      source("roku/components/MainScene.brs"),
      source("roku/source/config.brs"),
    ]);
    const callback = routine(scene, "onDeviceTaskCompleted");
    const close = routine(scene, "closeDeviceActivation");

    expect(routine(scene, "queueDeviceRequest")).toContain("m.deviceQueuedAuthGeneration = m.authGeneration");
    expect(routine(scene, "startQueuedDeviceRequest")).toContain("m.deviceActiveAction = m.deviceQueuedAction");
    expect(callback).toContain("action = m.deviceActiveAction");
    expect(callback).toContain("deviceGeneration <> m.deviceGeneration or authGeneration <> m.authGeneration");
    expect(callback).toContain('response.errorCode = "expired_token"');
    expect(callback).toContain("m.devicePollRetryCount < 5");
    expect(callback).toContain("response.status = 429");
    expect(close).toContain('m.devicePollTimer.control = "stop"');
    expect(close).toContain("m.deviceGeneration = m.deviceGeneration + 1");
    expect(close).toContain('m.deviceTask.control = "stop"');
    expect(routine(scene, "setDeviceToken")).toContain("m.authGeneration = m.authGeneration + 1");
    expect(config).toContain("if Len(token) <> 43 then return false");
    expect(config).toContain("if IsDeviceToken(token) then return token");
    expect(config).toContain('DeleteSetting("deviceToken")');
  });

  it("blocks background station selection and focuses the private-room action when empty", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const selected = routine(scene, "onStationSelected");
    const catalog = routine(scene, "onCatalogLoaded");

    expect(selected).toContain("not m.browseGroup.visible or not m.rows.hasFocus() or m.isPlaying");
    expect(selected).toContain("m.loadingOverlay.visible or m.errorOverlay.visible or m.accountOverlay.visible or m.activationOverlay.visible or m.roomOverlay.visible");
    expect(catalog).toContain("focusFilter(0)");
  });

  it("bounds media recovery and generation-checks media and transition timers", async () => {
    const [scene, view] = await Promise.all([
      source("roku/components/MainScene.brs"),
      source("roku/components/MainScene.xml"),
    ]);
    const schedule = routine(scene, "scheduleMediaRecovery");
    const mediaTimer = routine(scene, "onMediaRetryTimer");
    const transition = routine(scene, "onTransitionTimer");
    const radio = routine(scene, "onRadioVisualTimeout");
    const video = routine(scene, "onVideoStateChanged");
    const audio = routine(scene, "onAudioStateChanged");

    expect(view).toContain('<Timer id="mediaRetryTimer" duration="2" repeat="false" />');
    expect(schedule).toContain("m.mediaRetryCount >= 4");
    expect(schedule).toContain("mediaRetryDelay(m.mediaRetryCount)");
    expect(mediaTimer).toContain("playbackContextMatches(playbackGeneration, stationToken)");
    expect(transition).toContain("playbackContextMatches(m.transitionPlaybackGeneration, m.transitionStationToken)");
    expect(radio).toContain("playbackContextMatches(m.radioFallbackPlaybackGeneration, m.radioFallbackStationToken)");
    expect(video).toContain('scheduleMediaRecovery("channel")');
    expect(video).toContain('scheduleMediaRecovery("legacy")');
    expect(audio).toContain('scheduleMediaRecovery("radio")');
    expect(routine(scene, "failMediaRecovery")).toContain("m.video.disableScreenSaver = false");
    expect(routine(scene, "failMediaRecovery")).toContain("Select Try again to reconnect");
  });

  it("stops mutable timers before changing duration", async () => {
    const scene = await source("roku/components/MainScene.brs");
    for (const [routineName, timerName] of [
      ["scheduleDevicePoll", "devicePollTimer"],
      ["scheduleWeatherProvisionRetry", "weatherRetryTimer"],
      ["handleWeatherVideoFailure", "weatherRetryTimer"],
      ["showTransition", "transitionTimer"],
      ["scheduleMediaRecovery", "mediaRetryTimer"],
    ]) {
      const body = routine(scene, routineName);
      expect(body.indexOf(`m.${timerName}.control = "stop"`)).toBeGreaterThanOrEqual(0);
      expect(body.indexOf(`m.${timerName}.control = "stop"`)).toBeLessThan(body.indexOf(`m.${timerName}.duration =`));
    }
  });
});
