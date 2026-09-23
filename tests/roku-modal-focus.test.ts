import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function routine(scene: string, name: string) {
  return scene.match(new RegExp(`(?:sub|function) ${name}\\([^]*?end (?:sub|function)`))?.[0] ?? "";
}

describe("Roku modal focus ownership", () => {
  it("defers focus until the originating remote event has completed", async () => {
    const [scene, view] = await Promise.all([
      source("roku/components/MainScene.brs"),
      source("roku/components/MainScene.xml"),
    ]);

    expect(view).toContain('<PlayerKeyCatcher id="modalKeyCatcher" />');
    expect(view).toContain('<Timer id="modalFocusTimer" duration="0.05" repeat="false" />');
    expect(routine(scene, "showAccountMenu")).toContain("scheduleModalFocus()");
    expect(routine(scene, "showDeviceActivation")).toContain("scheduleModalFocus()");
    expect(routine(scene, "showRoomEntry")).toContain("scheduleModalFocus()");
  });

  it("routes focus to the visible account, activation, or room surface", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const focus = routine(scene, "onModalFocusTimer");
    expect(focus).toContain("updateRoomPadFocus()");
    expect(focus).toContain("m.modalKeyCatcher.setFocus(true)");
    expect(focus).toContain("m.loginKeyboard.setFocus(true)");
    expect(focus).toContain("focusAccountMenu(m.accountMenuIndex)");
    expect(routine(scene, "onModalKeyPressed")).toContain("m.roomOverlay.visible or m.activationOverlay.visible");
    expect(routine(scene, "onModalKeyPressed")).toContain("onKeyEvent(m.modalKeyCatcher.keyPressed, true)");
  });

  it("stops deferred focus before closing an overlay", async () => {
    const scene = await source("roku/components/MainScene.brs");
    expect(routine(scene, "closeAccountMenu")).toContain('m.modalFocusTimer.control = "stop"');
    expect(routine(scene, "closeDeviceActivation")).toContain('m.modalFocusTimer.control = "stop"');
    expect(routine(scene, "closeRoomEntry")).toContain('m.modalFocusTimer.control = "stop"');
  });

  it("handles room arrows, selection, and exit entirely through the modal controller", async () => {
    const scene = await source("roku/components/MainScene.brs");
    const keyHandler = routine(scene, "onKeyEvent");
    const focus = routine(scene, "updateRoomPadFocus");
    const activate = routine(scene, "activateRoomPadSelection");

    expect(keyHandler).toContain("moveRoomPad(key)");
    expect(keyHandler).toContain("activateRoomPadSelection()");
    expect(keyHandler).toContain("closeRoomEntry()");
    expect(focus).toContain("m.roomFocusRing.translation");
    expect(activate).toContain("activateRoomPadButton(m.roomPadButtons[m.roomPadIndex])");
  });
});
