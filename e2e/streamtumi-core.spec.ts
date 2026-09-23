import path from "node:path";
import { expect, test, type BrowserContext } from "@playwright/test";

const email = process.env.SEED_EMAIL ?? "operator@streamtumi.local";
const password = process.env.SEED_PASSWORD;
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function publicState(context: BrowserContext, viewerUrl: string) {
  const token = new URL(viewerUrl).pathname.split("/").pop();
  const response = await context.request.get(`/api/public/stations/${token}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test("uploads, transcodes, publishes, protects, streams, synchronizes, and loops", async ({ page, browser }) => {
  test.skip(!password, "Set SEED_PASSWORD for the local E2E account.");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.locator("article").filter({ hasText: "StreamTumi Test Signal" }).getByRole("link", { name: "Manage" }).click();
  await expect(page).toHaveURL(/\/stations\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "StreamTumi Test Signal" })).toBeVisible();
  await expect(page.getByLabel("Playback mode")).toHaveCount(0);
  await page.getByRole("link", { name: "Media", exact: true }).click();
  await expect(page).toHaveURL(/\/stations\/[^/]+\/media$/);

  const samples = [
    { title: "01 landscape 6s", file: "sample-media/01-landscape-6s.mp4" },
    { title: "02 portrait 9s", file: "sample-media/02-portrait-9s.webm" },
    { title: "03 widescreen 12s", file: "sample-media/03-widescreen-12s.mkv" },
  ];
  const missingSamples = [];
  for (const sample of samples) {
    const matchingCards = await page.locator(".video-card").filter({ hasText: sample.title }).count();
    if (matchingCards === 0) missingSamples.push(sample);
  }
  if (missingSamples.length) {
    await page.locator('input[type="file"][multiple]').setInputFiles(missingSamples.map((sample) => path.resolve(sample.file)));
  }
  for (const sample of samples) {
    await expect(page.locator(".video-card").filter({ hasText: sample.title }).locator(".status-ready").first(),
      `${sample.title} should finish real FFmpeg processing`).toBeVisible({ timeout: 9 * 60_000 });
  }

  await page.getByRole("link", { name: "Programming", exact: true }).click();
  await expect(page).toHaveURL(/\/stations\/[^/]+\/programming$/);
  await expect.poll(async () => page.locator(".station-rundown-row").count()).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Update Channel Now" }).click();
  await expect(page.getByText(/Channel updated/)).toBeVisible();
  const viewerUrl = await page.getByRole("link", { name: "View station" }).getAttribute("href");
  expect(viewerUrl).toMatch(new RegExp(`^${new URL(baseUrl).origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/watch/`));

  const viewerOne = await browser.newContext();
  const viewerPage = await viewerOne.newPage();
  await viewerPage.goto(viewerUrl!);
  await expect(viewerPage.getByRole("heading", { name: "StreamTumi Test Signal" })).toBeVisible();
  await expect(viewerPage.getByText(/Always running/)).toBeVisible();
  await expect(viewerPage.locator(".now-title")).not.toHaveText("");
  await expect(viewerPage.getByRole("button", { name: "Enter fullscreen" })).toBeVisible();

  const stateOne = await publicState(viewerOne, viewerUrl!);
  expect(stateOne.online).toBe(true);
  expect(stateOne.station.mode).toBe("SYNCHRONIZED");
  expect(stateOne.playlist.length).toBeGreaterThanOrEqual(3);
  const startWatching = viewerPage.getByRole("button", { name: "Start watching" });
  if (await startWatching.isVisible().catch(() => false)) await startWatching.click();
  await expect.poll(async () => {
    const state = await publicState(viewerOne, viewerUrl!);
    if (state.position.inTransition) return Number.POSITIVE_INFINITY;
    const title = await viewerPage.locator(".now-title").textContent();
    if (title !== state.playlist[state.position.index].title) return Number.POSITIVE_INFINITY;
    const currentTime = await viewerPage.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime);
    return Math.abs(currentTime - state.position.playbackOffsetMs / 1_000);
  }, { message: "the browser should join the current broadcast position", timeout: 30_000 }).toBeLessThan(3);
  const master = await viewerOne.request.get(stateOne.playlist[stateOne.position.index].hlsUrl);
  expect(master.ok()).toBe(true);
  const masterText = await master.text();
  expect(masterText).toContain("#EXTM3U");
  expect(masterText).toContain("360p/index.m3u8");
  const videoId = stateOne.playlist[stateOne.position.index].id;
  const token = new URL(viewerUrl!).pathname.split("/").pop();
  const variant = await viewerOne.request.get(`/api/public/stations/${token}/media/${videoId}/360p/index.m3u8`);
  expect(variant.ok()).toBe(true);
  const segmentName = (await variant.text()).split("\n").find((line) => line.endsWith(".ts"));
  expect(segmentName).toBeTruthy();
  const segment = await viewerOne.request.get(`/api/public/stations/${token}/media/${videoId}/360p/${segmentName}`);
  expect(segment.ok()).toBe(true);
  expect(Number(segment.headers()["content-length"])).toBeGreaterThan(0);

  await page.waitForTimeout(2_000);
  const viewerTwo = await browser.newContext();
  const viewerTwoPage = await viewerTwo.newPage();
  await viewerTwoPage.goto(viewerUrl!);
  const viewerTwoStart = viewerTwoPage.getByRole("button", { name: "Start watching" });
  if (await viewerTwoStart.isVisible().catch(() => false)) await viewerTwoStart.click();
  const stateTwo = await publicState(viewerTwo, viewerUrl!);
  expect(stateTwo.position.cycleNumber).toBeGreaterThanOrEqual(stateOne.position.cycleNumber);
  const totalDuration = stateOne.playlist.reduce((sum: number, item: { durationMs: number }) => sum + item.durationMs + stateOne.station.transitionMs, 0);
  const timelineDelta = (stateTwo.position.cycleOffsetMs - stateOne.position.cycleOffsetMs + totalDuration) % totalDuration;
  expect(timelineDelta).toBeGreaterThan(1_000);
  expect(timelineDelta).toBeLessThan(5_000);

  const initialCycle = stateTwo.position.cycleNumber;
  await expect.poll(async () => (await publicState(viewerTwo, viewerUrl!)).position.cycleNumber, {
    message: "the synchronized schedule should loop to a later cycle",
    timeout: totalDuration + 15_000,
    intervals: [1_000],
  }).toBeGreaterThan(initialCycle);
  await expect(viewerTwoPage.locator(".now-title")).not.toHaveText("");

  const unauthorizedPage = await viewerTwo.newPage();
  await unauthorizedPage.goto("/dashboard");
  await expect(unauthorizedPage).toHaveURL(/\/login$/);
  await viewerOne.close();
  await viewerTwo.close();
});
