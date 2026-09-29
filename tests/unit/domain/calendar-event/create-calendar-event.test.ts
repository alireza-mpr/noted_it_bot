import { describe, expect, it } from "vitest";
import type { Weekday } from "../../../../src/generic/date-time/date-only";
import type { CalendarEvent, EventUid } from "../../../../src/domain/calendar-event/calendar-event";
import type {
  CalendarEventDraft,
  DraftDate,
  WrittenEndDate,
} from "../../../../src/domain/calendar-event/calendar-event-draft";
import { createCalendarEvent, type CalendarEventResult } from "../../../../src/domain/calendar-event/create-calendar-event";
import type { RelativeDate } from "../../../../src/domain/calendar-event/relative-date";
import type { Repeat } from "../../../../src/domain/calendar-event/repeat";
import { timeZoneNamed } from "../../../../src/generic/date-time/time-zone";

// Only eventUidOf creates a real one. The tests need no real hash.
const TEST_EVENT_UID = "test@notedit" as EventUid;
const MELBOURNE = timeZoneNamed("Australia/Melbourne");
const UTC = timeZoneNamed("UTC");

// Monday 21 Sep 2026, 12:00 in Melbourne (AEST, UTC+10).
const MON_NOON = new Date("2026-09-21T02:00:00Z");
// Thursday 24 Sep 2026, 17:00 and 20:00 in Melbourne.
const THU_5PM = new Date("2026-09-24T07:00:00Z");
const THU_8PM = new Date("2026-09-24T10:00:00Z");
// Sunday 27 September 2026, 12:00 in Melbourne.
const SUN_SEP_27_2026 = new Date("2026-09-27T02:00:00Z");
// 20 January is a Monday in 2025, a Tuesday in 2026 and a Wednesday in 2027.
const DEC_15_2026 = new Date("2026-12-15T02:00:00Z");
const FEB_1_2026 = new Date("2026-02-01T02:00:00Z");

const WEEKLY_ON_THURSDAY: Repeat<WrittenEndDate> = {
  pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] },
  end: { kind: "never" },
};

// A 19:30 event in Melbourne, with no date and no repeat, by default.
function draftWith(overrides: Partial<CalendarEventDraft> = {}): CalendarEventDraft {
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
function writtenDate(month: number, day: number, year: number | null = null, weekday: Weekday | null = null): DraftDate {
  return { kind: "written", writtenDate: { year, month, day, weekday } };
}

// Returns a date relative to now, e.g. relativeDate({ kind: "days-from-today", days: 1 }) for "tomorrow".
function relativeDate(relativeDate: RelativeDate): DraftDate {
  return { kind: "relative", relativeDate };
}

function createAt(draft: CalendarEventDraft, now: Date): CalendarEventResult {
  return createCalendarEvent(draft, TEST_EVENT_UID, { userTimeZone: null, now, floatingTimeZone: UTC });
}

// Returns the calendar event, or fails the test if there is none.
function calendarEventOf(calendarEventResult: CalendarEventResult): CalendarEvent {
  if (!calendarEventResult.ok) {
    throw new Error(`${calendarEventResult.reason}: ${calendarEventResult.detail}`);
  }
  return calendarEventResult.calendarEvent;
}

describe("a one-off event", () => {
  it("has no event without a date", () => {
    expect(createAt(draftWith(), MON_NOON)).toMatchObject({ ok: false, reason: "no-event" });
  });

  it("has no event when the date does not exist", () => {
    const draft = draftWith({ writtenInCalendar: "persian", date: writtenDate(12, 30, 1404) });
    expect(createAt(draft, MON_NOON)).toMatchObject({ ok: false, reason: "no-event" });
  });

  it("keeps the title, location and time", () => {
    const draft = draftWith({ title: "Game night", location: "Notting Hill", date: writtenDate(9, 23, 2026) });
    expect(calendarEventOf(createAt(draft, MON_NOON))).toEqual({
      uid: TEST_EVENT_UID,
      title: "Game night",
      location: "Notting Hill",
      date: { year: 2026, month: 9, day: 23 },
      time: draft.time,
      timeZone: { kind: "from-message", timeZone: MELBOURNE },
      repeat: null,
      wrongWeekday: null,
      inPast: false,
    });
  });
});

describe("the Persian game night message", () => {
  // The answer for "🎲 گیم‌نایت شنبه ۲۶ سپتامبر …": Saturday 26 Sep, no year.
  const gameNight = draftWith({ title: "گیم‌نایت", date: writtenDate(9, 26, null, "SA") });

  it("lands on Saturday 26 September 2026, in the past, with the weekday matching", () => {
    const calendarEvent = calendarEventOf(createAt(gameNight, SUN_SEP_27_2026));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 9, day: 26 });
    expect(calendarEvent.inPast).toBe(true);
    expect(calendarEvent.wrongWeekday).toBeNull();
  });

  it("without the weekday, uses the current year too", () => {
    const calendarEvent = calendarEventOf(createAt(draftWith({ date: writtenDate(9, 26) }), SUN_SEP_27_2026));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 9, day: 26 });
    expect(calendarEvent.inPast).toBe(true);
  });
});

