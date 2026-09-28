import type { CalendarId } from "./calendar";
import type { Weekday } from "../../generic/date-time/date-only";
import type { IanaTimeZone } from "../../generic/date-time/time-zone";
import type { EventTime } from "./event-time";
import type { RelativeDate } from "./relative-date";
import type { Repeat } from "./repeat";

// Represents a calendar event as the message describes it, before it becomes
// a calendar event. Its dates are in the message's calendar, and their
// years can be missing. The title is null when the message gives no name.
export interface CalendarEventDraft {
  title: string | null;
  location: string | null;
  writtenInCalendar: CalendarId;
  date: DraftDate | null;
  time: EventTime;
  timeZone: IanaTimeZone | null;
  repeat: Repeat<WrittenEndDate> | null;
  confidence: number;
}

// Represents the date a message gives: one it writes (e.g. "19 Sep"), or one
// relative to now (e.g. "tomorrow").
export type DraftDate =
  | { kind: "written"; writtenDate: WrittenDate }
  | { kind: "relative"; relativeDate: RelativeDate };

// Represents a date as the message writes it.
export interface WrittenDate {
  year: number | null;
  month: number;
  day: number;
  weekday: Weekday | null;
}

// Represents a repeat's end date as the message writes it.
export interface WrittenEndDate {
  year: number | null;
  month: number;
  day: number;
}
