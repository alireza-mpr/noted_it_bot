import { describe, expect, it } from "vitest";
import type { DateOnly } from "../../../../src/generic/date-time/date-only";
import { dateOfRelativeDate } from "../../../../src/domain/calendar-event/relative-date-rule";

const WED_SEP_30_2026: DateOnly = { year: 2026, month: 9, day: 30 };
const SAT_OCT_3_2026: DateOnly = { year: 2026, month: 10, day: 3 };
const SUN_OCT_4_2026: DateOnly = { year: 2026, month: 10, day: 4 };
const FRI_OCT_2_2026: DateOnly = { year: 2026, month: 10, day: 2 };
const FRI_OCT_9_2026: DateOnly = { year: 2026, month: 10, day: 9 };

describe("dateOfRelativeDate, days from today", () => {
  it("counts today, tomorrow and the day after tomorrow, into the next month", () => {
    expect(dateOfRelativeDate({ kind: "days-from-today", days: 0 }, WED_SEP_30_2026)).toEqual(WED_SEP_30_2026);
    expect(dateOfRelativeDate({ kind: "days-from-today", days: 1 }, WED_SEP_30_2026)).toEqual({ year: 2026, month: 10, day: 1 });
    expect(dateOfRelativeDate({ kind: "days-from-today", days: 2 }, WED_SEP_30_2026)).toEqual(FRI_OCT_2_2026);
  });
});

describe("dateOfRelativeDate, a weekday this week", () => {
  it("finds the coming weekday", () => {
    expect(dateOfRelativeDate({ kind: "weekday", weekday: "FR", week: "this" }, WED_SEP_30_2026)).toEqual(FRI_OCT_2_2026);
  });

  it("counts today when today is that weekday", () => {
    expect(dateOfRelativeDate({ kind: "weekday", weekday: "WE", week: "this" }, WED_SEP_30_2026)).toEqual(WED_SEP_30_2026);
  });

  it("finds a weekday that has passed this week in the next week, e.g. Monday on a Wednesday", () => {
    expect(dateOfRelativeDate({ kind: "weekday", weekday: "MO", week: "this" }, WED_SEP_30_2026)).toEqual({
      year: 2026,
      month: 10,
      day: 5,
    });
  });
});

describe("dateOfRelativeDate, a weekday next week", () => {
  it("finds the weekday in the week after today's, which starts on Monday", () => {
    const nextFriday = { kind: "weekday", weekday: "FR", week: "next" } as const;
    expect(dateOfRelativeDate(nextFriday, WED_SEP_30_2026)).toEqual(FRI_OCT_9_2026);
    expect(dateOfRelativeDate(nextFriday, SAT_OCT_3_2026)).toEqual(FRI_OCT_9_2026);
    expect(dateOfRelativeDate(nextFriday, SUN_OCT_4_2026)).toEqual(FRI_OCT_9_2026);
  });

  it("finds a week later when today is that weekday", () => {
    expect(dateOfRelativeDate({ kind: "weekday", weekday: "WE", week: "next" }, WED_SEP_30_2026)).toEqual({
      year: 2026,
      month: 10,
      day: 7,
    });
  });

  it("finds tomorrow for next Monday on a Sunday", () => {
    expect(dateOfRelativeDate({ kind: "weekday", weekday: "MO", week: "next" }, SUN_OCT_4_2026)).toEqual({
      year: 2026,
      month: 10,
      day: 5,
    });
  });
});