describe("a weekday that does not match the date", () => {
  const mondayJan20 = (year: number | null = null) => draftWith({ timeZone: UTC, date: writtenDate(1, 20, year, "MO") });

  it("in December 2026, goes to 20 Jan 2026 and keeps the written weekday", () => {
    const calendarEvent = calendarEventOf(createAt(mondayJan20(), DEC_15_2026));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 1, day: 20 });
    expect(calendarEvent.inPast).toBe(true);
    expect(calendarEvent.wrongWeekday).toBe("MO");
  });

  it("on 1 Feb 2026, also goes to 20 Jan 2026, twelve days back", () => {
    const calendarEvent = calendarEventOf(createAt(mondayJan20(), FEB_1_2026));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 1, day: 20 });
    expect(calendarEvent.wrongWeekday).toBe("MO");
  });

  it("is caught when the message writes the year too", () => {
    expect(calendarEventOf(createAt(mondayJan20(2026), FEB_1_2026)).wrongWeekday).toBe("MO");
  });

  it("is not flagged for a repeating event, whose weekdays follow the pattern", () => {
    const draft = { ...mondayJan20(2026), repeat: WEEKLY_ON_THURSDAY };
    expect(calendarEventOf(createAt(draft, FEB_1_2026)).wrongWeekday).toBeNull();
  });
});

describe("a date in another calendar, written without a year", () => {
  // Sunday 27 September 2026 = 5 Mehr 1405. 9 Mehr 1405 = Thursday 1 Oct 2026;
  // 9 Mehr 1406 = Friday 1 Oct 2027.
  const MEHR_5_1405 = new Date("2026-09-27T04:00:00Z");
  // An online film meetup on Thursday 9 Mehr at 19:00, with no year and no
  // time zone (the dev logs, 27 Sep 2026).
  const filmNight = (weekday: Weekday | null) =>
    draftWith({ writtenInCalendar: "persian", timeZone: null, location: "گوگل‌میت", date: writtenDate(7, 9, null, weekday) });

  it("is 1 October 2026 for Thursday 9 Mehr", () => {
    const calendarEvent = calendarEventOf(createAt(filmNight("TH"), MEHR_5_1405));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 10, day: 1 });
    expect(calendarEvent.inPast).toBe(false);
    expect(calendarEvent.wrongWeekday).toBeNull();
  });

  it("takes the next Persian year when that is where the weekday fits", () => {
    expect(calendarEventOf(createAt(filmNight("FR"), MEHR_5_1405)).date).toEqual({ year: 2027, month: 10, day: 1 });
  });

  it("without a weekday, uses the current Persian year", () => {
    expect(calendarEventOf(createAt(filmNight(null), MEHR_5_1405)).date).toEqual({ year: 2026, month: 10, day: 1 });
  });

  it("with a weekday no nearby year fits, uses the current Persian year and flags it", () => {
    const calendarEvent = calendarEventOf(createAt(filmNight("MO"), MEHR_5_1405));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 10, day: 1 });
    expect(calendarEvent.wrongWeekday).toBe("MO");
  });

  it("places a Hebrew date: 15 Tishrei, a Saturday, is 26 September 2026", () => {
    const draft = draftWith({ writtenInCalendar: "hebrew", timeZone: timeZoneNamed("Asia/Jerusalem"), date: writtenDate(1, 15, null, "SA") });
    const calendarEvent = calendarEventOf(createAt(draft, new Date("2026-09-20T04:00:00Z")));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 9, day: 26 });
    expect(calendarEvent.wrongWeekday).toBeNull();
  });
});

