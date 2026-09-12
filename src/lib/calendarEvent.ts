import type { ExtractedEvent } from "../interfaces/extracted_event";
import { resolveTimezone, resolveYear, zonedTimeToUtc } from "./timezone";

export interface BuiltCalendarEvent {
  icsFilename: string;
  icsContent: string;
  googleCalendarUrl: string;
  allDay: boolean;
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

function formatIcsLocal(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
}

function formatIcsDate(year: number, month: number, day: number): string {
  return `${year}${pad(month)}${pad(day)}`;
}

// All-day DTEND is exclusive per RFC 5545 §3.6.1 — a one-day event's DTEND is
// the following day.
function nextDay(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline are significant
// and must be escaped in TEXT values.
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
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

// Only absolute Gregorian dates with a resolved month/day can become a
// calendar event — relative/weekday dates are deliberately left unresolved
// upstream (event_extract.txt), and non-Gregorian calendars aren't supported
// yet, so this returns null for anything else.
//
// A date without a time (start_time null) becomes an all-day event rather
// than guessing a time — a guessed time would look like a real, specific
// appointment on the calendar when none was actually given.
export function buildCalendarEvent(event: ExtractedEvent, uid: string): BuiltCalendarEvent | null {
  if (event.calendar !== "gregorian" || event.date_kind !== "absolute" || event.month === null || event.day === null) {
    return null;
  }

  const timeZone = resolveTimezone(event.timezone_hint);
  const year = resolveYear(event.year, event.month, event.day, timeZone);
  const { month, day } = event;

  const summary = escapeIcsText(event.title ?? "Event");
  const location = event.location ? escapeIcsText(event.location) : undefined;
  const dtstamp = formatIcsUtc(new Date());
  const allDay = !event.start_time;

  let dtStartLine: string;
  let dtEndLine: string;
  let googleDates: string;
  const googleParams = new URLSearchParams({ action: "TEMPLATE", text: event.title ?? "Event" });

  if (allDay) {
    const startDate = formatIcsDate(year, month, day);
    const end = nextDay(year, month, day);
    const endDate = formatIcsDate(end.year, end.month, end.day);

    dtStartLine = `DTSTART;VALUE=DATE:${startDate}`;
    dtEndLine = `DTEND;VALUE=DATE:${endDate}`;
    googleDates = `${startDate}/${endDate}`;
  } else {
    const { hour: startHour, minute: startMinute } = parseTime(event.start_time!);
    const startLocal = formatIcsLocal(year, month, day, startHour, startMinute);

    const end = event.end_time ? parseTime(event.end_time) : { hour: (startHour + 1) % 24, minute: startMinute };
    const endLocal = formatIcsLocal(year, month, day, end.hour, end.minute);

    dtStartLine = `DTSTART;TZID=${timeZone}:${startLocal}`;
    dtEndLine = `DTEND;TZID=${timeZone}:${endLocal}`;

    const startUtc = zonedTimeToUtc(year, month, day, startHour, startMinute, timeZone);
    const endUtc = zonedTimeToUtc(year, month, day, end.hour, end.minute, timeZone);
    googleDates = `${formatIcsUtc(startUtc)}/${formatIcsUtc(endUtc)}`;
    googleParams.set("ctz", timeZone);
  }

  googleParams.set("dates", googleDates);
  if (event.location) {
    googleParams.set("location", event.location);
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
    `SUMMARY:${summary}`,
    ...(location ? [`LOCATION:${location}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(foldIcsLine);

  return {
    icsFilename: "event.ics",
    icsContent: lines.join("\r\n"),
    googleCalendarUrl: `https://calendar.google.com/calendar/render?${googleParams.toString()}`,
    allDay,
  };
}
