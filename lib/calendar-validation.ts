import { z } from "zod";
import { validTimeZone } from "@/lib/station-kind";

const uuid = z.string().uuid();
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Choose a valid local date.");
const localTime = z.string().regex(/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/).refine((value) => {
  const [hour, minute, second = "0"] = value.split(":");
  return Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60;
}, "Choose a valid local time.");
const timeZone = z.string().trim().min(1).max(100).refine(validTimeZone, "Choose a valid IANA time zone.");

export const calendarSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TV_SCHEDULE"), scheduleId: uuid }).strict(),
  z.object({ kind: z.literal("RADIO_CLOCK_BLOCK"), releaseId: uuid, blockId: uuid }).strict(),
  z.object({ kind: z.literal("NONE") }).strict(),
]);

export const calendarEventSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(200),
  eventKind: z.enum(["PROGRAM", "PREMIERE", "OFFLINE"]),
  source: calendarSourceSchema,
  fallbackSource: calendarSourceSchema.default({ kind: "NONE" }),
  localStartDate: localDate,
  localStartTime: localTime,
  timeZone,
  durationMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  recurrenceKind: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
  recurrenceInterval: z.number().int().min(1).max(366).default(1),
  recurrenceCount: z.number().int().min(1).max(1_000_000).nullable().default(null),
  recurrenceUntilDate: localDate.nullable().default(null),
  recurrenceWeekdays: z.array(z.number().int().min(1).max(7)).max(7).nullable().default(null),
  recurrenceMonthDays: z.array(z.number().int().min(1).max(31)).max(31).nullable().default(null),
  dstGapPolicy: z.enum(["SKIP", "SHIFT_FORWARD"]).default("SKIP"),
  dstFoldPolicy: z.enum(["EARLIER", "LATER"]).default("EARLIER"),
  priority: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  lateJoinPolicy: z.enum(["SKIP", "JOIN_IN_PROGRESS"]).default("JOIN_IN_PROGRESS"),
}).strict().superRefine((event, context) => {
  const sourceKind = event.source.kind;
  const fallbackKind = event.fallbackSource.kind;
  if (event.eventKind === "OFFLINE") {
    if (sourceKind !== "NONE") context.addIssue({ code: "custom", path: ["source"], message: "Offline events cannot have a source." });
    if (fallbackKind !== "NONE") context.addIssue({ code: "custom", path: ["fallbackSource"], message: "Offline events cannot have a fallback source." });
  } else {
    if (sourceKind === "NONE") context.addIssue({ code: "custom", path: ["source"], message: "Programs require a published TV schedule or Radio clock block." });
  }
  if (event.recurrenceKind === "NONE") {
    if (event.recurrenceCount !== null || event.recurrenceUntilDate !== null || event.recurrenceWeekdays !== null || event.recurrenceMonthDays !== null) {
      context.addIssue({ code: "custom", path: ["recurrenceKind"], message: "A one-time event cannot have recurrence limits or filters." });
    }
  }
  if (event.recurrenceKind === "WEEKLY" && !event.recurrenceWeekdays?.length) {
    context.addIssue({ code: "custom", path: ["recurrenceWeekdays"], message: "A weekly event requires at least one weekday." });
  }
  if (event.recurrenceKind === "MONTHLY" && !event.recurrenceMonthDays?.length) {
    context.addIssue({ code: "custom", path: ["recurrenceMonthDays"], message: "A monthly event requires at least one month day." });
  }
  if (event.recurrenceUntilDate !== null && event.recurrenceUntilDate < event.localStartDate) {
    context.addIssue({ code: "custom", path: ["recurrenceUntilDate"], message: "The recurrence end cannot precede the event start." });
  }
  for (const [field, values] of [["recurrenceWeekdays", event.recurrenceWeekdays], ["recurrenceMonthDays", event.recurrenceMonthDays]] as const) {
    if (values && new Set(values).size !== values.length) context.addIssue({ code: "custom", path: [field], message: "Recurrence filters cannot contain duplicates." });
  }
});

export const calendarExceptionSchema = z.object({
  id: uuid,
  eventId: uuid,
  recurrenceKey: z.string().min(1).max(500),
  kind: z.enum(["CANCEL", "MOVE"]),
  movedLocalStartDate: localDate.nullable().default(null),
  movedLocalStartTime: localTime.nullable().default(null),
  movedTimeZone: timeZone.nullable().default(null),
}).strict().superRefine((exception, context) => {
  if (exception.kind === "CANCEL" && (exception.movedLocalStartDate !== null || exception.movedLocalStartTime !== null || exception.movedTimeZone !== null)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "A cancellation cannot include a moved start." });
  }
  if (exception.kind === "MOVE" && (exception.movedLocalStartDate === null || exception.movedLocalStartTime === null)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "A move requires a local date and time." });
  }
});

export const calendarDraftReplaceSchema = z.object({
  profileId: uuid,
  expectedDraftVersion: z.number().int().min(0),
  events: z.array(calendarEventSchema).max(1_000),
  exceptions: z.array(calendarExceptionSchema).max(10_000).default([]),
}).strict().superRefine((draft, context) => {
  const eventIds = new Set<string>();
  for (const [index, event] of draft.events.entries()) {
    if (eventIds.has(event.id)) context.addIssue({ code: "custom", path: ["events", index, "id"], message: "Event IDs must be unique." });
    eventIds.add(event.id);
  }
  const exceptionIds = new Set<string>();
  const exceptionKeys = new Set<string>();
  for (const [index, exception] of draft.exceptions.entries()) {
    if (!eventIds.has(exception.eventId)) context.addIssue({ code: "custom", path: ["exceptions", index, "eventId"], message: "The exception must reference an event in this draft." });
    if (exceptionIds.has(exception.id)) context.addIssue({ code: "custom", path: ["exceptions", index, "id"], message: "Exception IDs must be unique." });
    exceptionIds.add(exception.id);
    const key = `${exception.eventId}\u0000${exception.recurrenceKey}`;
    if (exceptionKeys.has(key)) context.addIssue({ code: "custom", path: ["exceptions", index, "recurrenceKey"], message: "An event cannot have duplicate recurrence exceptions." });
    exceptionKeys.add(key);
  }
});

export const calendarPreviewSchema = z.object({
  profileId: uuid,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict();

export const calendarPublishSchema = z.object({
  profileId: uuid,
  expectedDraftVersion: z.number().int().positive(),
  idempotencyKey: uuid,
}).strict();

export const calendarActivationSchema = z.object({
  activation: z.enum(["IMMEDIATE", "NEXT_BOUNDARY"]).default("IMMEDIATE"),
}).strict();

export type CalendarSourceInput = z.infer<typeof calendarSourceSchema>;
export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
export type CalendarExceptionInput = z.infer<typeof calendarExceptionSchema>;
export type CalendarDraftReplaceInput = z.infer<typeof calendarDraftReplaceSchema>;
