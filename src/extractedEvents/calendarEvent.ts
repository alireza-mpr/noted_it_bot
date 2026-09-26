import type { ExtractedEvent } from "./extractedEvent";
import {
  CalendarDate,
  GregorianCalendar,
  createCalendar,
  toCalendar,
  type CalendarIdentifier,
} from "@internationalized/date";
import { resolveTimezone, resolveYear, zonedTimeToUtc } from "../time/timezone";
import { buildRrule, describeRecurrence, planRecurrence } from "./recurrence";

export interface BuiltCalendarEvent {
  icsFilename: string;
  icsContent: string;
  googleCalendarUrl: string;
  allDay: boolean;
  summaryLines: string[];
  recurrence: string | null;
}

function parseTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

function formatIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function formatIcsLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
}

function formatIcsDate(year: number, month: number, day: number): string {
  return `${year}${pad(month)}${pad(day)}`;
}

// All-day DTEND is exclusive per RFC 5545 §3.6.1 — a one-day event's DTEND is
// the following day.
function nextDay(
  year: number,
  month: number,
  day: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline are significant
// and must be escaped in TEXT values.
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const FOLD_LIMIT = 75; // octets per physical line, per RFC 5545 §3.1

// RFC 5545 §3.1: a content line SHOULD NOT exceed 75 octets; longer lines
// are folded across multiple physical lines via CRLF + a single leading
// space. A strict/non-lenient parser can misbehave on an unfolded long
// line (e.g. a long title in another script, which is multiple bytes per
// character in UTF-8) — this folds by octet count without ever splitting a
// multi-byte UTF-8 character across the boundary.
function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= FOLD_LIMIT) {
    return line;
  }

  const decoder = new TextDecoder();
  const parts: string[] = [];
  let start = 0;
  let limit = FOLD_LIMIT;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off while `end` lands mid-character (a UTF-8 continuation byte
    // has the high bits 10xxxxxx).
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    parts.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    limit = FOLD_LIMIT - 1; // continuation lines reserve 1 octet for the leading space
  }

  return parts.join("\r\n ");
}

// The names the model may use for the Persian (Solar Hijri) calendar.
const PERSIAN_CALENDAR_NAMES = ["persian", "jalali", "solar hijri"];

// Any other name only gets its casing fixed, to match the library's ids.
function calendarId(name: string): string {
  const id = name.trim().toLowerCase();
  return PERSIAN_CALENDAR_NAMES.includes(id) ? "persian" : id;
}

// The model copies a date as written and names its calendar; the conversion to
// Gregorian is left to the library.
// Returns null when the date can't be converted reliably: a calendar the
// library doesn't know, no stated year, a day that doesn't exist, or a
// monthly/yearly repeat, whose months differ between the calendars.
function toGregorian(event: ExtractedEvent): ExtractedEvent | null {
  if (event.calendar === null) {
    // No calendar means no date was written, so a weekday pattern has nothing to convert. A
    // date with no calendar can't be trusted, and guessing Gregorian would silently misplace
    // a Solar Hijri one.
    const recurrence = event.recurrence ?? null;
    const writesDate =
      event.month !== null ||
      event.day !== null ||
      recurrence?.until_month != null ||
      recurrence?.until_day != null;
    return writesDate ? null : event;
  }

  const id = calendarId(event.calendar);
  if (id === "gregorian") {
    return event;
  }

  // createCalendar falls back to Gregorian for a name it doesn't know, so check
  // it gave back the calendar that was asked for.
  const calendar = createCalendar(id as CalendarIdentifier);
  if (calendar.identifier !== id) {
    return null;
  }

  const recurrence = event.recurrence ?? null;
  if (recurrence?.frequency === "monthly" || recurrence?.frequency === "yearly") {
    return null;
  }

  const gregorianDate = (year: number, month: number, day: number) => {
    const date = new CalendarDate(calendar, year, month, day);
    // The library clamps a day that doesn't exist (30 Esfand in a common year).
    if (date.year !== year || date.month !== month || date.day !== day) {
      return null;
    }
    const { year: y, month: m, day: d } = toCalendar(date, new GregorianCalendar());
    return { year: y, month: m, day: d };
  };

  let { year, month, day } = event;
  if (month !== null && day !== null) {
    const start = year === null ? null : gregorianDate(year, month, day);
    if (!start) {
      return null;
    }
    ({ year, month, day } = start);
  }

  let untilFields = {};
  if (recurrence?.until_month != null && recurrence.until_day != null) {
    const until =
      recurrence.until_year == null
        ? null
        : gregorianDate(
            recurrence.until_year,
            recurrence.until_month,
            recurrence.until_day,
          );
    if (!until) {
      return null;
    }
    untilFields = {
      recurrence: {
        ...recurrence,
        until_year: until.year,
        until_month: until.month,
        until_day: until.day,
      },
    };
  }

  return { ...event, calendar: "gregorian", year, month, day, ...untilFields };
}

