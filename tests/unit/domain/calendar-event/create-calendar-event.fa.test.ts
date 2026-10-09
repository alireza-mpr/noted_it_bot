import { describe, expect, it } from "vitest";
import type { CalendarEventDraft } from "../../../../src/domain/calendar-event/calendar-event-draft";
import { calendarEventOf, createAt, draftWith, MELBOURNE, MON_NOON, SUN_SEP_27_2026, writtenDate } from "./create-at";

// Persian messages: their drafts, as the model reads them.

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
