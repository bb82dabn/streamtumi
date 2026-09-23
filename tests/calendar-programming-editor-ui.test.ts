import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Calendar Events management UI", () => {
  it("loads and replaces the complete versioned calendar draft", async () => {
    const source = await readFile(new URL("../components/calendar-programming-editor.tsx", import.meta.url), "utf8");
    expect(source).toContain("/calendar?profileId=");
    expect(source).toContain('method: "PUT"');
    expect(source).toContain("expectedDraftVersion: draftVersion");
    expect(source).toContain("events, exceptions");
    expect(source).toContain("Add event");
    expect(source).toContain("Save draft");
    expect(source).toContain("Move up");
    expect(source).toContain("Delete");
  });

  it("covers event, recurrence, source, and playout policy fields without fake source IDs", async () => {
    const source = await readFile(new URL("../components/calendar-programming-editor.tsx", import.meta.url), "utf8");
    for (const value of ["PROGRAM", "PREMIERE", "OFFLINE", "DAILY", "WEEKLY", "MONTHLY", "TV_SCHEDULE", "RADIO_CLOCK_BLOCK", "dstGapPolicy", "dstFoldPolicy", "lateJoinPolicy", "priority"]) expect(source).toContain(value);
    expect(source).toContain("Published TV schedule ID");
    expect(source).toContain("Published clock release ID");
    expect(source).toContain("Immutable release block ID");
    expect(source).toContain("never invents or substitutes IDs");
    expect(source).not.toMatch(/scheduleId:\s*["'][0-9a-f]{8}-/i);
  });

  it("previews issues and publishes then immediately activates a release", async () => {
    const source = await readFile(new URL("../components/calendar-programming-editor.tsx", import.meta.url), "utf8");
    expect(source).toContain("/calendar/preview");
    expect(source).toContain("Blocking issues");
    expect(source).toContain("Conflicts with");
    expect(source).toContain("/calendar/publish");
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain('activation: "IMMEDIATE"');
    expect(source).toContain("Activate release now");
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
  });

  it("uses an owner-only dynamic noindex page and links eligible profiles", async () => {
    const [page, panel] = await Promise.all([
      readFile(new URL("../app/stations/[id]/calendar/[profileId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/station-operating-model.tsx", import.meta.url), "utf8"),
    ]);
    expect(page).toContain('dynamic = "force-dynamic"');
    expect(page).toContain("index: false");
    expect(page).toContain("await requireUser()");
    expect(page).toContain("station.owner_id = $2");
    expect(page).toContain("profile.strategy = 'CALENDAR_EVENTS'");
    expect(page).toContain("<StationSectionNav");
    expect(page).toContain("<CalendarProgrammingEditor");
    expect(panel).toContain('profile.strategy === "CALENDAR_EVENTS"');
    expect(panel).toContain("Manage Calendar");
    expect(panel).toContain("/calendar/${profile.id}");
  });
});