// Only events with a resolvable Gregorian date (or one in a calendar the library converts) become a calendar
// event: an absolute date, or — for a repeating event with no stated start — a
// weekday pattern whose first occurrence we work out from today. Other
// relative dates stay unresolved (event_extract.txt) and other calendars
// aren't supported, so this returns null for anything else.
//
// A date without a time (start_time null) becomes an all-day event rather
// than guessing a time — a guessed time would look like a real, specific
// appointment on the calendar when none was actually given.
//
// `now` is injectable so date arithmetic is testable.
export function buildCalendarEvent(
  extracted: ExtractedEvent,
  uid: string,
  lang?: string,
  now: Date = new Date(),
): BuiltCalendarEvent | null {
  const event = toGregorian(extracted);
  if (!event) {
    return null;
  }

  const recurrence = event.recurrence ?? null;
  const dated =
    event.date_kind === "absolute" &&
    event.month !== null &&
    event.day !== null;
  const weekdayPattern = event.date_kind === "weekday" && recurrence !== null;
  if (!dated && !weekdayPattern) {
    return null;
  }

  const timeZone = resolveTimezone(event.timezone_hint);
  if (!timeZone) {
    return null;
  }

  let year: number;
  let month: number;
  let day: number;
  let until: { year: number; month: number; day: number } | null = null;

  if (recurrence) {
    const plan = planRecurrence(event, now);
    if (!plan.ok) {
      return null;
    }
    ({ year, month, day } = plan.first);
    until = plan.until;
  } else {
    year = resolveYear(event.year, event.month!, event.day!, timeZone, now);
    month = event.month!;
    day = event.day!;
  }

  const summary = escapeIcsText(event.title ?? "Event");
  const location = event.location ? escapeIcsText(event.location) : undefined;
  const dtstamp = formatIcsUtc(now);
  const allDay = !event.start_time;

  const start = allDay ? null : parseTime(event.start_time!);
  const end = allDay
    ? null
    : event.end_time
      ? parseTime(event.end_time)
      : { hour: (start!.hour + 1) % 24, minute: start!.minute };

  let dtStartLine: string;
  let dtEndLine: string;
  let googleDates: string;
  const googleParams = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title ?? "Event",
  });

  if (allDay) {
    const startDate = formatIcsDate(year, month, day);
    const nd = nextDay(year, month, day);
    const endDate = formatIcsDate(nd.year, nd.month, nd.day);

    dtStartLine = `DTSTART;VALUE=DATE:${startDate}`;
    dtEndLine = `DTEND;VALUE=DATE:${endDate}`;
    googleDates = `${startDate}/${endDate}`;
  } else {
    const startLocal = formatIcsLocal(
      year,
      month,
      day,
      start!.hour,
      start!.minute,
    );
    const endLocal = formatIcsLocal(year, month, day, end!.hour, end!.minute);

    dtStartLine = `DTSTART;TZID=${timeZone}:${startLocal}`;
    dtEndLine = `DTEND;TZID=${timeZone}:${endLocal}`;

    const startUtc = zonedTimeToUtc(
      year,
      month,
      day,
      start!.hour,
      start!.minute,
      timeZone,
    );
    const endUtc = zonedTimeToUtc(
      year,
      month,
      day,
      end!.hour,
      end!.minute,
      timeZone,
    );
    googleDates = `${formatIcsUtc(startUtc)}/${formatIcsUtc(endUtc)}`;
    googleParams.set("ctz", timeZone);
  }

  googleParams.set("dates", googleDates);
  if (event.location) {
    googleParams.set("location", event.location);
  }

  let rrule: string | null = null;
  if (recurrence) {
    // Timed events end the series at the close of the last day in the event's
    // own timezone, expressed in UTC as RFC 5545 requires; all-day events use
    // a plain date.
    const untilValue = until
      ? allDay
        ? formatIcsDate(until.year, until.month, until.day)
        : formatIcsUtc(
            zonedTimeToUtc(
              until.year,
              until.month,
              until.day,
              23,
              59,
              timeZone,
            ),
          )
      : null;
    rrule = buildRrule(recurrence, untilValue);
    // Google's web editor honours this; its phone app ignores it (adds a
    // single event), which is why recurring events point users at the file.
    googleParams.set("recur", `RRULE:${rrule}`);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//noted_it//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    dtStartLine,
    dtEndLine,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `SUMMARY:${summary}`,
    ...(location ? [`LOCATION:${location}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(foldIcsLine);

  // Force the Gregorian calendar explicitly — some locales (e.g. "fa")
  // otherwise default to a different calendar system (Jalali), which would
  // show a date that doesn't match the actual Gregorian event being created.
  const dateLabel = new Intl.DateTimeFormat(lang || "en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    calendar: "gregory",
  }).format(new Date(Date.UTC(year, month - 1, day)));

  const formatClock = (hour: number, minute: number) =>
    new Intl.DateTimeFormat(lang || "en", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));

  const summaryLines: string[] = [];
  if (event.title) {
    summaryLines.push(`📌 ${event.title}`);
  }
  summaryLines.push(
    allDay
      ? `🗓️ ${dateLabel}`
      : `🗓️ ${dateLabel} ${formatClock(start!.hour, start!.minute)}–${formatClock(end!.hour, end!.minute)}`,
  );

  return {
    icsFilename: "event.ics",
    icsContent: lines.join("\r\n"),
    googleCalendarUrl: `https://calendar.google.com/calendar/render?${googleParams.toString()}`,
    allDay,
    summaryLines,
    recurrence: recurrence
      ? describeRecurrence(
          recurrence,
          until
            ? new Intl.DateTimeFormat("en", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
                calendar: "gregory",
              }).format(
                new Date(Date.UTC(until.year, until.month - 1, until.day)),
              )
            : null,
        )
      : null,
  };
}