describe("the event's time zone", () => {
  const LONDON = timeZoneNamed("Europe/London");
  // Returns the event time zone of a one-off event with the given message and
  // user time zones.
  const eventTimeZoneWith = (
    messageTimeZone: CalendarEventDraft["timeZone"],
    userTimeZone: CalendarEventDraft["timeZone"],
  ) =>
    calendarEventOf(
      createCalendarEvent(draftWith({ timeZone: messageTimeZone, date: writtenDate(9, 23, 2026) }), TEST_EVENT_UID, {
        userTimeZone,
        now: MON_NOON,
        floatingTimeZone: UTC,
      }),
    ).timeZone;

  it("is the time zone in the message, even when the user has one", () => {
    expect(eventTimeZoneWith(MELBOURNE, LONDON)).toEqual({ kind: "from-message", timeZone: MELBOURNE });
  });

  it("is the user's time zone when the message has none", () => {
    expect(eventTimeZoneWith(null, LONDON)).toEqual({ kind: "from-user", timeZone: LONDON });
  });

  it("is floating when neither has one", () => {
    expect(eventTimeZoneWith(null, null)).toEqual({ kind: "floating" });
  });

  it("sets which day is today, and so what is in the past", () => {
    // 20:00 UTC on 26 Sep is already 27 Sep in Melbourne.
    const now = new Date("2026-09-26T20:00:00Z");
    const sep26 = writtenDate(9, 26, 2026);
    expect(calendarEventOf(createAt(draftWith({ timeZone: MELBOURNE, date: sep26 }), now)).inPast).toBe(true);
    expect(calendarEventOf(createAt(draftWith({ timeZone: null, date: sep26 }), now)).inPast).toBe(false);
  });
});

