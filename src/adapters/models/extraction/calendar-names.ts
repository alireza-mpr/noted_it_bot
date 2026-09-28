import type { CalendarId } from "../../../domain/calendar-event/calendar";

// The names the model may give each calendar, besides its id. See "Calendars
// are data" in docs/EDGE_CASES.md.
const CALENDAR_NAMES: Record<CalendarId, readonly string[]> = {
  gregory: ["gregorian", "western", "christian"],
  // A plain "hijri" is left out on purpose: in Iran it means this calendar,
  // in Arab countries the lunar one.
  persian: ["jalali", "solar hijri", "shamsi", "iranian"],
  hebrew: ["jewish"],
  buddhist: ["thai", "thai solar"],
  indian: ["indian national", "saka"],
};

// Returns the calendar that the model names, e.g. "Solar Hijri", or null if
// the bot does not accept it. Letter case and outer spaces do not matter.
export function calendarIdNamed(calendarName: string): CalendarId | null {
  const wantedName = calendarName.trim().toLowerCase();
  const calendarIds = Object.keys(CALENDAR_NAMES) as CalendarId[];
  return (
    calendarIds.find(
      (calendarId) =>
        calendarId === wantedName ||
        CALENDAR_NAMES[calendarId].includes(wantedName),
    ) ?? null
  );
}
