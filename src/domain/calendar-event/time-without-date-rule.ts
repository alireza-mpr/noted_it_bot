import { addDays, type DateOnly } from "../../generic/date-time/date-only";
import { isTimeBefore, type TimeOfDay } from "../../generic/date-time/time-of-day";
import type { LocalDateTime } from "../../generic/date-time/time-zone";

// Returns the date of an event that has a start time but no date: today, or
// tomorrow if the start time has already passed today. See "A time with no
// date" in docs/EDGE_CASES.md.
export function dateOfTimeWithoutDate(
  startTime: TimeOfDay,
  localNow: LocalDateTime,
): DateOnly {
  return isTimeBefore(startTime, localNow.time)
    ? addDays(localNow.date, 1)
    : localNow.date;
}
