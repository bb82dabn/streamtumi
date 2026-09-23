import { describe, expect, it } from "vitest";
import {
  filterAdminStations,
  filterAdminUsers,
  formatAdminBytes,
  type AdminStation,
  type AdminUser,
} from "@/lib/admin-dashboard";

const userState = { status: "ACTIVE" as const, version: 1, updatedAt: "2026-08-15T10:00:00.000Z", disabledAt: null, disabledReason: null, mustChangePassword: false, deletionRequestedAt: null, anonymizeAfter: null, anonymizedAt: null };
const users: AdminUser[] = [
  { ...userState, id: "1", email: "admin@example.com", displayName: "Avery Admin", role: "ADMIN", createdAt: "2026-08-15T10:00:00.000Z", stationCount: 1, retainedSourceBytes: "1024", activeSessionCount: 1 },
  { ...userState, status: "DISABLED", disabledAt: "2026-08-15T11:00:00.000Z", disabledReason: "Review", id: "2", email: "mod@example.com", displayName: "Morgan Review", role: "MODERATOR", createdAt: "2026-08-14T10:00:00.000Z", stationCount: 0, retainedSourceBytes: "0", activeSessionCount: 0 },
  { ...userState, id: "3", email: "owner@example.com", displayName: "Casey Owner", role: "USER", createdAt: "2026-08-13T10:00:00.000Z", stationCount: 2, retainedSourceBytes: "1048576", activeSessionCount: 2 },
];

const stations: AdminStation[] = [
  { id: "running", name: "News Loop", isFeatured: true, ownerEmail: "owner@example.com", ownerDisplayName: "Casey Owner", mode: "SYNCHRONIZED", accessEnabled: true, broadcastState: "RUNNING", moderationStatus: "ACTIVE", deletedAt: null, videoCount: 3, readyCount: 3, retainedSourceBytes: "100", updatedAt: "2026-08-15T10:00:00.000Z", visibility: "PUBLIC", genreName: "News & Politics", fanCount: 12, ratingAverage: 4.5, ratingCount: 4, ownerDeclaredExplicit: false, explicitEnforced: false, genreExplicit: false, effectiveExplicit: false },
  { id: "restricted", name: "Review Channel", isFeatured: false, ownerEmail: "second@example.com", ownerDisplayName: "Riley Host", mode: "ON_DEMAND", accessEnabled: false, broadcastState: "STOPPED", moderationStatus: "RESTRICTED", deletedAt: null, videoCount: 1, readyCount: 1, retainedSourceBytes: "200", updatedAt: "2026-08-15T09:00:00.000Z", visibility: "PRIVATE", genreName: "Entertainment", fanCount: 0, ratingAverage: 0, ratingCount: 0, ownerDeclaredExplicit: true, explicitEnforced: false, genreExplicit: false, effectiveExplicit: true },
  { id: "deleted", name: "Archived Loop", isFeatured: false, ownerEmail: "owner@example.com", ownerDisplayName: "Casey Owner", mode: "ON_DEMAND", accessEnabled: false, broadcastState: "STOPPED", moderationStatus: "ACTIVE", deletedAt: "2026-08-15T08:00:00.000Z", videoCount: 0, readyCount: 0, retainedSourceBytes: "0", updatedAt: "2026-08-15T08:00:00.000Z", visibility: "PRIVATE", genreName: "Documentary", fanCount: 1, ratingAverage: 5, ratingCount: 1, ownerDeclaredExplicit: false, explicitEnforced: false, genreExplicit: false, effectiveExplicit: false },
];

describe("admin dashboard formatting and filters", () => {
  it("formats retained bytes using operationally useful units", () => {
    expect(formatAdminBytes("0")).toBe("0 B");
    expect(formatAdminBytes("1024")).toBe("1.0 KB");
    expect(formatAdminBytes(String(1024 ** 2))).toBe("1.0 MB");
    expect(formatAdminBytes(String(2 * 1024 ** 3))).toBe("2.0 GB");
  });

  it("combines user role and text search", () => {
    expect(filterAdminUsers(users, "morgan", "MODERATOR").map((user) => user.id)).toEqual(["2"]);
    expect(filterAdminUsers(users, "example.com", "USER").map((user) => user.id)).toEqual(["3"]);
    expect(filterAdminUsers(users, "missing", "ALL")).toEqual([]);
    expect(filterAdminUsers(users, "disabled", "ALL").map((user) => user.id)).toEqual(["2"]);
  });

  it("filters station inventory by operational state and owner", () => {
    expect(filterAdminStations(stations, "", "RUNNING").map((station) => station.id)).toEqual(["running"]);
    expect(filterAdminStations(stations, "", "RESTRICTED").map((station) => station.id)).toEqual(["restricted"]);
    expect(filterAdminStations(stations, "casey", "DELETED").map((station) => station.id)).toEqual(["deleted"]);
  });
});
