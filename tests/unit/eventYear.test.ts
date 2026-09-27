import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "../../src/legacy/extractedEvents/calendarEvent";
import type { ExtractedEvent } from "../../src/legacy/extractedEvents/extractedEvent";

// Sunday 27 September 2026. 26 Sep 2026 is a Saturday, 2027 a Sunday, 2025 a Friday.
const NOW = new Date("2026-09-27T02:00:00Z");
// 20 January is a Monday in 2025, a Tuesday in 2026 and a Wednesday in 2027.
const DEC_2026 = new Date("2026-12-15T02:00:00Z");
const FEB_2026 = new Date("2026-02-01T02:00:00Z");

// The year a date written without one lands in, through the whole build.
function yearOf(month: number, day: number, weekday: ExtractedEvent["weekday"], now: Date): number {
  const built = buildCalendarEvent(
    {
      title: "Event", calendar: "gregorian", date_kind: "absolute", year: null, month, day, weekday,
      start_time: "18:00", end_time: null, timezone_hint: "UTC", location: null, recurrence: null, confidence: 0.9,
    },
    "u",
    "en",
    now,
  )!;
  return Number(built.icsContent.match(/DTSTART;TZID=UTC:(\d{4})/)![1]);
}

describe("the year of a date written without one", () => {
  it("without a weekday, is the current year, even for a date that has passed", () => {
    expect(yearOf(9, 26, null, NOW)).toBe(2026);
    expect(yearOf(10, 5, null, NOW)).toBe(2026);
  });

  it("is this year or next year, whichever the stated weekday fits", () => {
    expect(yearOf(9, 26, "SA", NOW)).toBe(2026);
    expect(yearOf(9, 26, "SU", NOW)).toBe(2027);
  });

  it("is last year only for a date within the last two months", () => {
    // 26 Dec 2026 is a Saturday, a week before 2 Jan 2027.
    expect(yearOf(12, 26, "SA", new Date("2027-01-02T02:00:00Z"))).toBe(2026);
    // 26 Sep 2025 is a Friday, but a year ago: too old, so the current year.
    expect(yearOf(9, 26, "FR", NOW)).toBe(2026);
  });

  it("falls back to the current year when no allowed year fits the weekday", () => {
    // "Monday Jan 20" only fits 2025, which is too far back in both cases.
    expect(yearOf(1, 20, "MO", DEC_2026)).toBe(2026);
    expect(yearOf(1, 20, "MO", FEB_2026)).toBe(2026);
  });
});

describe("the Persian game night message", () => {
  // The provider's answer for "🎲 گیم‌نایت شنبه ۲۶ سپتامبر …", plus the weekday it states.
  const extracted: ExtractedEvent = {
    title: "گیم‌نایت",
    calendar: "Gregorian",
    date_kind: "absolute",
    year: null,
    month: 9,
    day: 26,
    weekday: "SA",
    start_time: "18:00",
    end_time: "21:30",
    timezone_hint: "Australia/Melbourne",
    location: "Notting Hill Neighbourhood House",
    recurrence: null,
    confidence: 1,
  };

  it("lands on Saturday 26 September 2026, flagged as past, weekday matching", () => {
    const built = buildCalendarEvent(extracted, "uid@test", "fa", NOW)!;
    expect(built.icsContent).toContain("DTSTART;TZID=Australia/Melbourne:20260926T180000");
    expect(built.inPast).toBe(true);
    expect(built.weekdayMismatch).toBeNull();
  });

  it("without the weekday, uses the current year too", () => {
    const built = buildCalendarEvent({ ...extracted, weekday: null }, "uid@test", "fa", NOW)!;
    expect(built.icsContent).toContain("DTSTART;TZID=Australia/Melbourne:20260926T180000");
    expect(built.inPast).toBe(true);
  });
});

