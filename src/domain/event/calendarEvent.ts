import type { DateOnly, Weekday } from "../dates/dateOnly";
import type { IanaZone } from "../dates/timeZone";
import type { EventTime } from "./calendarEventDraft";
import type { RepeatRule } from "./repeatRule";

// Represents a checked calendar event, ready to become a calendar file, a link
// and a caption. All dates are Gregorian and have a year.
// - date: for a repeating event, the first date.
// - location: null when the message gives none.
// - repeat: null for a one-off event.
// - wrongWeekday: the weekday the message wrote, when it does not match the
//   date (e.g. "Monday" for 20 Jan 2026, a Tuesday). null otherwise.
export interface CalendarEvent {
  title: string;
  location: string | null;
  date: DateOnly;
  time: EventTime;
  zone: EventZone;
  repeat: RepeatRule<DateOnly> | null;
  wrongWeekday: Weekday | null;
  inPast: boolean;
}

// Represents where the event's time zone comes from: the message, the user's
// /tz setting, or nowhere. With no zone, the times are "floating": each
// calendar shows them as written, in its own zone.
export type EventZone =
  | { kind: "from-message"; zone: IanaZone }
  | { kind: "from-user"; zone: IanaZone }
  | { kind: "floating" };

// Represents the result of checking a draft: a calendar event, or the reason
// why there is none. "no-event": no usable date. "repeat-declined": the repeat
// is unclear, so it is not guessed. The detail is only for the logs.
export type CheckResult =
  | { ok: true; calendarEvent: CalendarEvent }
  | { ok: false; reason: "no-event" | "repeat-declined"; detail: string };
