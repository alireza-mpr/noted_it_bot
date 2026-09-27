import { compareDates, weekdayOf, type DateOnly, type Weekday } from "../../generic/date-time/date-only";
import type { CalendarEvent } from "./calendar-event";

// Represents the caption notes about a guess that may be wrong: 🤔 for a
// wrong weekday, 💡 for a date in the past.
export type WrongGuessNotes = Pick<CalendarEvent, "wrongWeekday" | "inPast">;

// Returns the wrong guess notes of a one-off event. See "Showing a wrong
// guess to the user" in docs/EDGE_CASES.md.
export function wrongGuessNotesOfOneOffEvent(
  writtenWeekday: Weekday | null,
  date: DateOnly,
  today: DateOnly,
): WrongGuessNotes {
  return {
    wrongWeekday:
      writtenWeekday !== null && writtenWeekday !== weekdayOf(date)
        ? writtenWeekday
        : null,
    inPast: compareDates(date, today) < 0,
  };
}

// Returns the wrong guess notes of a repeating event: none.
export function wrongGuessNotesOfRepeatingEvent(): WrongGuessNotes {
  // A repeat's weekdays come from its pattern, and its first date is never
  // in the past.
  return { wrongWeekday: null, inPast: false };
}
