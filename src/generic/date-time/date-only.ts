// The weekdays, in the order that Date#getUTCDay() counts them.
const WEEKDAY_BY_INDEX: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Represents a calendar date with no time of day and no time zone. Months
// start at 1.
export interface DateOnly {
  year: number;
  month: number;
  day: number;
}

// Represents a day of the week as an iCalendar code, e.g. "MO" for Monday.
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

// Returns true if the text is a weekday code.
export function isWeekday(text: string): text is Weekday {
  return (WEEKDAY_BY_INDEX as string[]).includes(text);
}

// Returns the date, or null if it does not exist (e.g. 29 Feb 2026).
export function existingDate(
  year: number,
  month: number,
  day: number,
): DateOnly | null {
  const date = fromUtcDate(utcMidnightOf({ year, month, day }));
  return date.year === year && date.month === month && date.day === day
    ? date
    : null;
}

// Returns the date a number of days later, or earlier if the number is
// negative.
export function addDays(date: DateOnly, days: number): DateOnly {
  return fromUtcDate(utcMidnightOf({ ...date, day: date.day + days }));
}

// Returns the date a number of months later, or earlier if the number is
// negative.
export function addMonths(date: DateOnly, months: number): DateOnly {
  return fromUtcDate(utcMidnightOf({ ...date, month: date.month + months }));
}

// Returns a negative number if the first date is earlier, 0 if both are the
// same day, and a positive number if the first date is later.
export function compareDates(
  firstDate: DateOnly,
  secondDate: DateOnly,
): number {
  return utcMidnightOf(firstDate).getTime() - utcMidnightOf(secondDate).getTime();
}

// Returns the weekday of the date.
export function weekdayOf(date: DateOnly): Weekday {
  return WEEKDAY_BY_INDEX[utcMidnightOf(date).getUTCDay()];
}

// Returns the number of days in the date's month.
export function daysInMonth(date: DateOnly): number {
  return new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();
}

function utcMidnightOf(date: DateOnly): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function fromUtcDate(utcDate: Date): DateOnly {
  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  };
}
