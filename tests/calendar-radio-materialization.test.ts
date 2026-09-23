import { describe, expect, it } from "vitest";
import {
  compileCalendarRadioOccurrenceItems,
  type CalendarRadioOccurrencePlan,
} from "@/lib/calendar-radio-materialization";

const start = new Date("2026-01-01T12:00:00.000Z");

function plan(overrides: Partial<CalendarRadioOccurrencePlan> = {}): CalendarRadioOccurrencePlan {
  return {
    occurrenceId: "occurrence-1",
    sourceRole: "PRIMARY",
    releaseBlockId: "block-1",
    startsAt: start,
    endsAt: new Date(start.getTime() + 2_500),
    items: [
      { id: "item-b", position: 1, durationMs: 700 },
      { id: "item-a", position: 0, durationMs: 1_000 },
    ],
    ...overrides,
  };
}

describe("Calendar Radio occurrence materialization", () => {
  it("repeats items in position order and clips only the final playback row", () => {
    const rows = compileCalendarRadioOccurrenceItems(plan());

    expect(rows.map((row) => ({
      itemId: row.releaseItemId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      playbackDurationMs: row.playbackDurationMs,
    }))).toEqual([
      { itemId: "item-a", startsAt: "2026-01-01T12:00:00.000Z", endsAt: "2026-01-01T12:00:01.000Z", playbackDurationMs: 1_000 },
      { itemId: "item-b", startsAt: "2026-01-01T12:00:01.000Z", endsAt: "2026-01-01T12:00:01.700Z", playbackDurationMs: 700 },
      { itemId: "item-a", startsAt: "2026-01-01T12:00:01.700Z", endsAt: "2026-01-01T12:00:02.500Z", playbackDurationMs: 800 },
    ]);
  });

  it("keeps each repeated item at its media source offset", () => {
    const rows = compileCalendarRadioOccurrenceItems(plan());

    expect(rows.map((row) => row.sourceOffsetMs)).toEqual([0, 0, 0]);
    expect(rows.at(-1)).toMatchObject({ sourceOffsetMs: 0, playbackDurationMs: 800 });
  });

  it("anchors an event fallback independently at the occurrence start", () => {
    const rows = compileCalendarRadioOccurrenceItems(plan({
      sourceRole: "EVENT_FALLBACK",
      items: [{ id: "fallback-item", position: 0, durationMs: 5_000 }],
    }));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceRole: "EVENT_FALLBACK", position: 0, playbackDurationMs: 2_500 });
    expect(rows[0].startsAt).toEqual(start);
  });

  it("rejects empty blocks and items without a positive duration", () => {
    expect(() => compileCalendarRadioOccurrenceItems(plan({ items: [] }))).toThrow("requires at least one item");
    expect(() => compileCalendarRadioOccurrenceItems(plan({
      items: [{ id: "missing-duration", position: 0, durationMs: undefined as unknown as number }],
    }))).toThrow("requires a positive integer durationMs");
    expect(() => compileCalendarRadioOccurrenceItems(plan({
      items: [{ id: "zero-duration", position: 0, durationMs: 0 }],
    }))).toThrow("requires a positive integer durationMs");
  });

  it("caps generated occurrence rows", () => {
    expect(() => compileCalendarRadioOccurrenceItems(plan({
      endsAt: new Date(start.getTime() + 3_000),
      items: [{ id: "short-item", position: 0, durationMs: 1_000 }],
    }), { maxRows: 2 })).toThrow("exceeds the 2 row limit");
  });
});
