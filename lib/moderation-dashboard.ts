export type ModerationReportStatus = "OPEN" | "IN_REVIEW" | "ACTIONED" | "DISMISSED";
export type ModerationSubjectType = "STATION" | "VIDEO" | "CHAT_MESSAGE";

export type ModerationDashboardReport = {
  id: string;
  reference_code: string;
  subject_type: ModerationSubjectType;
  station_id?: string | null;
  reason: string;
  details: string;
  subject_snapshot: Record<string, unknown>;
  status: ModerationReportStatus;
  version: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reporter_email: string | null;
};

export type ModerationReportFilters = {
  query: string;
  status: "ACTIVE" | "ALL" | ModerationReportStatus;
  subject: "ALL" | ModerationSubjectType;
};

export function filterModerationReports(
  reports: ModerationDashboardReport[],
  filters: ModerationReportFilters,
): ModerationDashboardReport[] {
  const query = filters.query.trim().toLocaleLowerCase();

  return reports.filter((report) => {
    const statusMatches = filters.status === "ALL"
      || (filters.status === "ACTIVE" && (report.status === "OPEN" || report.status === "IN_REVIEW"))
      || report.status === filters.status;
    const subjectMatches = filters.subject === "ALL" || report.subject_type === filters.subject;
    const queryMatches = !query || [
      report.reference_code,
      report.subject_type,
      report.reason,
      report.details,
      report.reporter_email ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(query));

    return statusMatches && subjectMatches && queryMatches;
  });
}

export function reportAge(createdAt: string, now = Date.now()): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}
