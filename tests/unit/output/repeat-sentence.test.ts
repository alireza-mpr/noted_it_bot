import { describe, expect, it } from "vitest";
import type { Repeat } from "../../../src/domain/calendar-event/repeat";
import type { DateOnly } from "../../../src/generic/date-time/date-only";
import { repeatSentenceOf } from "../../../src/output/repeat-sentence";
import { calendarEventWith } from "./calendar-event-with";

const NEVER = { kind: "never" } as const;

// Returns the repeat sentence of an event with the given repeat.
function sentenceOf(repeat: Repeat<DateOnly>): string | null {
  return repeatSentenceOf(calendarEventWith({ repeat }));
}

describe("repeatSentenceOf", () => {
  it("is null for a one-off event", () => {
    expect(repeatSentenceOf(calendarEventWith())).toBeNull();
  });

  it("names the weekday of a weekly repeat", () => {
    expect(sentenceOf({ pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] }, end: NEVER })).toBe(
      "Repeats every Thursday",
    );
  });

  it("names several weekdays, the interval and the end date", () => {
    const repeat: Repeat<DateOnly> = {
      pattern: { frequency: "weekly", interval: 2, weekdays: ["MO", "WE"] },
      end: { kind: "until", date: { year: 2027, month: 1, day: 5 } },
    };
    expect(sentenceOf(repeat)).toBe("Repeats every 2 weeks on Monday and Wednesday, until Jan 5, 2027");
  });

  it("names the week of the month and the number of times", () => {
    const firstFriday: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] } },
      end: { kind: "after", times: 4 },
    };
    const lastFriday: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: "last", weekdays: ["FR"] } },
      end: { kind: "after", times: 1 },
    };
    expect(sentenceOf(firstFriday)).toBe("Repeats on the first Friday of every month, 4 times");
    expect(sentenceOf(lastFriday)).toBe("Repeats on the last Friday of every month, 1 time");
  });

  it("names a day of the month with an English ordinal", () => {
    for (const [day, ordinal] of [[1, "1st"], [2, "2nd"], [3, "3rd"], [11, "11th"], [12, "12th"], [22, "22nd"], [23, "23rd"], [31, "31st"]] as const) {
      const repeat: Repeat<DateOnly> = {
        pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day } },
        end: NEVER,
      };
      expect(sentenceOf(repeat)).toBe(`Repeats on the ${ordinal} of every month`);
    }
  });

  it("writes daily, weekly, monthly and yearly repeats with no named days", () => {
    expect(sentenceOf({ pattern: { frequency: "daily", interval: 1 }, end: NEVER })).toBe("Repeats every day");
    expect(sentenceOf({ pattern: { frequency: "daily", interval: 3 }, end: NEVER })).toBe("Repeats every 3 days");
    expect(sentenceOf({ pattern: { frequency: "weekly", interval: 2, weekdays: [] }, end: NEVER })).toBe("Repeats every 2 weeks");
    expect(
      sentenceOf({ pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "same-as-first-date" } }, end: NEVER }),
    ).toBe("Repeats every month");
    expect(sentenceOf({ pattern: { frequency: "yearly", interval: 1 }, end: NEVER })).toBe("Repeats every year");
  });
});
