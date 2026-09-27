import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "../../src/extractedEvents/calendarEvent";
import type { ExtractedEvent } from "../../src/extractedEvents/extractedEvent";
import { resolveYear } from "../../src/time/timezone";

// Sunday 27 September 2026. 26 Sep 2026 is a Saturday, 2027 a Sunday, 2025 a Friday.
const NOW = new Date("2026-09-27T02:00:00Z");
// 20 January is a Monday in 2025, a Tuesday in 2026 and a Wednesday in 2027.
const DEC_2026 = new Date("2026-12-15T02:00:00Z");
const FEB_2026 = new Date("2026-02-01T02:00:00Z");

describe("resolveYear", () => {
  it("keeps a stated year", () => {
    expect(resolveYear(2031, 9, 26, "UTC", NOW, "SA")).toBe(2031);
  });

  it("without a weekday, uses the current year, even for a date that has passed", () => {
    expect(resolveYear(null, 9, 26, "UTC", NOW)).toBe(2026);
    expect(resolveYear(null, 10, 5, "UTC", NOW)).toBe(2026);
  });

  it("uses this year or next year, whichever the stated weekday fits", () => {
    expect(resolveYear(null, 9, 26, "UTC", NOW, "SA")).toBe(2026);
    expect(resolveYear(null, 9, 26, "UTC", NOW, "SU")).toBe(2027);
  });

  it("uses last year only for a date within the last two months", () => {
    // 26 Dec 2026 is a Saturday, a week before 2 Jan 2027.
    expect(resolveYear(null, 12, 26, "UTC", new Date("2027-01-02T02:00:00Z"), "SA")).toBe(2026);
    // 26 Sep 2025 is a Friday, but a year ago: too old, so the current year.
    expect(resolveYear(null, 9, 26, "UTC", NOW, "FR")).toBe(2026);
  });

  it("falls back to the current year when no allowed year fits the weekday", () => {
    // "Monday Jan 20" only fits 2025, which is too far back in both cases.
    expect(resolveYear(null, 1, 20, "UTC", DEC_2026, "MO")).toBe(2026);
    expect(resolveYear(null, 1, 20, "UTC", FEB_2026, "MO")).toBe(2026);
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
    expect(built.weekdayMismatch).toEqual({ stated: "Monday", date: "Jan 20, 2026", actual: "Tuesday" });
  });

  it("on 1 Feb 2026, also goes to 20 Jan 2026, twelve days back", () => {
    const built = buildCalendarEvent(mondayJan20(), "u", "en", FEB_2026)!;
    expect(built.icsContent).toContain("DTSTART;TZID=UTC:20260120T180000");
    expect(built.inPast).toBe(true);
    expect(built.weekdayMismatch?.actual).toBe("Tuesday");
  });

  it("is caught when the message states the year too", () => {
    const built = buildCalendarEvent(mondayJan20({ year: 2026 }), "u", "en", FEB_2026)!;
    expect(built.weekdayMismatch).toEqual({ stated: "Monday", date: "Jan 20, 2026", actual: "Tuesday" });
  });

  it("names the weekdays in the reply language, on the Gregorian calendar", () => {
    const built = buildCalendarEvent(mondayJan20({ year: 2026 }), "u", "fa", FEB_2026)!;
    expect(built.weekdayMismatch?.stated).toBe("دوشنبه");
    expect(built.weekdayMismatch?.actual).toBe("سه‌شنبه");
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
