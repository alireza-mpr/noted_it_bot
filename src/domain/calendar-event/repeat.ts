import { daysInMonth, weekdayOf, type DateOnly, type Weekday } from "../../generic/date-time/date-only";

// Represents how often a repeating event happens, and when it stops. EndDate
// is the type of the end date: written (WrittenEndDate) or Gregorian
// (DateOnly).
export interface Repeat<EndDate> {
  pattern: RepeatPattern;
  end: RepeatEnd<EndDate>;
}

// Represents the days a repeating event happens on. An empty weekday list
// means the weekday of the first date.
export type RepeatPattern =
  | { frequency: "daily"; interval: number }
  | { frequency: "weekly"; interval: number; weekdays: Weekday[] }
  | { frequency: "monthly"; interval: number; dayOfMonth: MonthlyDay }
  | { frequency: "yearly"; interval: number };

// Represents the day of the month of a monthly repeat, e.g. "the 15th" or
// "the first Friday".
export type MonthlyDay =
  | { kind: "same-as-first-date" }
  | { kind: "fixed-day"; day: number }
  | { kind: "weekday-of-month"; week: WeekOfMonth; weekdays: Weekday[] };

// Represents a week of the month.
export type WeekOfMonth = 1 | 2 | 3 | 4 | "last";

// Represents when a repeating event stops.
export type RepeatEnd<EndDate> =
  | { kind: "never" }
  | { kind: "until"; date: EndDate }
  | { kind: "after"; times: number };

// Returns true if the date is one of the pattern's days. The interval is not
// checked: the calendar app applies it.
export function matchesPattern(date: DateOnly, pattern: RepeatPattern): boolean {
  switch (pattern.frequency) {
    case "weekly":
      return (
        pattern.weekdays.length === 0 ||
        pattern.weekdays.includes(weekdayOf(date))
      );
    case "monthly":
      return matchesMonthlyDay(date, pattern.dayOfMonth);
    default:
      return true;
  }
}

// Returns true if the pattern alone says which days the event happens on.
export function patternNamesDays(pattern: RepeatPattern): boolean {
  switch (pattern.frequency) {
    case "daily":
      return true;
    case "weekly":
      return pattern.weekdays.length > 0;
    case "monthly":
      return pattern.dayOfMonth.kind !== "same-as-first-date";
    case "yearly":
      return false;
  }
}

function matchesMonthlyDay(date: DateOnly, dayOfMonth: MonthlyDay): boolean {
  switch (dayOfMonth.kind) {
    case "same-as-first-date":
      return true;
    case "fixed-day":
      return date.day === dayOfMonth.day;
    case "weekday-of-month":
      if (!dayOfMonth.weekdays.includes(weekdayOf(date))) {
        return false;
      }
      return dayOfMonth.week === "last"
        ? date.day + 7 > daysInMonth(date)
        : Math.ceil(date.day / 7) === dayOfMonth.week;
  }
}
