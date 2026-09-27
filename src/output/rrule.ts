import type { CalendarEvent } from "../domain/calendar-event/calendar-event";
import { ianaTimeZoneOf } from "../domain/calendar-event/event-time-zone";
import type { RepeatEnd, WeekOfMonth } from "../domain/calendar-event/repeat";
import type { DateOnly } from "../generic/date-time/date-only";
import { toUtcMoment } from "../generic/date-time/time-zone";
import type { TimeOfDay } from "../generic/date-time/time-of-day";
import {
  formatIcsDate,
  formatIcsLocalDateTime,
  formatIcsUtcDateTime,
} from "../generic/icalendar/ics-date-time";

// A repeat ends at the end of its last day.
const END_OF_DAY: TimeOfDay = { hour: 23, minute: 59 };

// Returns the RRULE value of the event (without "RRULE:"), e.g.
// "FREQ=WEEKLY;BYDAY=TH", or null for a one-off event.
export function rruleOf(calendarEvent: CalendarEvent): string | null {
  const repeat = calendarEvent.repeat;
  if (repeat === null) {
    return null;
  }
  const pattern = repeat.pattern;
  const rruleParts = [`FREQ=${pattern.frequency.toUpperCase()}`];
  if (pattern.interval > 1) {
    rruleParts.push(`INTERVAL=${pattern.interval}`);
  }
  if (pattern.frequency === "weekly" && pattern.weekdays.length > 0) {
    rruleParts.push(`BYDAY=${pattern.weekdays.join(",")}`);
  }
  if (pattern.frequency === "monthly") {
    const dayOfMonth = pattern.dayOfMonth;
    if (dayOfMonth.kind === "weekday-of-month") {
      const weekNumber = rruleWeekNumberOf(dayOfMonth.week);
      rruleParts.push(
        `BYDAY=${dayOfMonth.weekdays.map((weekday) => `${weekNumber}${weekday}`).join(",")}`,
      );
    } else if (dayOfMonth.kind === "fixed-day") {
      rruleParts.push(`BYMONTHDAY=${dayOfMonth.day}`);
    }
  }
  const endPart = rruleEndPartOf(repeat.end, calendarEvent);
  if (endPart !== null) {
    rruleParts.push(endPart);
  }
  return rruleParts.join(";");
}

// Returns 1 to 4, or -1 for the last week, as RRULE writes it.
function rruleWeekNumberOf(week: WeekOfMonth): number {
  return week === "last" ? -1 : week;
}

// Returns the COUNT or UNTIL part, or null for a repeat with no end.
function rruleEndPartOf(
  repeatEnd: RepeatEnd<DateOnly>,
  calendarEvent: CalendarEvent,
): string | null {
  switch (repeatEnd.kind) {
    case "never":
      return null;
    case "after":
      return `COUNT=${repeatEnd.times}`;
    case "until":
      return `UNTIL=${untilValueOf(repeatEnd.date, calendarEvent)}`;
  }
}

// Returns the end of the last day in the format RFC 5545 asks for: a date for
// an all-day event, a local time for floating times, and UTC otherwise.
function untilValueOf(
  untilDate: DateOnly,
  calendarEvent: CalendarEvent,
): string {
  if (calendarEvent.time.kind === "all-day") {
    return formatIcsDate(untilDate);
  }
  const ianaTimeZone = ianaTimeZoneOf(calendarEvent.timeZone);
  return ianaTimeZone === null
    ? formatIcsLocalDateTime(untilDate, END_OF_DAY)
    : formatIcsUtcDateTime(toUtcMoment(untilDate, END_OF_DAY, ianaTimeZone));
}
