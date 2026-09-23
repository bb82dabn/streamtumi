import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireUser: vi.fn(),
  viewerCounts: vi.fn(),
  listGenres: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/presence", () => ({ viewerCounts: mocks.viewerCounts }));
vi.mock("@/lib/genres", () => ({ listGenres: mocks.listGenres }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirect: mocks.redirect,
}));
vi.mock("@/components/radio-station-control", () => ({ RadioStationControl: "radio-station-control" }));

import DashboardPage from "@/app/dashboard/page";
import RadioChangePasswordPage from "@/app/radio/account/change-password/page";
import RadioDashboardPage from "@/app/radio/dashboard/page";
import RadioLoginPage from "@/app/radio/login/page";
import RadioHome from "@/app/radio/page";
import RadioRegisterPage from "@/app/radio/register/page";
import LegacyRadioStationPage from "@/app/radio/stations/[id]/page";
import StationPage from "@/app/stations/[id]/page";
import { StationSectionPage } from "@/components/station-section-page";

describe("unified station management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "owner-1", displayName: "Owner", role: "USER" });
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.viewerCounts.mockResolvedValue({});
    mocks.listGenres.mockResolvedValue([]);
  });

  it("queries active and deleted TV and Radio stations together", async () => {
    await DashboardPage({ searchParams: Promise.resolve({ type: "radio" }) });

    expect(mocks.query).toHaveBeenCalledTimes(2);
    for (const [sql] of mocks.query.mock.calls) {
      expect(sql).not.toMatch(/station_kind\s*=\s*'TV'/);
      expect(sql).not.toMatch(/station_kind\s*=\s*'RADIO'/);
    }
    expect(mocks.viewerCounts).toHaveBeenCalledWith([]);
  });

  it("branches the canonical station route by the owned kind", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ station_kind: "RADIO" }], rowCount: 1 });
    const radio = await StationSectionPage({ id: "radio-1", ownerId: "owner-1", section: "overview" });
    expect(radio).toMatchObject({ type: "radio-station-control", props: { stationId: "radio-1", ownerId: "owner-1", section: "overview" } });

    mocks.query.mockResolvedValueOnce({ rows: [{ station_kind: "TV" }], rowCount: 1 });
    const tv = await StationSectionPage({ id: "tv-1", ownerId: "owner-1", section: "overview" });
    expect(JSON.stringify(tv)).toContain("tv-1");

    const page = await StationPage({ params: Promise.resolve({ id: "tv-1" }) });
    expect(JSON.stringify(page)).toContain("overview");
  });

  it("redirects every legacy Radio management and account route", async () => {
    RadioDashboardPage();
    await LegacyRadioStationPage({ params: Promise.resolve({ id: "station-1" }) });
    await RadioLoginPage({ searchParams: Promise.resolve({ next: "/stations/station-1" }) });
    await RadioRegisterPage({ searchParams: Promise.resolve({}) });
    RadioChangePasswordPage();
    RadioHome();

    expect(mocks.redirect.mock.calls.map(([path]) => path)).toEqual([
      "/dashboard?type=radio",
      "/stations/station-1",
      "/login?next=%2Fstations%2Fstation-1",
      "/register",
      "/account/change-password",
      "/guide?type=radio",
    ]);
  });

  it("keeps tabs, creation, cards, and Radio controls on canonical routes", async () => {
    const [dashboard, cards, create, controls] = await Promise.all([
      readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/station-dashboard.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/create-station.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/radio-station-control.tsx", import.meta.url), "utf8"),
    ]);
    expect(dashboard).toContain("selectedKind={type}");
    expect(dashboard).toContain("<CreateStation genres={genres} />");
    expect(cards).toContain('href={kind === "all" ? "/dashboard" : `/dashboard?type=${kind}`}');
    expect(cards).toContain('href={`/stations/${station.id}`}');
    expect(cards).toContain('href={`/stations/${station.id}/production`}');
    expect(cards).not.toContain("lockedKind");
    expect(create).toContain("Media format");
    expect(create).toContain("Media format controls what the station outputs—not how it is programmed");
    expect(create).toContain('router.push(`/stations/${data.id}`)');
    expect(controls).toContain("RadioTrackLibrary");
    expect(controls).toContain("RadioProgrammingEditor");
    expect(controls).not.toContain("RadioRelayControl");
    expect(controls).toContain("RadioVisualSettings");
    expect(controls).toContain("RadioStationActions");
    expect(controls).toContain("viewerCounts");
  });
});
