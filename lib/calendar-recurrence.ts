import { Temporal } from "@js-temporal/polyfill";

export const MAX_CALENDAR_OCCURRENCES = 20_000;

export type CalendarEventKind = "PROGRAM" | "PREMIERE" | "OFFLINE";
export type CalendarRecurrenceKind = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
export type CalendarDstGapPolicy = "SKIP" | "SHIFT_FORWARD";
export type CalendarDstFoldPolicy = "EARLIER" | "LATER";

export type CalendarRecurrenceException = Readonly<{
  kind: "CANCEL" | "MOVE";
  recurrenceKey: string;
  movedLocalStartDate?: string | null;
  movedLocalStartTime?: string | null;
  movedTimeZone?: string | null;
}>;

export type CalendarEventDefinition = Readonly<{
  id: string;
  eventKind: CalendarEventKind;
  localStartDate: string;
  localStartTime: string;
  timeZone: string;
  durationMs: number;
  recurrenceKind: CalendarRecurrenceKind;
  recurrenceInterval?: number;
  recurrenceCount?: number | null;
  recurrenceUntilDate?: string | null;
  recurrenceWeekdays?: readonly number[] | null;
  recurrenceMonthDays?: readonly number[] | null;
  dstGapPolicy: CalendarDstGapPolicy;
  dstFoldPolicy: CalendarDstFoldPolicy;
  exceptions?: readonly CalendarRecurrenceException[];
}>;

export type CalendarOccurrenceHorizon = Readonly<{
  from: Date;
  to: Date;
}>;

export type CalendarOccurrence = Readonly<{
  eventId: string;
  recurrenceKey: string;
  nominalLocalStartDate: string;
  nominalLocalStartTime: string;
  startsAt: Date;
  endsAt: Date | null;
  isMoved: boolean;
}>;

export type CalendarRecurrenceOptions = Readonly<{
  maxRows?: number;
}>;

type PreparedEvent = Readonly<{
  event: CalendarEventDefinition;
  startDate: Temporal.PlainDate;
  startTime: Temporal.PlainTime;
  interval: number;
  count: number | null;
  untilDate: Temporal.PlainDate | null;
  weekdays: readonly number[];
  monthDays: readonly number[];
  exceptions: ReadonlyMap<string, CalendarRecurrenceException>;
  stopDate: Temporal.PlainDate;
}>;

function parseDate(value: string, label: string): Temporal.PlainDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO date in YYYY-MM-DD format`);
  }
  try {
    const date = Temporal.PlainDate.from(value, { overflow: "reject" });
    if (date.toString() !== value) throw new Error();
    return date;
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function parseTime(value: string, label: string): Temporal.PlainTime {
  if (typeof value !== "string" || !/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(value)) {
    throw new Error(`${label} must be an ISO local time`);
  }
  try {
    return Temporal.PlainTime.from(value, { overflow: "reject" });
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function canonicalTime(time: Temporal.PlainTime): string {
  return time.toString({ smallestUnit: "nanosecond" });
}

function validateTimeZone(timeZone: string): void {
  if (typeof timeZone !== "string" || timeZone.length === 0) throw new Error("Calendar event requires an IANA time zone");
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`);
  }
}

