import { describe, expect, it } from "vitest";
import type { DateOnly, Weekday } from "../../../../src/generic/date-time/date-only";
import type { CalendarId } from "../../../../src/domain/calendar-event/calendar";
import { pickEndYear, pickYear } from "../../../../src/domain/calendar-event/year-rule";

// Sunday 27 September 2026 (5 Mehr 1405). 26 Sep 2026 is a Saturday, 2027 a
// Sunday, 2025 a Friday.
const SEP_27_2026 = { year: 2026, month: 9, day: 27 };
// 20 January is a Monday in 2025, a Tuesday in 2026 and a Wednesday in 2027.
const DEC_15_2026 = { year: 2026, month: 12, day: 15 };
const FEB_1_2026 = { year: 2026, month: 2, day: 1 };

// Returns the year the rule picks for a date written with no year.
function yearOf(
  month: number,
  day: number,
  weekday: Weekday | null,
  today: DateOnly = SEP_27_2026,
  writtenInCalendar: CalendarId = "gregory",
): number {
  return pickYear(writtenInCalendar, { year: null, month, day, weekday }, today);
}

describe("pickYear", () => {
  it("keeps the written year", () => {
    expect(pickYear("gregory", { year: 2030, month: 9, day: 26, weekday: "SU" }, SEP_27_2026)).toBe(2030);
  });

  it("without a weekday, is the current year, even for a date that has passed", () => {
    expect(yearOf(9, 26, null)).toBe(2026);
    expect(yearOf(10, 5, null)).toBe(2026);
  });

  it("is this year or next year, whichever the weekday fits", () => {
    expect(yearOf(9, 26, "SA")).toBe(2026);
    expect(yearOf(9, 26, "SU")).toBe(2027);
  });

  it("is last year only for a date within the last two months", () => {
    // 26 Dec 2026 is a Saturday, a week before 2 Jan 2027.
    expect(yearOf(12, 26, "SA", { year: 2027, month: 1, day: 2 })).toBe(2026);
    // 26 Sep 2025 is a Friday, but a year ago: too old, so the current year.
    expect(yearOf(9, 26, "FR")).toBe(2026);
  });

  it("is the current year when no allowed year fits the weekday", () => {
    // "Monday 20 Jan" fits only 2025, which is too far back in both cases.
    expect(yearOf(1, 20, "MO", DEC_15_2026)).toBe(2026);
    expect(yearOf(1, 20, "MO", FEB_1_2026)).toBe(2026);
  });

  it("counts years in the message's calendar", () => {
    // 9 Mehr 1405 is Thursday 1 Oct 2026; 9 Mehr 1406 is Friday 1 Oct 2027.
    expect(yearOf(7, 9, "TH", SEP_27_2026, "persian")).toBe(1405);
    expect(yearOf(7, 9, "FR", SEP_27_2026, "persian")).toBe(1406);
    expect(yearOf(7, 9, null, SEP_27_2026, "persian")).toBe(1405);
    expect(yearOf(7, 9, "MO", SEP_27_2026, "persian")).toBe(1405);
  });
});

describe("pickEndYear", () => {
  // Thursday 24 September 2026.
  const startDate = { year: 2026, month: 9, day: 24 };

  it("keeps the written year", () => {
    expect(pickEndYear({ year: 2030, month: 1, day: 1 }, startDate)).toBe(2030);
  });

  it("takes the start date's year when the end is after the start", () => {
    expect(pickEndYear({ year: null, month: 11, day: 29 }, startDate)).toBe(2026);
  });

  it("takes the next year when the start date's year puts the end before the start", () => {
    expect(pickEndYear({ year: null, month: 3, day: 1 }, startDate)).toBe(2027);
  });
});