describe("a relative date", () => {
  const tonight = relativeDate({ kind: "days-from-today", days: 0 });

  it("is counted from today, e.g. tonight on Monday 21 September", () => {
    const calendarEvent = calendarEventOf(createAt(draftWith({ date: tonight }), MON_NOON));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 9, day: 21 });
    expect(calendarEvent.inPast).toBe(false);
    expect(calendarEvent.wrongWeekday).toBeNull();
  });

  it("is counted from today in the event's time zone", () => {
    // 20:00 UTC on 26 Sep is already 27 Sep in Melbourne, but 26 Sep in London.
    const now = new Date("2026-09-26T20:00:00Z");
    expect(calendarEventOf(createAt(draftWith({ timeZone: MELBOURNE, date: tonight }), now)).date).toEqual({
      year: 2026,
      month: 9,
      day: 27,
    });
    const londonUserContext = { userTimeZone: timeZoneNamed("Europe/London"), now, floatingTimeZone: UTC };
    expect(
      calendarEventOf(createCalendarEvent(draftWith({ timeZone: null, date: tonight }), TEST_EVENT_UID, londonUserContext)).date,
    ).toEqual({ year: 2026, month: 9, day: 26 });
  });

  it("needs a time zone: without one, today is unknown", () => {
    expect(createAt(draftWith({ timeZone: null, date: tonight }), MON_NOON)).toMatchObject({
      ok: false,
      reason: "time-zone-needed",
    });
    const weeklyFromTomorrow = draftWith({
      timeZone: null,
      date: relativeDate({ kind: "days-from-today", days: 1 }),
      repeat: WEEKLY_ON_THURSDAY,
    });
    expect(createAt(weeklyFromTomorrow, MON_NOON)).toMatchObject({ ok: false, reason: "time-zone-needed" });
  });

  it("needs no time zone for a written date", () => {
    expect(createAt(draftWith({ timeZone: null, date: writtenDate(9, 23, 2026) }), MON_NOON)).toMatchObject({ ok: true });
  });

  it("finds next Friday in the week after today's", () => {
    const nextFriday = relativeDate({ kind: "weekday", weekday: "FR", week: "next" });
    expect(calendarEventOf(createAt(draftWith({ date: nextFriday }), MON_NOON)).date).toEqual({ year: 2026, month: 10, day: 2 });
  });

  it("starts a repeat, e.g. every Thursday from next week", () => {
    const nextThursday = relativeDate({ kind: "weekday", weekday: "TH", week: "next" });
    const draft = draftWith({ date: nextThursday, repeat: WEEKLY_ON_THURSDAY });
    expect(calendarEventOf(createAt(draft, MON_NOON)).date).toEqual({ year: 2026, month: 10, day: 1 });
  });
});

describe("a repeating event: the first date", () => {
  const weekly =(overrides: Partial<CalendarEventDraft> = {}) => draftWith({ repeat: WEEKLY_ON_THURSDAY, ...overrides });

  it("with no start date, is the next matching day from today", () => {
    const calendarEvent = calendarEventOf(createAt(weekly(), MON_NOON));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 9, day: 24 });
    expect(calendarEvent.repeat).toEqual(WEEKLY_ON_THURSDAY);
    expect(calendarEvent.inPast).toBe(false);
  });

  it("is today if the event has not started yet", () => {
    expect(calendarEventOf(createAt(weekly(), THU_5PM)).date).toEqual({ year: 2026, month: 9, day: 24 });
  });

  it("is next week if today's event has already started", () => {
    expect(calendarEventOf(createAt(weekly(), THU_8PM)).date).toEqual({ year: 2026, month: 10, day: 1 });
  });

  it("moves a start date that does not fit the pattern to the next date that does", () => {
    // 26 Sep 2026 is a Saturday; the pattern is Thursdays.
    expect(calendarEventOf(createAt(weekly({ date: writtenDate(9, 26, 2026) }), MON_NOON)).date).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
  });

  it("finds the first Friday of the next matching month", () => {
    const draft = draftWith({
      date: writtenDate(12, 5, 2026),
      repeat: {
        pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] } },
        end: { kind: "never" },
      },
    });
    expect(calendarEventOf(createAt(draft, MON_NOON)).date).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it("finds a fixed day of the month, with no start date", () => {
    const draft = draftWith({
      repeat: { pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 15 } }, end: { kind: "never" } },
    });
    expect(calendarEventOf(createAt(draft, MON_NOON)).date).toEqual({ year: 2026, month: 10, day: 15 });
  });
});

