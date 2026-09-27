import type { ExtractedEvent } from "./extractedEvent";
import { isBeforeToday, resolveTimezone, weekdayOf, zonedTimeToUtc } from "../time/timezone";
import { buildRrule, describeRecurrence, planRecurrence } from "./recurrence";
import { toGregorianEvent } from "./toGregorianEvent";

export interface BuiltCalendarEvent {
  icsFilename: string;
  icsContent: string;
  googleCalendarUrl: string;
  // The IANA zone of the event's times. null means "floating" times: no zone
  // is known, so every calendar shows the times as written, in its own zone.
  timeZone: string | null;
  // true for a one-off event whose date is before today (in its zone).
  inPast: boolean;
  // Set when the stated weekday does not match the date (for example "Monday
  // 20 Jan" in a year where 20 Jan is a Tuesday). The texts are in the reply
  // language, for the caption. Always null for repeats.
  weekdayMismatch: { stated: string; date: string; actual: string } | null;
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

// For all-day events, DTEND is exclusive (RFC 5545 §3.6.1). So a one-day
// event ends on the next day.
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

// RFC 5545 §3.3.11: in TEXT values, backslash, semicolon, comma and newline
// have a special meaning, so they must be escaped.
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const FOLD_LIMIT = 75; // octets per line (RFC 5545 §3.1)

// RFC 5545 §3.1: a line SHOULD NOT be longer than 75 octets. A longer line is
// folded: split into several lines, each new line starting with CRLF and one
// space. Strict parsers can fail on a long line that is not folded (for
// example a long title in a non-Latin script, where each character is several
// bytes in UTF-8). This folds by octet count, and never splits a character.
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
    // Move `end` back while it is in the middle of a character. (A UTF-8
    // continuation byte starts with the bits 10xxxxxx.)
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    parts.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    limit = FOLD_LIMIT - 1; // each new line needs 1 octet for its leading space
  }

  return parts.join("\r\n ");
}

// Days of January 2024, starting on Monday 1 Jan. So each weekday code maps
// to a date on that weekday.
const WEEKDAY_REFERENCE_DAY: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

// When the stated weekday does not match the date: returns the stated
// weekday, the date, and the real weekday, in the reply language. Otherwise
// null. Always uses the Gregorian calendar, like the caption's date line.
function describeWeekdayMismatch(
  stated: string | null,
  year: number,
  month: number,
  day: number,
  lang: string | undefined,
): { stated: string; date: string; actual: string } | null {
  const actual = weekdayOf(year, month, day);
  if (!stated || !actual || stated === actual || !(stated in WEEKDAY_REFERENCE_DAY)) {
    return null;
  }
  const weekdayName = new Intl.DateTimeFormat(lang || "en", { weekday: "long", timeZone: "UTC", calendar: "gregory" });
  const dateName = new Intl.DateTimeFormat(lang || "en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    calendar: "gregory",
  });
  return {
    stated: weekdayName.format(new Date(Date.UTC(2024, 0, WEEKDAY_REFERENCE_DAY[stated]))),
    date: dateName.format(new Date(Date.UTC(year, month - 1, day))),
    actual: weekdayName.format(new Date(Date.UTC(year, month - 1, day))),
  };
}

// Builds the calendar event (the .ics file, the Google link and the caption
// summary). Returns null when there is no usable date.
//
// A usable date is a full date, or (for a repeat with no start date) a weekday
// pattern that starts from today. Relative dates like "tomorrow" are not
// supported yet (see event_extract.txt).
//
// A date with no time becomes an all-day event. We never guess a time: a
// guessed time would look like a real appointment.
//
// `now` can be set, so tests can control the date.
export function buildCalendarEvent(
  extracted: ExtractedEvent,
  uid: string,
  lang?: string,
  now: Date = new Date(),
): BuiltCalendarEvent | null {
  const event = toGregorianEvent(extracted, now);
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
  // No zone from the message or the user: write "floating" times. Every
  // calendar shows them as written, in its own zone (18:00 stays 18:00). In
  // this case, timeZone (the default zone) is only used to decide "today".
  const floating = !event.timezone_hint;

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
    // toGregorianEvent has given every written date a year.
    year = event.year!;
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

    if (floating) {
      dtStartLine = `DTSTART:${startLocal}`;
      dtEndLine = `DTEND:${endLocal}`;
      // Local times with no Z and no ctz: Google uses the calendar's own zone.
      googleDates = `${startLocal}/${endLocal}`;
    } else {
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
  }

  googleParams.set("dates", googleDates);
  if (event.location) {
    googleParams.set("location", event.location);
  }

  let rrule: string | null = null;
  if (recurrence) {
    // The series ends at the end of its last day (23:59):
    // - timed events: in the event's zone, written in UTC (RFC 5545 requires it);
    // - floating times: in local time (RFC 5545 requires that too);
    // - all-day events: a plain date.
    const untilValue = until
      ? allDay
        ? formatIcsDate(until.year, until.month, until.day)
        : floating
          ? formatIcsLocal(until.year, until.month, until.day, 23, 59)
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
    // Google's web calendar uses this. Its phone app ignores it and adds only
    // one event. That is why the caption sends users to the file for repeats.
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

  // Always use the Gregorian calendar. Some locales (for example "fa") use
  // another calendar by default (Jalali). That would show a date that does not
  // match the Gregorian event we create.
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
    timeZone: floating ? null : timeZone,
    inPast: !recurrence && isBeforeToday(year, month, day, timeZone, now),
    weekdayMismatch: recurrence ? null : describeWeekdayMismatch(event.weekday ?? null, year, month, day, lang),
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
