import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareDates,
  daysInMonth,
  existingDate,
  isWeekday,
  weekdayOf,
} from "../../../../src/generic/date-time/date-only";

describe("date-only", () => {
  it("finds a date's weekday", () => {
    expect(weekdayOf({ year: 2026, month: 9, day: 26 })).toBe("SA");
  });

  it("adds days and months across a month or a year", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addMonths({ year: 2027, month: 1, day: 2 }, -2)).toEqual({ year: 2026, month: 11, day: 2 });
  });

  it("compares dates", () => {
    expect(compareDates({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 1, day: 2 })).toBeLessThan(0);
    expect(compareDates({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 1, day: 1 })).toBe(0);
  });

  it("returns null for a date that does not exist", () => {
    expect(existingDate(2026, 2, 29)).toBeNull();
    expect(existingDate(2028, 2, 29)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("counts the days in a month", () => {
    expect(daysInMonth({ year: 2028, month: 2, day: 1 })).toBe(29);
  });

  it("knows the weekday codes", () => {
    expect(isWeekday("MO")).toBe(true);
    expect(isWeekday("Monday")).toBe(false);
  });
});
