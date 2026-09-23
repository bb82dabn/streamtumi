import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

describe("Calendar TV playout wiring", () => {
  let playout: string;
  let journal: string;

  beforeAll(async () => {
    [playout, journal] = await Promise.all([
      readFile(new URL("../src-tv-playout.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/tv-segment-journal.ts", import.meta.url), "utf8"),
    ]);
  });

  it("keeps prepared Calendar TV stations eligible only with ready materialization", () => {
    expect(playout).toContain("profile.strategy = 'CALENDAR_EVENTS'");
    expect(playout).toContain("release.id = station.active_calendar_release_id");
    expect(playout).toContain("materialization.status = 'READY'");
    expect(playout).toContain("descriptor.profile IS DISTINCT FROM 'tv-channel-v1'");
  });

  it("resolves Calendar runtime before journal access and appends no offline automation", () => {
    const resolver = playout.indexOf("await resolveCalendarRuntime(runtime.stationId, snapshot.databaseNow)");
    const journalTail = playout.indexOf("await latestTvJournalSegment(runtime.stationId)", resolver);
    const noSource = playout.indexOf('source.kind !== "TV_SCHEDULE"', resolver);
    expect(resolver).toBeGreaterThan(-1);
    expect(noSource).toBeGreaterThan(resolver);
    expect(noSource).toBeLessThan(journalTail);
    expect(playout).toContain('source.kind !== "TV_SCHEDULE"');
  });

  it("uses resolver schedule epochs, provenance, and the next source boundary", () => {
    expect(playout).toContain("scheduleId = source.scheduleId");
    expect(playout).toContain("startedAt = source.epochAt");
    expect(playout).toContain("epochAt: source.epochAt");
    expect(playout).toContain("calendarRuntime?.nextBoundaryAt ?? undefined");
    expect(playout).toContain("appendTvJournalSegments(runtime.lease, planned, calendarContext)");
    expect(journal).toContain("calendar_release_id, occurrence_id, calendar_source_role, automation_epoch_at");
  });

});
