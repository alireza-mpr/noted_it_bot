import type { DateOnly, Weekday } from "../generic/date-time/date-only";
import type { TimeOfDay } from "../generic/date-time/time-of-day";

// A date in January 2024 for each weekday. 1 Jan 2024 is a Monday.
const DATE_OF_WEEKDAY: Record<Weekday, DateOnly> = {
  MO: { year: 2024, month: 1, day: 1 },
  TU: { year: 2024, month: 1, day: 2 },
  WE: { year: 2024, month: 1, day: 3 },
  TH: { year: 2024, month: 1, day: 4 },
  FR: { year: 2024, month: 1, day: 5 },
  SA: { year: 2024, month: 1, day: 6 },
  SU: { year: 2024, month: 1, day: 7 },
};

const MIDNIGHT: TimeOfDay = { hour: 0, minute: 0 };

// Returns the date with its weekday and no year, in the language, e.g.
// "Wed, Sep 23".
export function formatShortDate(date: DateOnly, language: string): string {
  return formatGregorian(date, MIDNIGHT, language, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Returns the date with its year, in the language, e.g. "Jan 20, 2026".
export function formatDateWithYear(date: DateOnly, language: string): string {
  return formatGregorian(date, MIDNIGHT, language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Returns the time of day in the language, e.g. "8:00 PM".
export function formatClockTime(time: TimeOfDay, language: string): string {
  return formatGregorian(DATE_OF_WEEKDAY.MO, time, language, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Returns the weekday's full name in the language, e.g. "Monday".
export function formatWeekdayName(weekday: Weekday, language: string): string {
  return formatGregorian(DATE_OF_WEEKDAY[weekday], MIDNIGHT, language, {
    weekday: "long",
  });
}

function formatGregorian(
  date: DateOnly,
  time: TimeOfDay,
  language: string,
  formatOptions: Intl.DateTimeFormatOptions,
): string {
  const asIfUtc = new Date(
    Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute),
  );
  return new Intl.DateTimeFormat(language, {
    ...formatOptions,
    timeZone: "UTC",
    // Some languages use another calendar by default (e.g. "fa" uses the
    // Persian calendar), but the event's dates are Gregorian.
    calendar: "gregory",
  }).format(asIfUtc);
}
