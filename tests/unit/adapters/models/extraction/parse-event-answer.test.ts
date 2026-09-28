import { describe, expect, it } from "vitest";
import type { EventAnswer, RecurrenceAnswer } from "../../../../../src/adapters/models/extraction/event-answer-schema";
import { parseEventAnswer, type DraftResult } from "../../../../../src/adapters/models/extraction/parse-event-answer";
import type { CalendarEventDraft } from "../../../../../src/domain/calendar-event/calendar-event-draft";

// "Game night, Saturday 26 September, 6 to 9:30pm, at Notting Hill Neighbourhood House".
const GAME_NIGHT_ANSWER: EventAnswer = {
  title: "Game night",
  calendar: "gregorian",
  date_kind: "absolute",
  year: null,
  month: 9,
  day: 26,
  weekday: "SA",
  relative_date: null,
  start_time: "18:00",
  end_time: "21:30",
  timezone_hint: null,
  location: "Notting Hill Neighbourhood House",
  recurrence: null,
  confidence: 0.95,
};

const WEEKLY_ON_TUESDAY: RecurrenceAnswer = {
  frequency: "weekly",
  interval: 1,
  weekdays: ["TU"],
  ordinal: null,
  month_day: null,
  end_kind: "never",
  until_year: null,
  until_month: null,
  until_day: null,
  count: null,
};

// "Yoga every Tuesday at 6pm": a repeat with no date.
const YOGA_ANSWER: EventAnswer = {
  ...GAME_NIGHT_ANSWER,
  title: "Yoga",
  calendar: null,
  date_kind: "weekday",
  month: null,
  day: null,
  weekday: null,
  start_time: "18:00",
  end_time: null,
  location: null,
  recurrence: WEEKLY_ON_TUESDAY,
};

function parsedAnswer(eventAnswer: EventAnswer): DraftResult {
  return parseEventAnswer(JSON.stringify(eventAnswer));
}

// Returns the draft, or fails the test if there is none.
function draftOf(eventAnswer: EventAnswer): CalendarEventDraft {
  const draftResult = parsedAnswer(eventAnswer);
  if (!draftResult.ok) {
    throw new Error(`${draftResult.reason}: ${draftResult.detail}`);
  }
  return draftResult.draft;
}

function repeatOf(recurrenceAnswer: Partial<RecurrenceAnswer>) {
  return draftOf({ ...YOGA_ANSWER, recurrence: { ...WEEKLY_ON_TUESDAY, ...recurrenceAnswer } }).repeat;
}

describe("parseEventAnswer", () => {
  it("turns a one-off answer into a draft", () => {
    expect(draftOf(GAME_NIGHT_ANSWER)).toEqual({
      title: "Game night",
      location: "Notting Hill Neighbourhood House",
      writtenInCalendar: "gregory",
      date: { kind: "written", writtenDate: { year: null, month: 9, day: 26, weekday: "SA" } },
      time: { kind: "timed", start: { hour: 18, minute: 0 }, end: { hour: 21, minute: 30 } },
      timeZone: null,
      repeat: null,
      confidence: 0.95,
    });
  });

  it("keeps a missing title as null", () => {
    expect(draftOf({ ...GAME_NIGHT_ANSWER, title: null }).title).toBeNull();
  });

  it("ends an hour later when no end time is stated", () => {
    expect(draftOf({ ...GAME_NIGHT_ANSWER, end_time: null }).time).toEqual({
      kind: "timed",
      start: { hour: 18, minute: 0 },
      end: { hour: 19, minute: 0 },
    });
  });

  it("accepts seconds in a time, which Gemini sometimes adds", () => {
    expect(draftOf({ ...GAME_NIGHT_ANSWER, start_time: "17:00:00", end_time: "19:00:00" }).time).toEqual({
      kind: "timed",
      start: { hour: 17, minute: 0 },
      end: { hour: 19, minute: 0 },
    });
  });

  it("gives no event for a time that is not HH:MM", () => {
    expect(parsedAnswer({ ...GAME_NIGHT_ANSWER, start_time: "8pm" })).toMatchObject({ ok: false, reason: "no-event" });
    expect(parsedAnswer({ ...GAME_NIGHT_ANSWER, end_time: "25:00" })).toMatchObject({ ok: false, reason: "no-event" });
  });

  it("gives a one-off event no date unless the date is absolute", () => {
    expect(draftOf({ ...GAME_NIGHT_ANSWER, date_kind: "weekday" }).date).toBeNull();
  });

  it("reads the message time zone, and gives no event for one that does not exist", () => {
    expect(draftOf({ ...GAME_NIGHT_ANSWER, timezone_hint: "Australia/Melbourne" }).timeZone).toBe("Australia/Melbourne");
    expect(draftOf({ ...GAME_NIGHT_ANSWER, timezone_hint: "Australia/Victoria" }).timeZone).toBe("Australia/Melbourne");
    expect(parsedAnswer({ ...GAME_NIGHT_ANSWER, timezone_hint: "AUS Eastern Standard Time" })).toMatchObject({
      ok: false,
      reason: "no-event",
    });
  });

  it("reads fields that Gemini leaves out as null", () => {
    expect(parseEventAnswer('{"calendar": null, "date_kind": "none", "confidence": 0.2}')).toMatchObject({
      ok: true,
      draft: { title: null, date: null, time: { kind: "all-day" }, timeZone: null, repeat: null },
    });
  });
});

