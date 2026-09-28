import {
  addDays,
  weekdayOf,
  type DateOnly,
  type Weekday,
} from "../../generic/date-time/date-only";
import type { RelativeDate } from "./relative-date";

// The weekdays in the order of a week, which starts on Monday.
const WEEK_ORDER: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// Returns the date of a relative date, counted from today in the event's time
// zone. See "Relative dates" in docs/EDGE_CASES.md.
export function dateOfRelativeDate(
  relativeDate: RelativeDate,
  today: DateOnly,
): DateOnly {
  if (relativeDate.kind === "days-from-today") {
    return addDays(today, relativeDate.days);
  }
  const daysToWeekday =
    (WEEK_ORDER.indexOf(relativeDate.weekday) -
      WEEK_ORDER.indexOf(weekdayOf(today)) +
      7) %
    7;
  return relativeDate.week === "this"
    ? addDays(today, daysToWeekday)
    : addDays(startOfNextWeek(today), WEEK_ORDER.indexOf(relativeDate.weekday));
}

// Returns the Monday of the week after today's.
function startOfNextWeek(today: DateOnly): DateOnly {
  return addDays(today, 7 - WEEK_ORDER.indexOf(weekdayOf(today)));
}
