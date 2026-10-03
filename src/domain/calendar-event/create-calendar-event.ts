import {
  fromGregorian,
  toGregorian,
} from "../../generic/date-time/calendar-conversion";
import type { CalendarId } from "./calendar";
import type { DateOnly, Weekday } from "../../generic/date-time/date-only";
import {
  localDateTimeIn,
  type IanaTimeZone,
  type LocalDateTime,
} from "../../generic/date-time/time-zone";
import type { CalendarEvent, EventUid } from "./calendar-event";
import type {
  CalendarEventDraft,
  DraftDate,
  WrittenDate,
  WrittenEndDate,
} from "./calendar-event-draft";
import { firstDateOf } from "./first-date-rule";
import { dateOfRelativeDate } from "./relative-date-rule";
import type { Repeat, RepeatEnd } from "./repeat";
import { repeatWorksInCalendar } from "./repeat-calendar-rule";
import { repeatDeclineReason } from "./repeat-decline-rule";
import { dateOfTimeWithoutDate } from "./time-without-date-rule";
import { eventTimeZoneOf } from "./time-zone-order-rule";
import {
  wrongGuessNotesOfOneOffEvent,
  wrongGuessNotesOfRepeatingEvent,
} from "./wrong-guess-rule";
import { pickEndYear, pickYear } from "./year-rule";

const TIME_ZONE_NEEDED_DETAILS: Record<DateCountedFromToday, string> = {
  "relative-date": "a relative date with no time zone",
  "time-without-date": "a time with no date and no time zone",
};

// Represents the result of creating a calendar event: the calendar event,
// or the reason why there is none. The detail is for the logs.
export type CalendarEventResult =
  | { ok: true; calendarEvent: CalendarEvent }
  | {
      ok: false;
      reason: "no-event" | "repeat-declined" | "time-zone-needed";
      detail: string;
    };

// Represents what creating a calendar event needs besides the draft and its
// UID.
export interface EventCreationContext {
  userTimeZone: IanaTimeZone | null;
  now: Date;
  floatingTimeZone: IanaTimeZone;
}

// Returns the calendar event for a draft, or the reason why there is none,
// e.g. a relative date needs the user's time zone.
export function createCalendarEvent(
  draft: CalendarEventDraft,
  eventUid: EventUid,
  eventCreationContext: EventCreationContext,
): CalendarEventResult {
  const { userTimeZone, now, floatingTimeZone } = eventCreationContext;
  const eventTimeZone = eventTimeZoneOf(draft.timeZone, userTimeZone);
  const dateCountedFromToday = dateCountedFromTodayOf(draft);
  // Without a time zone, today is unknown. See "Relative dates" in
  // docs/EDGE_CASES.md.
  if (dateCountedFromToday !== null && eventTimeZone.kind === "floating") {
    return {
      ok: false,
      reason: "time-zone-needed",
      detail: TIME_ZONE_NEEDED_DETAILS[dateCountedFromToday],
    };
  }
  const localNow = localDateTimeIn(
    eventTimeZone.kind === "floating"
      ? floatingTimeZone
      : eventTimeZone.timeZone,
    now,
  );
  const eventDetails: EventDetails = {
    uid: eventUid,
    title: draft.title,
    location: draft.location,
    time: draft.time,
    timeZone: eventTimeZone,
  };
  return draft.repeat === null
    ? createOneOffEvent(draft, eventDetails, localNow)
    : createRepeatingEvent(draft, draft.repeat, eventDetails, localNow);
}

// Returns which kind of date the draft counts from today, e.g. a relative
// date for "tonight", or null for a written date or a repeat.
function dateCountedFromTodayOf(
  draft: CalendarEventDraft,
): DateCountedFromToday | null {
  if (draft.date?.kind === "relative") {
    return "relative-date";
  }
  const isOneOffTimeWithoutDate =
    draft.date === null && draft.repeat === null && draft.time.kind === "timed";
  return isOneOffTimeWithoutDate ? "time-without-date" : null;
}

function createOneOffEvent(
  draft: CalendarEventDraft,
  eventDetails: EventDetails,
  localNow: LocalDateTime,
): CalendarEventResult {
  const today = localNow.date;
  const draftDate = draft.date;
  if (draftDate === null) {
    return draft.time.kind === "timed"
      ? oneOffEventOn(
          dateOfTimeWithoutDate(draft.time.start, localNow),
          null,
          eventDetails,
          today,
        )
      : noEvent("no date");
  }
  const gregorianDate = gregorianDateOf(
    draft.writtenInCalendar,
    draftDate,
    today,
  );
  if (gregorianDate === null) {
    return noEvent("the date does not exist");
  }
  return oneOffEventOn(
    gregorianDate,
    writtenWeekdayOf(draftDate),
    eventDetails,
    today,
  );
}

