import type { CalendarId } from "./calendar";
import type { RepeatPattern } from "./repeat";

// Returns true if a repeat with the pattern can be written in the calendar.
// See "Repeats" in docs/EDGE_CASES.md.
export function repeatWorksInCalendar(
  writtenInCalendar: CalendarId,
  pattern: RepeatPattern,
): boolean {
  // Other calendars' months are not Gregorian months.
  return (
    writtenInCalendar === "gregory" ||
    (pattern.frequency !== "monthly" && pattern.frequency !== "yearly")
  );
}
