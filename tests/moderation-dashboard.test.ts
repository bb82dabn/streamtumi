import { describe, expect, it } from "vitest";
import {
  filterModerationReports,
  reportAge,
  type ModerationDashboardReport,
} from "@/lib/moderation-dashboard";

const reports: ModerationDashboardReport[] = [
  {
    id: "open-message",
    reference_code: "ST-OPEN123",
    subject_type: "CHAT_MESSAGE",
    reason: "HATE_OR_HARASSMENT",
    details: "A viewer reported targeted abuse in chat.",
    subject_snapshot: {},
    status: "OPEN",
    version: 1,
    reporter_email: "viewer@example.com",
    created_at: "2026-08-15T10:00:00.000Z",
    updated_at: "2026-08-15T10:00:00.000Z",
    resolved_at: null,
  },
  {
    id: "review-station",
    reference_code: "ST-REVIEW1",
    subject_type: "STATION",
    reason: "SPAM_OR_SCAM",
    details: "The station appears to impersonate another broadcaster.",
    subject_snapshot: {},
    status: "IN_REVIEW",
    version: 2,
    reporter_email: null,
    created_at: "2026-08-15T09:00:00.000Z",
    updated_at: "2026-08-15T10:30:00.000Z",
    resolved_at: null,
  },
  {
    id: "dismissed-video",
    reference_code: "ST-CLOSED1",
    subject_type: "VIDEO",
    reason: "OTHER",
    details: "The submitted report did not identify a policy violation.",
    subject_snapshot: {},
    status: "DISMISSED",
    version: 3,
    reporter_email: "rights@example.org",
    created_at: "2026-08-14T08:00:00.000Z",
    updated_at: "2026-08-15T11:00:00.000Z",
    resolved_at: "2026-08-15T11:00:00.000Z",
  },
];

describe("moderation dashboard filters", () => {
  it("shows only unresolved reports in the default active queue", () => {
    const filtered = filterModerationReports(reports, { query: "", status: "ACTIVE", subject: "ALL" });
    expect(filtered.map((report) => report.id)).toEqual(["open-message", "review-station"]);
  });

  it("combines status, content type, and normalized text search", () => {
    expect(filterModerationReports(reports, { query: "viewer@example", status: "OPEN", subject: "CHAT_MESSAGE" }))
      .toEqual([reports[0]]);
    expect(filterModerationReports(reports, { query: "spam_or_scam", status: "ALL", subject: "STATION" }))
      .toEqual([reports[1]]);
    expect(filterModerationReports(reports, { query: "st-closed1", status: "ALL", subject: "ALL" }))
      .toEqual([reports[2]]);
  });

  it("returns an empty queue when any selected filter does not match", () => {
    expect(filterModerationReports(reports, { query: "targeted abuse", status: "OPEN", subject: "VIDEO" }))
      .toEqual([]);
  });
});

describe("moderation report age", () => {
  const now = new Date("2026-08-15T12:00:00.000Z").getTime();

  it("uses compact minute, hour, and day labels", () => {
    expect(reportAge("2026-08-15T11:59:45.000Z", now)).toBe("Just now");
    expect(reportAge("2026-08-15T11:42:00.000Z", now)).toBe("18m ago");
    expect(reportAge("2026-08-15T09:00:00.000Z", now)).toBe("3h ago");
    expect(reportAge("2026-08-12T12:00:00.000Z", now)).toBe("3d ago");
  });
});
