import type { CalendarId } from "../dates/calendar";
import type { TimeOfDay, Weekday } from "../dates/dateOnly";
import type { IanaZone } from "../dates/timeZone";
import type { RepeatRule } from "./repeatRule";

// Represents a calendar event as the message describes it, before it is
// checked. The dates are still in the message's own calendar, and the year can
// be missing. The edge creates it from the model's answer: a missing title is
// already "Event", and a missing end time is already one hour after the start.
// - calendar: the calendar of all the message's dates (Gregorian when it
//   writes no date).
// - location: null when the message gives none.
// - date: null when the message writes no date, or only a relative one (e.g.
//   "tomorrow": not supported yet).
// - zone: null when the message states or suggests no time zone.
// - repeat: null for a one-off event.
export interface CalendarEventDraft {
  title: string;
  location: string | null;
  calendar: CalendarId;
  date: WrittenDate | null;
  time: EventTime;
  zone: IanaZone | null;
  repeat: RepeatRule<WrittenEndDate> | null;
  confidence: number;
}

// Represents a date as the message writes it. The year is null when the
// message leaves it out, and the weekday is null when the message does not
// write one next to the date.
export interface WrittenDate {
  year: number | null;
  month: number;
  day: number;
  weekday: Weekday | null;
}

// Represents a repeat's end date as the message writes it. The year is null
// when the message leaves it out.
export interface WrittenEndDate {
  year: number | null;
  month: number;
  day: number;
}

// Represents when the event happens during its day.
export type EventTime = { kind: "all-day" } | { kind: "timed"; start: TimeOfDay; end: TimeOfDay };
