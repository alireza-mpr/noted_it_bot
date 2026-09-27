import { describe, expect, it } from "vitest";
import { fromGregorian, toGregorian } from "../../../../src/generic/date-time/calendar-conversion";

describe("toGregorian", () => {
  it.each([
    // Nowruz (1 Farvardin), 1 Mehr, and the last day of a leap Esfand.
    ["persian", 1403, 12, 30, "2025-3-20"],
    ["persian", 1405, 1, 1, "2026-3-21"],
    ["persian", 1405, 7, 1, "2026-9-23"],
    // Rosh Hashanah 5786.
    ["hebrew", 5786, 1, 1, "2025-9-23"],
    ["gregory", 2026, 9, 23, "2026-9-23"],
  ] as const)("converts %s %i-%i-%i to %s", (calendar, year, month, day, expected) => {
    const gregorianDate = toGregorian(calendar, { year, month, day });
    expect(gregorianDate && `${gregorianDate.year}-${gregorianDate.month}-${gregorianDate.day}`).toBe(expected);
  });

  it("returns null for a day that does not exist (1404 is a common year)", () => {
    expect(toGregorian("persian", { year: 1404, month: 12, day: 30 })).toBeNull();
    expect(toGregorian("gregory", { year: 2026, month: 2, day: 29 })).toBeNull();
  });
});

describe("fromGregorian", () => {
  it("converts a Gregorian date to the calendar", () => {
    expect(fromGregorian("persian", { year: 2026, month: 9, day: 27 })).toEqual({ year: 1405, month: 7, day: 5 });
  });
});
