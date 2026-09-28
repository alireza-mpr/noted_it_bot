import type { CalendarEvent } from "../domain/calendar-event/calendar-event";
import { ianaTimeZoneOf } from "../domain/calendar-event/event-time-zone";
import { addDays } from "../generic/date-time/date-only";
import { toUtcMoment } from "../generic/date-time/time-zone";
import {
  formatIcsDate,
  formatIcsLocalDateTime,
  formatIcsUtcDateTime,
} from "../generic/icalendar/ics-date-time";
import type { SupportedLanguage } from "../domain/user/supported-language";
import { eventTitleOf } from "./event-title";
import { rruleOf } from "./rrule";

const GOOGLE_CALENDAR_RENDER_URL =
  "https://calendar.google.com/calendar/render";

// Returns the link that opens Google Calendar with the event filled in. An
// event with no title gets "Event" in the language.
export function googleCalendarLinkOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string {
  const linkParameters = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitleOf(calendarEvent, language),
  });
  const ianaTimeZone = ianaTimeZoneOf(calendarEvent.timeZone);
  if (ianaTimeZone !== null && calendarEvent.time.kind === "timed") {
    linkParameters.set("ctz", ianaTimeZone);
  }
  linkParameters.set("dates", googleDatesOf(calendarEvent));
  if (calendarEvent.location !== null) {
    linkParameters.set("location", calendarEvent.location);
  }
  const rrule = rruleOf(calendarEvent);
  if (rrule !== null) {
    // Google's web calendar uses this. Its phone app ignores it and adds only
    // one event, so the caption sends users to the file for repeats.
    linkParameters.set("recur", `RRULE:${rrule}`);
  }
  return `${GOOGLE_CALENDAR_RENDER_URL}?${linkParameters.toString()}`;
}

// Returns the "dates" value, "start/end": dates for an all-day event, local
// times for floating times, and UTC times otherwise.
function googleDatesOf(calendarEvent: CalendarEvent): string {
  const date = calendarEvent.date;
  const time = calendarEvent.time;
  if (time.kind === "all-day") {
    // The end date is not part of the event, as in the calendar file.
    return `${formatIcsDate(date)}/${formatIcsDate(addDays(date, 1))}`;
  }
  const ianaTimeZone = ianaTimeZoneOf(calendarEvent.timeZone);
  if (ianaTimeZone === null) {
    return `${formatIcsLocalDateTime(date, time.start)}/${formatIcsLocalDateTime(date, time.end)}`;
  }
  const startMoment = toUtcMoment(date, time.start, ianaTimeZone);
  const endMoment = toUtcMoment(date, time.end, ianaTimeZone);
  return `${formatIcsUtcDateTime(startMoment)}/${formatIcsUtcDateTime(endMoment)}`;
}