function oneOffEventOn(
  date: DateOnly,
  writtenWeekday: Weekday | null,
  eventDetails: EventDetails,
  today: DateOnly,
): CalendarEventResult {
  return {
    ok: true,
    calendarEvent: {
      ...eventDetails,
      date,
      repeat: null,
      ...wrongGuessNotesOfOneOffEvent(writtenWeekday, date, today),
    },
  };
}

function createRepeatingEvent(
  draft: CalendarEventDraft,
  writtenRepeat: Repeat<WrittenEndDate>,
  eventDetails: EventDetails,
  localNow: LocalDateTime,
): CalendarEventResult {
  const pattern = writtenRepeat.pattern;
  if (!repeatWorksInCalendar(draft.writtenInCalendar, pattern)) {
    return noEvent(
      `a ${pattern.frequency} repeat in the ${draft.writtenInCalendar} calendar`,
    );
  }

  const startDate =
    draft.date === null
      ? null
      : gregorianDateOf(draft.writtenInCalendar, draft.date, localNow.date);
  if (draft.date !== null && startDate === null) {
    return noEvent("the start date does not exist");
  }
  const repeatEnd = toGregorianRepeatEnd(
    draft.writtenInCalendar,
    writtenRepeat.end,
    fromGregorian(draft.writtenInCalendar, startDate ?? localNow.date),
  );
  if (repeatEnd === null) {
    return noEvent("the end date does not exist");
  }

  const gregorianRepeat: Repeat<DateOnly> = { pattern, end: repeatEnd };
  const firstDate = firstDateOf(startDate, pattern, draft.time, localNow);
  if (firstDate === null) {
    return repeatDeclined("no day matches the pattern");
  }
  const declineReason = repeatDeclineReason(
    gregorianRepeat,
    startDate !== null,
    firstDate,
    draft.confidence,
  );
  if (declineReason !== null) {
    return repeatDeclined(declineReason);
  }

  return {
    ok: true,
    calendarEvent: {
      ...eventDetails,
      date: firstDate,
      repeat: gregorianRepeat,
      ...wrongGuessNotesOfRepeatingEvent(),
    },
  };
}

// Returns the Gregorian date of the draft's date, or null if a written date
// does not exist. A relative date is counted from today.
function gregorianDateOf(
  writtenInCalendar: CalendarId,
  draftDate: DraftDate,
  today: DateOnly,
): DateOnly | null {
  return draftDate.kind === "relative"
    ? dateOfRelativeDate(draftDate.relativeDate, today)
    : toGregorian(
        writtenInCalendar,
        dateWithYear(writtenInCalendar, draftDate.writtenDate, today),
      );
}

// Returns the weekday the message writes next to its date, e.g. "Saturday 26
// Sep", or null. A relative weekday, e.g. "next Friday", is not a written one.
function writtenWeekdayOf(draftDate: DraftDate): Weekday | null {
  return draftDate.kind === "written" ? draftDate.writtenDate.weekday : null;
}

// Returns the written date with a year, in its own calendar.
function dateWithYear(
  writtenInCalendar: CalendarId,
  writtenDate: WrittenDate,
  today: DateOnly,
): DateOnly {
  return {
    year: pickYear(writtenInCalendar, writtenDate, today),
    month: writtenDate.month,
    day: writtenDate.day,
  };
}

// Returns the repeat end with a Gregorian end date, or null if the end date
// does not exist.
function toGregorianRepeatEnd(
  writtenInCalendar: CalendarId,
  writtenEnd: RepeatEnd<WrittenEndDate>,
  startDateInCalendar: DateOnly,
): RepeatEnd<DateOnly> | null {
  if (writtenEnd.kind !== "until") {
    return writtenEnd;
  }
  const endDate = toGregorian(writtenInCalendar, {
    year: pickEndYear(writtenEnd.date, startDateInCalendar),
    month: writtenEnd.date.month,
    day: writtenEnd.date.day,
  });
  return endDate === null ? null : { kind: "until", date: endDate };
}

function noEvent(detail: string): CalendarEventResult {
  return { ok: false, reason: "no-event", detail };
}

function repeatDeclined(detail: string): CalendarEventResult {
  return { ok: false, reason: "repeat-declined", detail };
}

type EventDetails = Pick<
  CalendarEvent,
  "uid" | "title" | "location" | "time" | "timeZone"
>;

// Represents a date that is counted from today: a relative date (e.g.
// "tonight"), or a one-off event's start time with no date (e.g. "lunch at
// 1").
type DateCountedFromToday = "relative-date" | "time-without-date";
