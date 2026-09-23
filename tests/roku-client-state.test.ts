import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function routine(scene: string, name: string) {
  return scene.match(new RegExp(`(?:sub|function) ${name}\\([^]*?end (?:sub|function)`))?.[0] ?? "";
}

describe("Roku playback request state", () => {
  it("captures ApiTask request IDs and serializes the latest station generation", async () => {
    const [scene, task, taskXml] = await Promise.all([
      source("roku/components/MainScene.brs"),
      source("roku/components/tasks/ApiTask.brs"),
      source("roku/components/tasks/ApiTask.xml"),
    ]);
    const request = routine(scene, "requestCurrentStation");
    const start = routine(scene, "startQueuedStationRequest");
    const callback = routine(scene, "onStationLoaded");
    const stateCallback = routine(scene, "onStationTaskStateChanged");

    expect(taskXml).toContain('<field id="requestId" type="integer" />');
    expect(task).toMatch(/requestId = m\.top\.requestId\s+response = RequestJson/);
    expect(task).toContain("response.requestId = requestId");
    expect(request).toContain("m.stationRequestId = m.stationRequestId + 1");
    expect(request).toContain("m.stationQueuedRequestId = m.stationDesiredRequestId");
    expect(request).toContain("m.stationQueuedUrl = stationUrl");
    expect(start).toContain("if m.stationActiveRequestId <> 0 or m.stationQueuedRequestId = 0 then return");
    expect(start).toContain('if LCase(m.stationTask.state) = "run" then return');
    expect(start).toContain("m.stationTask.requestId = m.stationActiveRequestId");
    expect(callback).toContain("response.requestId <> m.stationActiveRequestId");
    expect(callback).not.toContain("startQueuedStationRequest()");
    expect(stateCallback).toContain('state = "done" or state = "stop"');
    expect(stateCallback).toContain("startQueuedStationRequest()");
    expect(callback).toContain("response.requestId <> m.stationDesiredRequestId");
    expect(callback).toContain("stationRequestMatchesCurrent(requestUrl, requestToken)");
  });

  it("uses a separate Weather task and immutable quoted tune payloads", async () => {
    const [scene, view] = await Promise.all([
      source("roku/components/MainScene.brs"),
      source("roku/components/MainScene.xml"),
    ]);
    const beginTune = routine(scene, "beginTuneSession");
    const submitTune = routine(scene, "submitTuneSession");
    const tuneCallback = routine(scene, "onTuneSubmitted");
    const weatherStart = routine(scene, "startQueuedWeatherProvision");

    expect(view).toContain('<ApiTask id="weatherTask" />');
    expect(view).toContain('<Timer id="weatherRetryTimer" duration="2" repeat="false" />');
    expect(scene).toContain('m.weatherTask.observeField("result", "onWeatherProvisioned")');
    expect(scene).toContain('m.weatherTask.observeField("state", "onWeatherTaskStateChanged")');
    expect(beginTune).toContain("m.tuneStationToken = stationTokenFor(m.currentStation)");
    expect(submitTune).toContain('FormatJson({ "id": m.tuneSessionId, "stationToken": m.tuneStationToken })');
    expect(submitTune).not.toContain("m.currentStation.token");
    expect(tuneCallback).not.toContain("weather");
    expect(weatherStart).toContain('m.weatherTask.url = m.apiOrigin + "/api/device/v1/tunes"');
    expect(weatherStart).toContain('FormatJson({ "id": m.weatherActiveTuneId, "stationToken": m.weatherActiveStationToken })');
    expect(weatherStart).toContain('if LCase(m.weatherTask.state) = "run" then return');
  });

  it("provisions Weather while surfing and rejects stale or malformed results", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const stationCallback = routine(scene, "onStationLoaded");
    const weatherCallback = routine(scene, "onWeatherProvisioned");
    const weatherValidation = routine(scene, "weatherPlaybackIsValid");

    expect(stationCallback).toContain('data.station.playbackKind = "PERSONALIZED_WEATHER"');
    expect(stationCallback).toContain('startWeatherProvision("start")');
    expect(stationCallback).not.toContain("if m.isPlaying then return");
    expect(weatherCallback).toContain("response.requestId <> m.weatherDesiredRequestId");
    expect(weatherCallback).toContain("weatherRequestMatchesCurrent(stationToken)");
    expect(weatherCallback).toContain("m.tuningStation = false");
    expect(weatherCallback).toContain("m.enteredBySurf = wasTuning");
    expect(weatherCallback).toContain("enterPlayer()");
    expect(weatherValidation).toContain('playback.kind <> "PERSONALIZED_HLS"');
    expect(weatherValidation).toContain("playback.hlsUrl");
    expect(weatherValidation).toContain("weatherPlaybackExpiration(playback) > currentEpochSeconds()");
  });

  it("reuses failed Weather UUIDs, renews with a new UUID, and recovers media", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const provision = routine(scene, "startWeatherProvision");
    const renewal = routine(scene, "renewWeatherPlayback");
    const retryTimer = routine(scene, "onWeatherRetryTimer");
    const mediaFailure = routine(scene, "handleWeatherVideoFailure");
    const videoState = routine(scene, "onVideoStateChanged");
    const tuneTimer = routine(scene, "startTuneTimer");
    const retry = routine(scene, "onRetry");

    expect(provision).toMatch(/if tuneId = ""[^]*?GetRandomUUID\(\)/);
    expect(renewal).toContain('startWeatherProvision("renew")');
    expect(retryTimer).toContain("queueWeatherProvision(tuneId, stationToken, action)");
    expect(mediaFailure).toContain("m.weatherRetryCount < 3");
    expect(mediaFailure).toContain('startWeatherProvision("recover")');
    expect(videoState).toContain("m.weatherRetryCount = 0");
    expect(videoState).toContain("if usesPersonalizedWeather(m.stationData)");
    expect(videoState).toContain("startTuneTimer()");
    expect(tuneTimer).toContain("if usesPersonalizedWeather(m.stationData) then return");
    expect(retry).toContain("tuneId = m.weatherFailedTuneId");
    expect(retry).toContain("startWeatherProvision(action, tuneId)");
  });

  it("renews before expiry and invalidates station and Weather state on leave", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const sync = routine(scene, "onSyncTimer");
    const leave = routine(scene, "leavePlayer");
    const weatherRenewal = routine(scene, "weatherNeedsRenewal");

    expect(weatherRenewal).toContain("currentEpochSeconds() + 300 >= m.weatherExpiresAt");
    expect(sync).toContain("if weatherNeedsRenewal() then renewWeatherPlayback()");
    expect(leave).toContain("beginPlaybackChange()");
    const generation = routine(scene, "beginPlaybackChange");
    expect(generation).toContain("invalidateStationRequests()");
    expect(generation).toContain("invalidateWeatherRequests()");
    expect(leave).toContain('m.weatherRetryTimer.control = "stop"');
    expect(leave).toContain("m.currentStation = invalid");
    expect(leave).toContain("m.refreshingStation = false");
    expect(leave).toContain("m.tuningStation = false");
  });

  it("covers Weather startup and reconnects with a branded standby screen", async () => {
    const [scene, view] = await Promise.all([
      source("roku/components/MainScene.brs"),
      source("roku/components/MainScene.xml"),
    ]);
    const start = routine(scene, "startWeatherChannel");
    const videoState = routine(scene, "onVideoStateChanged");
    const failure = routine(scene, "handleWeatherVideoFailure");
    const invalidate = routine(scene, "invalidateWeatherRequests");

    expect(view).toContain('id="weatherStandby"');
    expect(view).toContain('id="weatherStandbyStatus"');
    expect(view).toContain("Preparing your local forecast");
    expect(view).toContain("Please stand by");
    expect(start).toContain('showWeatherStandby("Starting your local WeatherStar feed…")');
    expect(videoState).toContain("hideWeatherStandby()");
    expect(videoState).toContain('state = "buffering" and not m.weatherStartedPlaying');
    expect(failure).toContain('showWeatherStandby("Reconnecting to your local forecast…")');
    expect(invalidate).toContain("hideWeatherStandby()");
  });
});
