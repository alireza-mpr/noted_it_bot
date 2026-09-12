import type { ExtractedEvent } from "../interfaces/extracted_event";
import { resolveTimezone, resolveYear, zonedTimeToUtc } from "./timezone";

export interface BuiltCalendarEvent {
  icsFilename: string;
  icsContent: string;
  googleCalendarUrl: string;
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

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline are significant
// and must be escaped in TEXT values.
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Only absolute Gregorian dates with a resolved month/day can become a
// calendar event — relative/weekday dates are deliberately left unresolved
// upstream (event_extract.txt), and non-Gregorian calendars aren't supported
// yet, so this returns null for anything else.
export function buildCalendarEvent(event: ExtractedEvent, uid: string): BuiltCalendarEvent | null {
  if (event.calendar !== "gregorian" || event.date_kind !== "absolute" || event.month === null || event.day === null) {
    return null;
  }

  const timeZone = resolveTimezone(event.timezone_hint);
  const year = resolveYear(event.year, event.month, event.day, timeZone);
  const { month, day } = event;

  const { hour: startHour, minute: startMinute } = event.start_time ? parseTime(event.start_time) : { hour: 9, minute: 0 };
  const startLocal = formatIcsLocal(year, month, day, startHour, startMinute);

  const end = event.end_time
    ? parseTime(event.end_time)
    : { hour: (startHour + 1) % 24, minute: startMinute };
  const endLocal = formatIcsLocal(year, month, day, end.hour, end.minute);

  const summary = escapeIcsText(event.title ?? "Event");
  const location = event.location ? escapeIcsText(event.location) : undefined;
  const dtstamp = formatIcsUtc(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//noted_it//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${timeZone}:${startLocal}`,
    `DTEND;TZID=${timeZone}:${endLocal}`,
    `SUMMARY:${summary}`,
    ...(location ? [`LOCATION:${location}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const startUtc = zonedTimeToUtc(year, month, day, startHour, startMinute, timeZone);
  const endUtc = zonedTimeToUtc(year, month, day, end.hour, end.minute, timeZone);

  const googleParams = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title ?? "Event",
    dates: `${formatIcsUtc(startUtc)}/${formatIcsUtc(endUtc)}`,
    ctz: timeZone,
  });
  if (event.location) {
    googleParams.set("location", event.location);
  }

  return {
    icsFilename: "event.ics",
    icsContent: lines.join("\r\n"),
    googleCalendarUrl: `https://calendar.google.com/calendar/render?${googleParams.toString()}`,
  };
}
