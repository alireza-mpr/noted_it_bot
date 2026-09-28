import type { CalendarEvent } from "../domain/calendar-event/calendar-event";
import { ianaTimeZoneOf } from "../domain/calendar-event/event-time-zone";
import { addDays } from "../generic/date-time/date-only";
import {
  formatIcsDate,
  formatIcsLocalDateTime,
  formatIcsUtcDateTime,
} from "../generic/icalendar/ics-date-time";
import { escapeIcsText, foldIcsLine } from "../generic/icalendar/ics-text";
import type { SupportedLanguage } from "../domain/user/supported-language";
import { eventTitleOf } from "./event-title";
import { rruleOf } from "./rrule";

const CALENDAR_FILE_NAME = "event.ics";

// Represents the .ics file that the bot sends.
export interface CalendarFile {
  fileName: string;
  content: string;
}

// Returns the calendar file of the event. The file's time stamp (DTSTAMP) is
// now. An event with no title gets "Event" in the language.
export function calendarFileOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
  now: Date,
): CalendarFile {
  const rrule = rruleOf(calendarEvent);
  const location = calendarEvent.location;
  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//noted_it//EN",
    "BEGIN:VEVENT",
    `UID:${calendarEvent.uid}`,
    `DTSTAMP:${formatIcsUtcDateTime(now)}`,
    ...startAndEndLinesOf(calendarEvent),
    ...(rrule === null ? [] : [`RRULE:${rrule}`]),
    `SUMMARY:${escapeIcsText(eventTitleOf(calendarEvent, language))}`,
    ...(location === null ? [] : [`LOCATION:${escapeIcsText(location)}`]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return {
    fileName: CALENDAR_FILE_NAME,
    content: icsLines.map(foldIcsLine).join("\r\n"),
  };
}

// Returns the DTSTART and DTEND lines: dates for an all-day event, local times
// for floating times, and local times with TZID otherwise.
function startAndEndLinesOf(calendarEvent: CalendarEvent): string[] {
  const time = calendarEvent.time;
  if (time.kind === "all-day") {
    // DTEND is not part of the event (RFC 5545 §3.6.1), so a one-day event
    // ends on the next day.
    return [
      `DTSTART;VALUE=DATE:${formatIcsDate(calendarEvent.date)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(addDays(calendarEvent.date, 1))}`,
    ];
  }
  const start = formatIcsLocalDateTime(calendarEvent.date, time.start);
  const end = formatIcsLocalDateTime(calendarEvent.date, time.end);
  const ianaTimeZone = ianaTimeZoneOf(calendarEvent.timeZone);
  const timeZoneParameter =
    ianaTimeZone === null ? "" : `;TZID=${ianaTimeZone}`;
  return [
    `DTSTART${timeZoneParameter}:${start}`,
    `DTEND${timeZoneParameter}:${end}`,
  ];
}
