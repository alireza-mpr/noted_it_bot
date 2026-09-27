import {
  fromGregorian,
  toGregorian,
} from "../../generic/date-time/calendar-conversion";
import type { CalendarId } from "./calendar";
import {
  addMonths,
  compareDates,
  weekdayOf,
  type DateOnly,
} from "../../generic/date-time/date-only";
import type { WrittenDate, WrittenEndDate } from "./calendar-event-draft";

// How far back last year's date may be, in months.
const RECENT_PAST_MONTHS = 2;

// Returns the year of a written date, in its calendar: the written year, or
// the year that the year rule picks. See "A missing year" in
// docs/EDGE_CASES.md.
export function pickYear(
  writtenInCalendar: CalendarId,
  writtenDate: WrittenDate,
  today: DateOnly,
): number {
  if (writtenDate.year !== null) {
    return writtenDate.year;
  }
  const currentYear = fromGregorian(writtenInCalendar, today).year;
  if (writtenDate.weekday === null) {
    return currentYear;
  }
  const recentPastStart = addMonths(today, -RECENT_PAST_MONTHS);
  const fitsWeekday = (candidateYear: number, recentPastOnly: boolean) => {
    const gregorianDate = toGregorian(writtenInCalendar, {
      year: candidateYear,
      month: writtenDate.month,
      day: writtenDate.day,
    });
    if (
      gregorianDate === null ||
      weekdayOf(gregorianDate) !== writtenDate.weekday
    ) {
      return false;
    }
    return !recentPastOnly || compareDates(gregorianDate, recentPastStart) >= 0;
  };
  if (fitsWeekday(currentYear, false)) {
    return currentYear;
  }
  if (fitsWeekday(currentYear + 1, false)) {
    return currentYear + 1;
  }
  if (fitsWeekday(currentYear - 1, true)) {
    return currentYear - 1;
  }
  return currentYear;
}

// Returns the year of a repeat's written end date, in its calendar: the
// written year, or the start date's year, or the next year if the start
// date's year puts the end before the start. See "A missing year" in
// docs/EDGE_CASES.md.
export function pickEndYear(
  writtenEndDate: WrittenEndDate,
  startDateInCalendar: DateOnly,
): number {
  if (writtenEndDate.year !== null) {
    return writtenEndDate.year;
  }
  const endsBeforeStart =
    writtenEndDate.month < startDateInCalendar.month ||
    (writtenEndDate.month === startDateInCalendar.month &&
      writtenEndDate.day < startDateInCalendar.day);
  return startDateInCalendar.year + (endsBeforeStart ? 1 : 0);
}
