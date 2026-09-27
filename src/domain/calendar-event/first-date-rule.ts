import { addDays, type DateOnly } from "../../generic/date-time/date-only";
import { isTimeBefore } from "../../generic/date-time/time-of-day";
import type { LocalDateTime } from "../../generic/date-time/time-zone";
import type { EventTime } from "./event-time";
import { matchesPattern, type RepeatPattern } from "./repeat";

// How many days to search for the first date: about two years.
const MAX_DAYS_TO_FIRST_DATE = 800;

// Returns the first date of a repeat, or null if no day matches the pattern
// within about two years. See "Repeats" in docs/EDGE_CASES.md.
export function firstDateOf(
  startDate: DateOnly | null,
  pattern: RepeatPattern,
  eventTime: EventTime,
  localNow: LocalDateTime,
): DateOnly | null {
  const fromDate = startDate ?? firstSearchDateWithoutStart(eventTime, localNow);
  for (let dayIndex = 0; dayIndex < MAX_DAYS_TO_FIRST_DATE; dayIndex++) {
    const candidateDate = addDays(fromDate, dayIndex);
    if (matchesPattern(candidateDate, pattern)) {
      return candidateDate;
    }
  }
  return null;
}

// Returns today, or tomorrow if today's event has already started.
function firstSearchDateWithoutStart(
  eventTime: EventTime,
  localNow: LocalDateTime,
): DateOnly {
  const startedToday =
    eventTime.kind === "timed" && !isTimeBefore(localNow.time, eventTime.start);
  return startedToday ? addDays(localNow.date, 1) : localNow.date;
}
