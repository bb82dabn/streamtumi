import { expect, test, type Page } from "@playwright/test";

const email = process.env.SEED_EMAIL ?? "operator@streamtumi.local";
const password = process.env.SEED_PASSWORD;

async function login(page: Page) {
  test.skip(!password, "Set SEED_PASSWORD for the local E2E account.");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("presence, station lifecycle, and recoverable deletion", async ({ page, browser }) => {
  await login(page);
  await page.locator("article").filter({ hasText: "StreamTumi Test Signal" }).getByRole("link", { name: "Manage" }).click();
  await expect(page).toHaveURL(/\/stations\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "StreamTumi Test Signal" })).toBeVisible();
  const stationId = new URL(page.url()).pathname.split("/").pop()!;

  const viewerUrl = await page.getByRole("link", { name: "View station" }).getAttribute("href");
  expect(viewerUrl).toBeTruthy();
  const token = new URL(viewerUrl!).pathname.split("/").pop();
  const initialState = await page.context().request.get(`/api/public/stations/${token}`);
  if (!(await initialState.json()).online) {
    const started = await page.context().request.post(`/api/stations/${stationId}/broadcast/start`, { data: { strategy: "restart" } });
    expect(started.ok(), await started.text()).toBe(true);
  }

  const viewerContext = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "2001:db8:e2e::1" } });
  const viewer = await viewerContext.newPage();
  await viewer.goto(viewerUrl!);
  await expect(viewer.getByRole("heading", { name: "StreamTumi Test Signal" }).first()).toBeVisible();
  await Promise.all([
    viewerContext.request.post(`/api/public/stations/${token}/presence`),
    page.context().request.post(`/api/public/stations/${token}/presence`),
  ]);
  await expect.poll(async () => Number((await viewer.locator(".viewer-count").first().innerText()).match(/\d+/)?.[0] ?? 0)).toBeGreaterThanOrEqual(2);

  const stop = await page.context().request.post(`/api/stations/${stationId}/broadcast/stop`);
  expect(stop.ok(), await stop.text()).toBe(true);
  const stopped = await viewerContext.request.get(`/api/public/stations/${token}`);
  expect(stopped.ok()).toBe(true);
  expect((await stopped.json()).online).toBe(false);
  await viewer.reload();
  await expect(viewer.getByText("OFF AIR").first()).toBeVisible();

  const start = await page.context().request.post(`/api/stations/${stationId}/broadcast/start`, { data: { strategy: "restart" } });
  expect(start.ok(), await start.text()).toBe(true);

  const stationName = `Deletion QA ${Date.now()}`;
  const created = await page.context().request.post("/api/stations", {
    data: { name: stationName, description: "Recoverable deletion browser test", transitionMs: 0 },
  });
  expect(created.ok()).toBe(true);
  const deletionStationId = (await created.json()).id;
  const deleted = await page.context().request.delete(`/api/stations/${deletionStationId}`);
  expect(deleted.ok(), await deleted.text()).toBe(true);
  await page.goto("/dashboard");
  const deletedCard = page.locator(".deleted-station").filter({ hasText: stationName });
  await expect(deletedCard).toBeVisible();
  const restored = await page.context().request.post(`/api/stations/${deletionStationId}/restore`);
  expect(restored.ok(), await restored.text()).toBe(true);
  await page.goto(`/stations/${deletionStationId}`);
  await expect(page.getByRole("heading", { name: stationName })).toBeVisible();

  await viewerContext.close();
});
