import {
  CalendarDate,
  GregorianCalendar,
  createCalendar,
  toCalendar,
  type CalendarIdentifier,
} from "@internationalized/date";
import type { DateOnly } from "./date-only";

const GREGORIAN_CALENDAR = new GregorianCalendar();

// Returns the Gregorian date of a date in the calendar, or null if the date
// does not exist in that calendar (e.g. 30 Esfand 1404).
export function toGregorian(
  calendar: CalendarIdentifier,
  date: DateOnly,
): DateOnly | null {
  const dateInCalendar = new CalendarDate(
    createCalendar(calendar),
    date.year,
    date.month,
    date.day,
  );
  // The library silently moves a day that does not exist, so compare the
  // result with the input.
  if (
    dateInCalendar.year !== date.year ||
    dateInCalendar.month !== date.month ||
    dateInCalendar.day !== date.day
  ) {
    return null;
  }
  const gregorianDate = toCalendar(dateInCalendar, GREGORIAN_CALENDAR);
  return {
    year: gregorianDate.year,
    month: gregorianDate.month,
    day: gregorianDate.day,
  };
}

// Returns the date in the calendar of a Gregorian date.
export function fromGregorian(
  calendar: CalendarIdentifier,
  gregorianDate: DateOnly,
): DateOnly {
  const dateInCalendar = toCalendar(
    new CalendarDate(
      gregorianDate.year,
      gregorianDate.month,
      gregorianDate.day,
    ),
    createCalendar(calendar),
  );
  return {
    year: dateInCalendar.year,
    month: dateInCalendar.month,
    day: dateInCalendar.day,
  };
}
