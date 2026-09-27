import type { Weekday } from "../dates/dateOnly";

// Represents how often a repeating event happens, and when it stops. EndDate
// is the type of the end date: as the message writes it, or checked.
export interface RepeatRule<EndDate> {
  pattern: RepeatPattern;
  end: RepeatEnd<EndDate>;
}

// Represents the days a repeating event happens on. In a weekly pattern, an
// empty weekday list means the weekday of the first date.
export type RepeatPattern =
  | { frequency: "daily"; interval: number }
  | { frequency: "weekly"; interval: number; weekdays: Weekday[] }
  | { frequency: "monthly"; interval: number; dayOfMonth: MonthlyDay }
  | { frequency: "yearly"; interval: number };

// Represents the day of the month a monthly repeat happens on: the same day as
// the first date, a fixed day ("on the 15th"), or a weekday of a week ("the
// first Friday", "the last Friday").
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
