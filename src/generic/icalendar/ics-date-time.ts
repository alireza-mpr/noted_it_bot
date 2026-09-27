import type { DateOnly } from "../date-time/date-only";
import type { TimeOfDay } from "../date-time/time-of-day";

// Returns the date in iCalendar DATE format, e.g. "20260923".
export function formatIcsDate(date: DateOnly): string {
  return `${date.year}${twoDigits(date.month)}${twoDigits(date.day)}`;
}

// Returns the date and time of day in iCalendar local DATE-TIME format, with
// no time zone, e.g. "20260923T200000".
export function formatIcsLocalDateTime(
  date: DateOnly,
  time: TimeOfDay,
): string {
  return `${formatIcsDate(date)}T${twoDigits(time.hour)}${twoDigits(time.minute)}00`;
}

// Returns the moment in iCalendar UTC DATE-TIME format, e.g.
// "20260923T163000Z".
export function formatIcsUtcDateTime(moment: Date): string {
  return moment
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}