describe("parseEventAnswer, a relative date", () => {
  // "Tonight dinner with Sam at 7pm".
  const TONIGHT_ANSWER: EventAnswer = {
    ...GAME_NIGHT_ANSWER,
    title: "Dinner with Sam",
    calendar: null,
    date_kind: "relative",
    month: null,
    day: null,
    weekday: null,
    relative_date: { days_from_today: 0, weekday: null, which_week: null },
    start_time: "19:00",
    end_time: null,
    location: null,
  };

  it("reads a number of days from today", () => {
    expect(draftOf(TONIGHT_ANSWER).date).toEqual({ kind: "relative", relativeDate: { kind: "days-from-today", days: 0 } });
    const dayAfterTomorrowAnswer = { ...TONIGHT_ANSWER, relative_date: { days_from_today: 2, weekday: null, which_week: null } };
    expect(draftOf(dayAfterTomorrowAnswer).date).toEqual({ kind: "relative", relativeDate: { kind: "days-from-today", days: 2 } });
  });

  it("reads a weekday with which week it is in", () => {
    const nextFridayAnswer: EventAnswer = { ...TONIGHT_ANSWER, relative_date: { days_from_today: null, weekday: "FR", which_week: "next" } };
    expect(draftOf(nextFridayAnswer).date).toEqual({ kind: "relative", relativeDate: { kind: "weekday", weekday: "FR", week: "next" } });
  });

  it("reads the start of a repeat", () => {
    const everyFridayFromTomorrowAnswer: EventAnswer = {
      ...TONIGHT_ANSWER,
      relative_date: { days_from_today: 1, weekday: null, which_week: null },
      recurrence: { ...WEEKLY_ON_TUESDAY, weekdays: ["FR"] },
    };
    expect(draftOf(everyFridayFromTomorrowAnswer).date).toEqual({
      kind: "relative",
      relativeDate: { kind: "days-from-today", days: 1 },
    });
  });

  it("gives no event for a relative date the model does not describe, e.g. this weekend", () => {
    expect(parsedAnswer({ ...TONIGHT_ANSWER, relative_date: null })).toMatchObject({
      ok: false,
      reason: "no-event",
      detail: "a relative date the bot does not read yet",
    });
  });

  it("gives no event for days before today or after the day after tomorrow", () => {
    for (const daysFromToday of [-1, 3]) {
      const relativeDateAnswer = { days_from_today: daysFromToday, weekday: null, which_week: null };
      expect(parsedAnswer({ ...TONIGHT_ANSWER, relative_date: relativeDateAnswer })).toMatchObject({ ok: false, reason: "no-event" });
    }
  });

  it("gives no event for an unclear relative date", () => {
    const unclearAnswers: EventAnswer["relative_date"][] = [
      { days_from_today: 1, weekday: "FR", which_week: "this" },
      { days_from_today: null, weekday: "FR", which_week: null },
      { days_from_today: null, weekday: null, which_week: "next" },
    ];
    for (const relativeDateAnswer of unclearAnswers) {
      expect(parsedAnswer({ ...TONIGHT_ANSWER, relative_date: relativeDateAnswer })).toMatchObject({
        ok: false,
        reason: "no-event",
        detail: "an unclear relative date",
      });
    }
  });

  it("finds an answer unusable when which week is neither this nor next", () => {
    const lastFridayJson = JSON.stringify({ ...TONIGHT_ANSWER, relative_date: { days_from_today: null, weekday: "FR", which_week: "last" } });
    expect(parseEventAnswer(lastFridayJson)).toMatchObject({ ok: false, reason: "unusable-answer" });
  });
});

describe("parseEventAnswer, the calendar", () => {
  it("names the calendar the date is written in", () => {
    expect(draftOf({ ...GAME_NIGHT_ANSWER, calendar: "Solar Hijri", year: 1405, month: 7, day: 1 }).writtenInCalendar).toBe(
      "persian",
    );
  });

  it("gives no event for a calendar the bot does not accept", () => {
    expect(parsedAnswer({ ...GAME_NIGHT_ANSWER, calendar: "Hijri" })).toMatchObject({ ok: false, reason: "no-event" });
  });

  it("gives no event for a date with no calendar, rather than guessing Gregorian", () => {
    expect(parsedAnswer({ ...GAME_NIGHT_ANSWER, calendar: null })).toMatchObject({
      ok: false,
      reason: "no-event",
      detail: "a date with no calendar",
    });
  });

  it("gives no event for a repeat end date with no calendar", () => {
    const untilWithNoCalendar = { ...WEEKLY_ON_TUESDAY, end_kind: "until" as const, until_month: 11, until_day: 29 };
    expect(parsedAnswer({ ...YOGA_ANSWER, recurrence: untilWithNoCalendar })).toMatchObject({ ok: false, reason: "no-event" });
    expect(draftOf({ ...YOGA_ANSWER, calendar: "gregorian", recurrence: untilWithNoCalendar }).repeat?.end).toEqual({
      kind: "until",
      date: { year: null, month: 11, day: 29 },
    });
  });

  it("uses Gregorian for a pattern with no date: there is nothing to convert", () => {
    const draft = draftOf(YOGA_ANSWER);
    expect(draft.writtenInCalendar).toBe("gregory");
    expect(draft.date).toBeNull();
  });
});