function validateIntegerList(
  values: readonly number[] | null | undefined,
  minimum: number,
  maximum: number,
  label: string,
): readonly number[] {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const unique = new Set<number>();
  for (const value of values) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${label} must contain integers from ${minimum} through ${maximum}`);
    }
    unique.add(value);
  }
  return [...unique].sort((left, right) => left - right);
}

function recurrenceKeyFromParts(
  eventId: string,
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
): string {
  return `${eventId}/${date.toString()}T${canonicalTime(time)}[${timeZone}]`;
}

export function calendarRecurrenceKey(
  eventId: string,
  localStartDate: string,
  localStartTime: string,
  timeZone: string,
): string {
  if (typeof eventId !== "string" || eventId.length === 0) throw new Error("Calendar event requires a nonempty id");
  validateTimeZone(timeZone);
  return recurrenceKeyFromParts(
    eventId,
    parseDate(localStartDate, "local start date"),
    parseTime(localStartTime, "local start time"),
    timeZone,
  );
}

function nominalDateFromKey(event: CalendarEventDefinition, recurrenceKey: string): Temporal.PlainDate {
  const prefix = `${event.id}/`;
  const suffix = `[${event.timeZone}]`;
  if (!recurrenceKey.startsWith(prefix) || !recurrenceKey.endsWith(suffix)) {
    throw new Error(`Exception recurrence key does not belong to calendar event ${event.id}`);
  }
  const local = recurrenceKey.slice(prefix.length, -suffix.length);
  let nominal: Temporal.PlainDateTime;
  try {
    nominal = Temporal.PlainDateTime.from(local, { overflow: "reject" });
  } catch {
    throw new Error(`Invalid exception recurrence key: ${recurrenceKey}`);
  }
  if (recurrenceKeyFromParts(event.id, nominal.toPlainDate(), nominal.toPlainTime(), event.timeZone) !== recurrenceKey) {
    throw new Error(`Non-canonical exception recurrence key: ${recurrenceKey}`);
  }
  return nominal.toPlainDate();
}

function prepareEvent(event: CalendarEventDefinition, horizon: CalendarOccurrenceHorizon): PreparedEvent {
  if (!event || typeof event.id !== "string" || event.id.length === 0) throw new Error("Calendar event requires a nonempty id");
  if (!["PROGRAM", "PREMIERE", "OFFLINE"].includes(event.eventKind)) {
    throw new Error(`Invalid calendar event kind: ${event.eventKind}`);
  }
  if (!["NONE", "DAILY", "WEEKLY", "MONTHLY"].includes(event.recurrenceKind)) {
    throw new Error(`Invalid calendar recurrence kind: ${event.recurrenceKind}`);
  }
  if (!["SKIP", "SHIFT_FORWARD"].includes(event.dstGapPolicy)) throw new Error("Invalid DST gap policy");
  if (!["EARLIER", "LATER"].includes(event.dstFoldPolicy)) throw new Error("Invalid DST fold policy");
  validateTimeZone(event.timeZone);

  const startDate = parseDate(event.localStartDate, "local start date");
  const startTime = parseTime(event.localStartTime, "local start time");
  if (!Number.isSafeInteger(event.durationMs) || event.durationMs <= 0) {
    throw new Error("Calendar event durationMs must be a positive safe integer");
  }

  const interval = event.recurrenceInterval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 366) {
    throw new Error("Calendar recurrence interval must be an integer from 1 through 366");
  }
  const count = event.recurrenceCount ?? null;
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 1_000_000)) {
    throw new Error("Calendar recurrence count must be an integer from 1 through 1000000");
  }
  const untilDate = event.recurrenceUntilDate == null
    ? null
    : parseDate(event.recurrenceUntilDate, "recurrence until date");
  if (untilDate && Temporal.PlainDate.compare(untilDate, startDate) < 0) {
    throw new Error("Calendar recurrence until date cannot precede its local start date");
  }

  const weekdays = validateIntegerList(event.recurrenceWeekdays, 1, 7, "recurrenceWeekdays");
  const monthDays = validateIntegerList(event.recurrenceMonthDays, 1, 31, "recurrenceMonthDays");
  if (event.recurrenceKind === "NONE" && (count !== null || untilDate || weekdays.length > 0 || monthDays.length > 0)) {
    throw new Error("A non-recurring calendar event cannot have recurrence limits or filters");
  }
  if (event.recurrenceKind === "WEEKLY" && weekdays.length === 0) {
    throw new Error("A weekly calendar recurrence requires at least one weekday");
  }
  if (event.recurrenceKind === "MONTHLY" && monthDays.length === 0) {
    throw new Error("A monthly calendar recurrence requires at least one month day");
  }

  const exceptions = new Map<string, CalendarRecurrenceException>();
  let stopDate = Temporal.Instant.fromEpochMilliseconds(horizon.to.getTime())
    .toZonedDateTimeISO(event.timeZone)
    .toPlainDate();
  for (const exception of event.exceptions ?? []) {
    if (!exception || !["CANCEL", "MOVE"].includes(exception.kind)) throw new Error("Invalid calendar recurrence exception kind");
    if (exceptions.has(exception.recurrenceKey)) throw new Error(`Duplicate exception recurrence key: ${exception.recurrenceKey}`);
    const nominalDate = nominalDateFromKey(event, exception.recurrenceKey);
    if (Temporal.PlainDate.compare(nominalDate, stopDate) > 0) stopDate = nominalDate;
    if (exception.kind === "CANCEL") {
      if (exception.movedLocalStartDate || exception.movedLocalStartTime || exception.movedTimeZone) {
        throw new Error("A cancellation exception cannot contain a moved start");
      }
    } else {
      if (!exception.movedLocalStartDate || !exception.movedLocalStartTime) {
        throw new Error("A move exception requires a moved local date and time");
      }
      parseDate(exception.movedLocalStartDate, "moved local start date");
      parseTime(exception.movedLocalStartTime, "moved local start time");
      if (exception.movedTimeZone) validateTimeZone(exception.movedTimeZone);
    }
    exceptions.set(exception.recurrenceKey, exception);
  }

  return { event, startDate, startTime, interval, count, untilDate, weekdays, monthDays, exceptions, stopDate };
}

function matchesFilters(date: Temporal.PlainDate, weekdays: readonly number[], monthDays: readonly number[]): boolean {
  return (weekdays.length === 0 || weekdays.includes(date.dayOfWeek))
    && (monthDays.length === 0 || monthDays.includes(date.day));
}

function* nominalDates(prepared: PreparedEvent): Generator<Temporal.PlainDate> {
  const { event, startDate, interval, weekdays, monthDays, stopDate } = prepared;
  if (event.recurrenceKind === "NONE") {
    yield startDate;
    return;
  }

  if (event.recurrenceKind === "DAILY") {
    for (let date = startDate; Temporal.PlainDate.compare(date, stopDate) <= 0; date = date.add({ days: interval })) {
      if (matchesFilters(date, weekdays, monthDays)) yield date;
    }
    return;
  }

  if (event.recurrenceKind === "WEEKLY") {
    const firstWeek = startDate.subtract({ days: startDate.dayOfWeek - 1 });
    for (let week = firstWeek; Temporal.PlainDate.compare(week, stopDate) <= 0; week = week.add({ weeks: interval })) {
      for (const weekday of weekdays) {
        const date = week.add({ days: weekday - 1 });
        if (Temporal.PlainDate.compare(date, startDate) < 0) continue;
        if (Temporal.PlainDate.compare(date, stopDate) > 0) return;
        if (matchesFilters(date, [], monthDays)) yield date;
      }
    }
    return;
  }

  const firstMonth = startDate.with({ day: 1 });
  for (let month = firstMonth; Temporal.PlainDate.compare(month, stopDate) <= 0; month = month.add({ months: interval })) {
    for (const monthDay of monthDays) {
      if (monthDay > month.daysInMonth) continue;
      const date = month.with({ day: monthDay });
      if (Temporal.PlainDate.compare(date, startDate) < 0) continue;
      if (Temporal.PlainDate.compare(date, stopDate) > 0) return;
      if (matchesFilters(date, weekdays, [])) yield date;
    }
  }
}

function resolveLocalStart(
  localStart: Temporal.PlainDateTime,
  timeZone: string,
  gapPolicy: CalendarDstGapPolicy,
  foldPolicy: CalendarDstFoldPolicy,
): Temporal.ZonedDateTime | null {
  const earlier = localStart.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  const later = localStart.toZonedDateTime(timeZone, { disambiguation: "later" });
  if (earlier.epochNanoseconds === later.epochNanoseconds) return earlier;

  const earlierMatches = earlier.toPlainDateTime().equals(localStart);
  const laterMatches = later.toPlainDateTime().equals(localStart);
  if (earlierMatches && laterMatches) return foldPolicy === "EARLIER" ? earlier : later;
  if (!earlierMatches && !laterMatches) return gapPolicy === "SKIP" ? null : later;
  return earlierMatches ? earlier : later;
}

function overlapsHorizon(startMs: number, endMs: number | null, horizon: CalendarOccurrenceHorizon): boolean {
  return startMs < horizon.to.getTime() && (endMs === null || endMs > horizon.from.getTime());
}

export function expandCalendarOccurrences(
  event: CalendarEventDefinition,
  horizon: CalendarOccurrenceHorizon,
  options: CalendarRecurrenceOptions = {},
): readonly CalendarOccurrence[] {
  if (!(horizon?.from instanceof Date) || !Number.isFinite(horizon.from.getTime())
    || !(horizon?.to instanceof Date) || !Number.isFinite(horizon.to.getTime())
    || horizon.from.getTime() >= horizon.to.getTime()) {
    throw new Error("Calendar occurrence horizon must be a nonempty [from, to) Date interval");
  }
  const maxRows = options.maxRows ?? MAX_CALENDAR_OCCURRENCES;
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > MAX_CALENDAR_OCCURRENCES) {
    throw new Error(`maxRows must be an integer from 1 through ${MAX_CALENDAR_OCCURRENCES}`);
  }

  const prepared = prepareEvent(event, horizon);
  const rows: CalendarOccurrence[] = [];
  let nominalCount = 0;
  for (const nominalDate of nominalDates(prepared)) {
    if (prepared.untilDate && Temporal.PlainDate.compare(nominalDate, prepared.untilDate) > 0) break;
    if (prepared.count !== null && nominalCount >= prepared.count) break;
    nominalCount += 1;

    const recurrenceKey = recurrenceKeyFromParts(event.id, nominalDate, prepared.startTime, event.timeZone);
    const exception = prepared.exceptions.get(recurrenceKey);
    if (exception?.kind === "CANCEL") continue;

    const effectiveDate = exception?.kind === "MOVE"
      ? parseDate(exception.movedLocalStartDate!, "moved local start date")
      : nominalDate;
    const effectiveTime = exception?.kind === "MOVE"
      ? parseTime(exception.movedLocalStartTime!, "moved local start time")
      : prepared.startTime;
    const effectiveTimeZone = exception?.kind === "MOVE" && exception.movedTimeZone
      ? exception.movedTimeZone
      : event.timeZone;
    const zonedStart = resolveLocalStart(
      effectiveDate.toPlainDateTime(effectiveTime),
      effectiveTimeZone,
      event.dstGapPolicy,
      event.dstFoldPolicy,
    );
    if (!zonedStart) continue;

    const startMs = zonedStart.epochMilliseconds;
    const endMs = zonedStart.toInstant().add({ milliseconds: event.durationMs }).epochMilliseconds;
    if (!overlapsHorizon(startMs, endMs, horizon)) continue;
    if (rows.length >= maxRows) throw new Error(`Calendar recurrence exceeds the ${maxRows} row limit`);
    rows.push(Object.freeze({
      eventId: event.id,
      recurrenceKey,
      nominalLocalStartDate: nominalDate.toString(),
      nominalLocalStartTime: canonicalTime(prepared.startTime),
      startsAt: new Date(startMs),
      endsAt: endMs === null ? null : new Date(endMs),
      isMoved: exception?.kind === "MOVE",
    }));
  }

  rows.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()
    || left.recurrenceKey.localeCompare(right.recurrenceKey));
  return Object.freeze(rows);
}
