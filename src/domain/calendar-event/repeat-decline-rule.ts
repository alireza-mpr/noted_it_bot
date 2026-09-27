import { compareDates, type DateOnly } from "../../generic/date-time/date-only";
import { patternNamesDays, type Repeat } from "./repeat";

// Returns why the repeat is declined, or null if it is not. See "Repeats" in
// docs/EDGE_CASES.md.
export function repeatDeclineReason(
  repeat: Repeat<DateOnly>,
  hasStartDate: boolean,
  firstDate: DateOnly,
): string | null {
  const pattern = repeat.pattern;
  if (!isWholeNumberFrom(1, pattern.interval)) {
    return `invalid interval ${pattern.interval}`;
  }
  if (pattern.frequency === "monthly") {
    const dayOfMonth = pattern.dayOfMonth;
    if (
      dayOfMonth.kind === "weekday-of-month" &&
      dayOfMonth.weekdays.length === 0
    ) {
      return "a monthly weekday pattern with no weekdays";
    }
    if (
      dayOfMonth.kind === "fixed-day" &&
      !(isWholeNumberFrom(1, dayOfMonth.day) && dayOfMonth.day <= 31)
    ) {
      return `invalid day of the month ${dayOfMonth.day}`;
    }
  }
  if (repeat.end.kind === "after" && !isWholeNumberFrom(1, repeat.end.times)) {
    return `invalid number of times ${repeat.end.times}`;
  }
  if (!hasStartDate && !patternNamesDays(pattern)) {
    return "no start date, and the pattern does not say which days";
  }
  if (repeat.end.kind === "until" && compareDates(repeat.end.date, firstDate) < 0) {
    return "the end date is before the first date";
  }
  return null;
}

function isWholeNumberFrom(minimum: number, value: number): boolean {
  return Number.isInteger(value) && value >= minimum;
}