describe("a weekday that doesn't match the date", () => {
  const mondayJan20 = (overrides: Partial<ExtractedEvent> = {}): ExtractedEvent => ({
    title: "Event",
    calendar: "gregorian",
    date_kind: "absolute",
    year: null,
    month: 1,
    day: 20,
    weekday: "MO",
    start_time: "18:00",
    end_time: null,
    timezone_hint: "UTC",
    location: null,
    recurrence: null,
    confidence: 0.9,
    ...overrides,
  });

  it("in December 2026, goes to 20 Jan 2026 and names both weekdays", () => {
    const built = buildCalendarEvent(mondayJan20(), "u", "en", DEC_2026)!;
    expect(built.icsContent).toContain("DTSTART;TZID=UTC:20260120T180000");
    expect(built.inPast).toBe(true);
    expect(built.weekdayMismatch).toEqual({ statedWeekday: "Monday", date: "Jan 20, 2026", realWeekday: "Tuesday" });
  });

  it("on 1 Feb 2026, also goes to 20 Jan 2026, twelve days back", () => {
    const built = buildCalendarEvent(mondayJan20(), "u", "en", FEB_2026)!;
    expect(built.icsContent).toContain("DTSTART;TZID=UTC:20260120T180000");
    expect(built.inPast).toBe(true);
    expect(built.weekdayMismatch?.realWeekday).toBe("Tuesday");
  });

  it("is caught when the message states the year too", () => {
    const built = buildCalendarEvent(mondayJan20({ year: 2026 }), "u", "en", FEB_2026)!;
    expect(built.weekdayMismatch).toEqual({ statedWeekday: "Monday", date: "Jan 20, 2026", realWeekday: "Tuesday" });
  });

  it("names the weekdays in the reply language, on the Gregorian calendar", () => {
    const built = buildCalendarEvent(mondayJan20({ year: 2026 }), "u", "fa", FEB_2026)!;
    expect(built.weekdayMismatch?.statedWeekday).toBe("دوشنبه");
    expect(built.weekdayMismatch?.realWeekday).toBe("سه‌شنبه");
    expect(built.weekdayMismatch?.date).toContain("۲۰۲۶");
  });

  it("isn't flagged for a recurring event, whose weekdays follow the pattern", () => {
    const built = buildCalendarEvent(
      mondayJan20({
        year: 2026,
        recurrence: {
          frequency: "weekly", interval: 1, weekdays: ["MO"], ordinal: null, month_day: null,
          end_kind: "never", until_year: null, until_month: null, until_day: null, count: null,
        },
      }),
      "u",
      "en",
      FEB_2026,
    )!;
    expect(built.weekdayMismatch).toBeNull();
  });
});

// Sunday 27 September 2026 = 5 Mehr 1405. 9 Mehr 1405 = Thursday 1 October 2026;
// 9 Mehr 1406 = Friday 1 October 2027.
const MEHR_5_1405 = new Date("2026-09-27T04:00:00Z");

// The provider's answer to a Persian announcement: an online film-analysis
// meetup on Thursday 9 Mehr at 19:00, with no year (the dev logs, 27 Sep 2026).
const FILM_NIGHT: ExtractedEvent = {
  title: "دورهمی آنلاین تحلیل فیلم زیبایی آمریکایی",
  calendar: "Solar Hijri",
  date_kind: "absolute",
  year: null,
  month: 7,
  day: 9,
  weekday: "TH",
  start_time: "19:00",
  end_time: null,
  timezone_hint: null,
  location: "گوگل‌میت",
  recurrence: null,
  confidence: 1,
};

describe("a date in another calendar, written without a year", () => {
  it("is no longer declined: 9 Mehr, a Thursday, is 1 October 2026", () => {
    const built = buildCalendarEvent(FILM_NIGHT, "u", "fa", MEHR_5_1405)!;
    expect(built).not.toBeNull();
    expect(built.icsContent).toContain("DTSTART:20261001T190000");
    expect(built.inPast).toBe(false);
    expect(built.weekdayMismatch).toBeNull();
  });

  it("takes next Persian year when that's where the weekday fits", () => {
    const built = buildCalendarEvent({ ...FILM_NIGHT, weekday: "FR" }, "u", "fa", MEHR_5_1405)!;
    expect(built.icsContent).toContain("DTSTART:20271001T190000");
  });

  it("without a weekday, uses the current Persian year", () => {
    const built = buildCalendarEvent({ ...FILM_NIGHT, weekday: null }, "u", "fa", MEHR_5_1405)!;
    expect(built.icsContent).toContain("DTSTART:20261001T190000");
  });

  it("with a weekday no nearby year fits, uses the current Persian year and flags it", () => {
    const built = buildCalendarEvent({ ...FILM_NIGHT, weekday: "MO" }, "u", "en", MEHR_5_1405)!;
    expect(built.icsContent).toContain("DTSTART:20261001T190000");
    expect(built.weekdayMismatch).toEqual({ statedWeekday: "Monday", date: "Oct 1, 2026", realWeekday: "Thursday" });
  });

  it("places a Hebrew date with no year: 15 Tishrei, a Saturday, is 26 September 2026", () => {
    const built = buildCalendarEvent(
      { ...FILM_NIGHT, calendar: "hebrew", month: 1, day: 15, weekday: "SA", timezone_hint: "Asia/Jerusalem" },
      "u",
      "en",
      new Date("2026-09-20T04:00:00Z"),
    )!;
    expect(built.icsContent).toContain("DTSTART;TZID=Asia/Jerusalem:20260926T190000");
    expect(built.weekdayMismatch).toBeNull();
  });
});