describe("a repeating event: the end date", () => {
  const untilDate = (month: number, day: number, year: number | null = null): Repeat<WrittenEndDate> => ({
    ...WEEKLY_ON_THURSDAY,
    end: { kind: "until", date: { year, month, day } },
  });
  // Starts on Thursday 24 Sep 2026.
  const startingSep24 = (repeat: Repeat<WrittenEndDate>) => draftWith({ date: writtenDate(9, 24, 2026), repeat });

  it("takes the start date's year when it has none", () => {
    expect(calendarEventOf(createAt(startingSep24(untilDate(11, 29)), MON_NOON)).repeat?.end).toEqual({
      kind: "until",
      date: { year: 2026, month: 11, day: 29 },
    });
  });

  it("takes the next year when the start date's year puts it before the start", () => {
    expect(calendarEventOf(createAt(startingSep24(untilDate(3, 1)), MON_NOON)).repeat?.end).toEqual({
      kind: "until",
      date: { year: 2027, month: 3, day: 1 },
    });
  });

  it("with no start date, takes today's year", () => {
    expect(calendarEventOf(createAt(draftWith({ repeat: untilDate(11, 29) }), MON_NOON)).repeat?.end).toEqual({
      kind: "until",
      date: { year: 2026, month: 11, day: 29 },
    });
  });

  it("declines an end date before the first date", () => {
    expect(createAt(startingSep24(untilDate(9, 1, 2026)), MON_NOON)).toMatchObject({
      ok: false,
      reason: "repeat-declined",
      detail: expect.stringMatching(/before the first date/),
    });
  });

  it("has no event when the end date does not exist", () => {
    expect(createAt(startingSep24(untilDate(2, 30, 2027)), MON_NOON)).toMatchObject({ ok: false, reason: "no-event" });
  });
});

describe("a repeating event that cannot be trusted", () => {
  it.each([
    ["an interval of 0", draftWith({ repeat: { ...WEEKLY_ON_THURSDAY, pattern: { frequency: "weekly", interval: 0, weekdays: ["TH"] } } })],
    ["no start date and no weekdays", draftWith({ repeat: { ...WEEKLY_ON_THURSDAY, pattern: { frequency: "weekly", interval: 1, weekdays: [] } } })],
  ])("is declined: %s", (_, draft) => {
    expect(createAt(draft, MON_NOON)).toMatchObject({ ok: false, reason: "repeat-declined" });
  });

  it("is declined in any calendar, once its dates are converted", () => {
    const draft = draftWith({
      writtenInCalendar: "persian",
      repeat: { pattern: { frequency: "weekly", interval: 0, weekdays: ["TH"] }, end: { kind: "never" } },
    });
    expect(createAt(draft, MON_NOON)).toEqual({ ok: false, reason: "repeat-declined", detail: "invalid interval 0" });
  });
});

describe("the Persian radio programme", () => {
  // Every night at 20:00 Melbourne time, from Wednesday 1 Mehr 1405 (23 Sep
  // 2026).
  const dailyRadio = draftWith({
    title: "جام جهان‌نما",
    timeZone: MELBOURNE,
    time: { kind: "timed", start: { hour: 20, minute: 0 }, end: { hour: 21, minute: 0 } },
    date: writtenDate(9, 23, 2026),
    repeat: { pattern: { frequency: "daily", interval: 1 }, end: { kind: "never" } },
    confidence: 0.9,
  });
  const jalaliRadio = { ...dailyRadio, writtenInCalendar: "persian" as const, date: writtenDate(7, 1, 1405) };

  it("gives the same event for the Persian date as for the Gregorian one", () => {
    const calendarEvent = calendarEventOf(createAt(jalaliRadio, MON_NOON));
    expect(calendarEvent.date).toEqual({ year: 2026, month: 9, day: 23 });
    expect(calendarEvent).toEqual(calendarEventOf(createAt(dailyRadio, MON_NOON)));
  });

  it("gives a Persian date with no year the current Persian year", () => {
    const withoutYear = { ...jalaliRadio, date: writtenDate(7, 1) };
    expect(calendarEventOf(createAt(withoutYear, MON_NOON))).toEqual(calendarEventOf(createAt(jalaliRadio, MON_NOON)));
  });

  it("has no event for a monthly repeat in the Persian calendar", () => {
    const monthly = {
      ...jalaliRadio,
      repeat: { pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 1 } }, end: { kind: "never" } },
    } satisfies CalendarEventDraft;
    expect(createAt(monthly, MON_NOON)).toMatchObject({ ok: false, reason: "no-event" });
  });
});
