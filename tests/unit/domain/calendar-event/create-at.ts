import type { Weekday } from "../../../../src/generic/date-time/date-only";
import type { CalendarEvent, EventUid } from "../../../../src/domain/calendar-event/calendar-event";
import type { CalendarEventDraft, DraftDate } from "../../../../src/domain/calendar-event/calendar-event-draft";
import { createCalendarEvent, type CalendarEventResult } from "../../../../src/domain/calendar-event/create-calendar-event";
import { timeZoneNamed } from "../../../../src/generic/date-time/time-zone";

// Only eventUidOf creates a real one. The tests need no real hash.
export const TEST_EVENT_UID = "test@notedit" as EventUid;
export const MELBOURNE = timeZoneNamed("Australia/Melbourne");
export const UTC = timeZoneNamed("UTC");

// Monday 21 Sep 2026, 12:00 in Melbourne (AEST, UTC+10).
export const MON_NOON = new Date("2026-09-21T02:00:00Z");
// Sunday 27 September 2026, 12:00 in Melbourne.
export const SUN_SEP_27_2026 = new Date("2026-09-27T02:00:00Z");

// Returns the calendar event result for a draft, from a user with no time zone.
export function createAt(draft: CalendarEventDraft, now: Date): CalendarEventResult {
  return createCalendarEvent(draft, TEST_EVENT_UID, { userTimeZone: null, now, floatingTimeZone: UTC });
}

// Returns a 19:30 event in Melbourne, with no date and no repeat, by default.
export function draftWith(overrides: Partial<CalendarEventDraft> = {}): CalendarEventDraft {
  return {
    title: "Event",
    location: null,
    writtenInCalendar: "gregory",
    date: null,
    time: { kind: "timed", start: { hour: 19, minute: 30 }, end: { hour: 20, minute: 30 } },
    timeZone: MELBOURNE,
    repeat: null,
    confidence: 0.95,
    ...overrides,
  };
}

// Returns the date as the message writes it.
export function writtenDate(month: number, day: number, year: number | null = null, weekday: Weekday | null = null): DraftDate {
  return { kind: "written", writtenDate: { year, month, day, weekday } };
}

// Returns the calendar event, or fails the test if there is none.
export function calendarEventOf(calendarEventResult: CalendarEventResult): CalendarEvent {
  if (!calendarEventResult.ok) {
    throw new Error(`${calendarEventResult.reason}: ${calendarEventResult.detail}`);
  }
  return calendarEventResult.calendarEvent;
}
