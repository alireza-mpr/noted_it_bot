import type { CalendarId } from "./calendar";
import type { Weekday } from "../../generic/date-time/date-only";
import type { IanaTimeZone } from "../../generic/date-time/time-zone";
import type { EventTime } from "./event-time";
import type { Repeat } from "./repeat";

// Represents a calendar event as the message describes it, before it becomes
// a calendar event. Its dates are in the message's calendar, and their
// years can be missing.
export interface CalendarEventDraft {
  title: string;
  location: string | null;
  writtenInCalendar: CalendarId;
  date: WrittenDate | null;
  time: EventTime;
  timeZone: IanaTimeZone | null;
  repeat: Repeat<WrittenEndDate> | null;
  confidence: number;
}

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