describe("parseEventAnswer, repeats", () => {
  it("reads a weekly repeat on weekdays", () => {
    expect(repeatOf({})).toEqual({
      pattern: { frequency: "weekly", interval: 1, weekdays: ["TU"] },
      end: { kind: "never" },
    });
  });

  it("reads a monthly repeat on a weekday of a week, the first or the last", () => {
    expect(repeatOf({ frequency: "monthly", weekdays: ["FR"], ordinal: 1 })?.pattern).toEqual({
      frequency: "monthly",
      interval: 1,
      dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] },
    });
    expect(repeatOf({ frequency: "monthly", weekdays: ["FR"], ordinal: -1 })?.pattern).toMatchObject({
      dayOfMonth: { week: "last" },
    });
  });

  it("reads a monthly repeat on a fixed day, or on the day of the first date", () => {
    expect(repeatOf({ frequency: "monthly", weekdays: null, month_day: 15 })?.pattern).toMatchObject({
      dayOfMonth: { kind: "fixed-day", day: 15 },
    });
    expect(repeatOf({ frequency: "monthly", weekdays: null })?.pattern).toMatchObject({
      dayOfMonth: { kind: "same-as-first-date" },
    });
  });

  it("reads an end after a number of times", () => {
    expect(repeatOf({ end_kind: "count", count: 6 })?.end).toEqual({ kind: "after", times: 6 });
  });

  it("keeps the start date of a repeat", () => {
    const withStartDate = { ...YOGA_ANSWER, calendar: "gregorian", date_kind: "absolute" as const, month: 9, day: 27 };
    expect(draftOf(withStartDate).date).toEqual({
      kind: "written",
      writtenDate: { year: null, month: 9, day: 27, weekday: null },
    });
  });

  it("gives no event for a repeat with no date kind", () => {
    expect(parsedAnswer({ ...YOGA_ANSWER, date_kind: "none" })).toMatchObject({ ok: false, reason: "no-event" });
  });

  it.each<[string, Partial<RecurrenceAnswer>]>([
    ["a monthly weekday pattern with no ordinal", { frequency: "monthly", weekdays: ["FR"] }],
    ["an ordinal on a weekly repeat", { ordinal: 1 }],
    ["an ordinal that is not a week of the month", { frequency: "monthly", weekdays: ["FR"], ordinal: 5 }],
    ["a day of the month on a weekly repeat", { month_day: 15 }],
    ["an empty list of weekdays", { weekdays: [] }],
    ["a weekday that is not one", { weekdays: ["TU", "XX"] }],
    ["an end date with no day", { end_kind: "until", until_month: 11 }],
    ["an end after no number of times", { end_kind: "count" }],
  ])("declines %s", (_description, recurrenceAnswer) => {
    const yogaInGregorian: EventAnswer = { ...YOGA_ANSWER, calendar: "gregorian" };
    expect(parsedAnswer({ ...yogaInGregorian, recurrence: { ...WEEKLY_ON_TUESDAY, ...recurrenceAnswer } })).toMatchObject({
      ok: false,
      reason: "repeat-declined",
    });
  });
});

describe("parseEventAnswer, unusable answers", () => {
  it("gives an unusable answer for text that is not JSON", () => {
    expect(parseEventAnswer("Sure! Here is the event:")).toMatchObject({ ok: false, reason: "unusable-answer" });
  });

  it.each<[string, unknown]>([
    ["a list", []],
    ["a year as text", { ...GAME_NIGHT_ANSWER, year: "2026" }],
    ["an unknown date kind", { ...GAME_NIGHT_ANSWER, date_kind: "soon" }],
    ["a weekday by name", { ...GAME_NIGHT_ANSWER, weekday: "Saturday" }],
    ["no confidence", { ...GAME_NIGHT_ANSWER, confidence: undefined }],
    ["a repeat that is not an object", { ...GAME_NIGHT_ANSWER, recurrence: "weekly" }],
  ])("gives an unusable answer for %s", (_description, answerJson) => {
    expect(parseEventAnswer(JSON.stringify(answerJson))).toMatchObject({ ok: false, reason: "unusable-answer" });
  });
});
