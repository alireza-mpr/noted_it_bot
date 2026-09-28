import type { DateOnly, Weekday } from "../../generic/date-time/date-only";
import type { EventTime } from "./event-time";
import type { EventTimeZone } from "./event-time-zone";
import type { Repeat } from "./repeat";

declare const eventUidBrand: unique symbol;

// Represents a calendar event created from a draft, ready for output. Its
// dates are Gregorian, each with a year. The title is null when the message
// gives no name.
export interface CalendarEvent {
  uid: EventUid;
  title: string | null;
  location: string | null;
  date: DateOnly;
  time: EventTime;
  timeZone: EventTimeZone;
  repeat: Repeat<DateOnly> | null;
  wrongWeekday: Weekday | null;
  inPast: boolean;
}

// Represents the identity of a calendar event, e.g. "3f2a…@notedit". Only
// eventUidOf in event-uid-rule.ts creates one.
export type EventUid = string & { readonly [eventUidBrand]: true };
