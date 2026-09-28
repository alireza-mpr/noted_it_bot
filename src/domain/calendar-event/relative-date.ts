import type { Weekday } from "../../generic/date-time/date-only";

// Represents a date that a message gives relative to now: a number of days
// from today (e.g. 0 for "tonight", 1 for "tomorrow"), or a weekday in this
// week or the next one (e.g. "next Friday").
export type RelativeDate =
  | { kind: "days-from-today"; days: number }
  | { kind: "weekday"; weekday: Weekday; week: "this" | "next" };
