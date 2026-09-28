import type { CalendarEvent, EventUid } from "../../../src/domain/calendar-event/calendar-event";
import { timeZoneNamed } from "../../../src/generic/date-time/time-zone";

// Returns a one-off event on Wednesday 23 Sep 2026, 20:00–21:00 in Melbourne,
// with the given fields changed.
export function calendarEventWith(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: "test@notedit" as EventUid,
    title: "Event",
    location: null,
    date: { year: 2026, month: 9, day: 23 },
    time: { kind: "timed", start: { hour: 20, minute: 0 }, end: { hour: 21, minute: 0 } },
    timeZone: { kind: "from-message", timeZone: timeZoneNamed("Australia/Melbourne") },
    repeat: null,
    wrongWeekday: null,
    inPast: false,
    ...overrides,
  };
}
