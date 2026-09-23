import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const token = process.env.E2E_STATION_TOKEN;

async function publicState(request: APIRequestContext) {
  const response = await request.get(`/api/public/stations/${token}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function startIfRequired(page: Page): Promise<void> {
  await page.waitForTimeout(1_000);
  const start = page.getByRole("button", { name: "Start watching" });
  if (await start.isVisible()) await start.click();
}

async function driftFromBroadcast(page: Page, request: APIRequestContext): Promise<number> {
  const state = await publicState(request);
  if (!state.online || state.position.inTransition) return Number.MAX_SAFE_INTEGER;
  const video = page.locator("video");
  if (await video.count() !== 1) return Number.MAX_SAFE_INTEGER;
  const title = await page.locator(".now-title").textContent();
  if (title !== state.playlist[state.position.index].title) return Number.MAX_SAFE_INTEGER;
  const currentTime = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
  return Math.abs(currentTime - state.position.playbackOffsetMs / 1_000);
}

test("late viewers join and resume the station-wide broadcast clock", async ({ page, context, request }) => {
  test.skip(!token, "Set E2E_STATION_TOKEN to a running station token.");

  await page.goto(`/watch/${token}`);
  await expect(page.getByText(/Always running/)).toBeVisible();
  await startIfRequired(page);
  await expect.poll(() => driftFromBroadcast(page, request), {
    message: "the first viewer should tune into the live station offset",
  }).toBeLessThan(3);

  await page.getByRole("button", { name: "Pause" }).click();
  const pausedAt = await page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime);
  await page.waitForTimeout(2_000);
  const stillPausedAt = await page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime);
  expect(Math.abs(stillPausedAt - pausedAt)).toBeLessThan(0.5);
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => driftFromBroadcast(page, request), {
    message: "local resume should catch up instead of continuing stale media",
  }).toBeLessThan(3);

  await page.reload();
  await startIfRequired(page);
  await expect.poll(() => driftFromBroadcast(page, request), {
    message: "refresh should rejoin the same broadcast clock",
  }).toBeLessThan(3);

  await page.waitForTimeout(2_000);
  const lateViewer = await context.newPage();
  await lateViewer.goto(`/watch/${token}`);
  await startIfRequired(lateViewer);
  await expect.poll(() => driftFromBroadcast(lateViewer, request), {
    message: "a later viewer should join whatever is currently on air",
  }).toBeLessThan(3);
});
